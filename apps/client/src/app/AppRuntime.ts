/**
 * AppRuntime（Non-intrusive §7.2 阶段 5b）：应用宿主根。原 Cocos 组件 Main.ts 的全部
 * 编排逻辑（gameplay 装配 / enterBattle / startGameplay / stopGameplay / dispose 顺序）
 * **逐字迁入**本类，只改归属与接线；Main.ts 收敛为 bootstrap/update 转发/dispose。
 *
 * 职责（§7.2）：构造小型稳定 port 并管理整体 dispose，不做 feature 分支。
 *  - **app generation**：构造时经 createPageSessionScope 递增、dispose 冻结（旧世代
 *    从此不再当前），取代原 view/pages.ts 的 page lifecycle generation——它与
 *    session generation 分开校验，二者不可互推（app/appGeneration.ts）；
 *  - 组合 FeatureRegistry/FeatureHost/NavigationService/RefreshCoordinator/
 *    FrameScheduler/PendingOperationJournal/ports；
 *  - `tick(dt)` 转发 RoomController.tick 与 FrameScheduler；
 *  - `dispose()` 顺序 = 原 Main.onDestroy 逐字保序：disposePages → battleAbort →
 *    unsubs → unregisterGameplay → controller.dispose（appRuntime.test.ts 以顺序
 *    行为断言钉住），5b 新增件的清理跟在其后。
 *
 * ⚠ **RoomController.currentGeneration 是唯一的 gameplay generation**（§7.7）：
 * 本类 ⛔ 不新增第二个玩法世代计数；app generation 只服务页面/导航作用域。
 */
import type { Node } from "cc";
import { GameplayRegistry } from "../logic/gameplay/GameplayRegistry";
import {
    recoverGameplayStartFailure,
    reconcileGameplayStartResult,
    RoomController,
} from "../logic/gameplay/RoomController";
import type { GameplayStartResult } from "../logic/gameplay/RoomController";
import { registerDefaultGameplays, type AppGameplayRegistry } from "../gameplay/catalog";
import { GameplayModeId, joinErrText } from "../shared/index";
import {
    getSessionGeneration,
    onAuthInvalid,
    onBattleLost,
    onConnLost,
    returnToLogin,
} from "./SessionCoordinator";
import { FeatureHost, type HostedFeature } from "./FeatureHost";
import { FrameScheduler } from "./FrameScheduler";
import { PendingOperationJournal } from "./PendingOperationJournal";
import { RefreshCoordinator } from "./RefreshCoordinator";
import { createAppPorts, type AppPorts } from "./ports";
import { lifecycleBus } from "./wiring";
import {
    appFeatureRegistry,
    appNavigation,
    createPageSessionScope,
    openLogin,
    refreshAuthenticatedBaseProfile,
    type PageSessionScope,
} from "./loginFlow";
import type { NavigationService } from "./NavigationService";

export interface AppRuntimeOptions {
    /** 玩法 presentation 挂载节点（Main 传入；本类不 import cc 值）。 */
    readonly node: Node;
    /** 要进入的已登记玩法 id；默认 ballMove（阶段 9 数据驱动后评估删除）。 */
    readonly gameplayId?: string;
}

export class AppRuntime {
    /** app generation：构造递增（经页面 scope claim）、dispose 冻结。 */
    readonly generation: number;

    private gameplayRegistry: AppGameplayRegistry | null = null;
    private roomController: RoomController<any, any> | null = null;
    private unregisterGameplay: (() => void) | null = null;
    private disposePages: (() => void) | null = null;
    private battleTransition: Promise<void> | null = null;
    private battleAbort: AbortController | null = null;
    private disposed = false;
    private readonly unsubs: Array<() => void> = [];

    private readonly gameplayId: string;
    private readonly pageScope: PageSessionScope;
    private readonly navigation: NavigationService;
    private readonly featureHost: FeatureHost;
    private readonly frameScheduler = new FrameScheduler();
    private readonly journal = new PendingOperationJournal();
    private readonly refresh = new RefreshCoordinator();
    readonly ports: AppPorts;

    constructor(options: AppRuntimeOptions) {
        this.gameplayId = options.gameplayId ?? GameplayModeId.BallMove;
        // Claim page/session ownership：构造即递增 app generation；旧场景的 scope 被
        // supersede（其异步 transition 先失效再返回）。
        const scope = createPageSessionScope();
        this.pageScope = scope;
        this.generation = scope.generation;
        this.disposePages = scope.dispose;
        this.navigation = appNavigation;
        this.configureGameplay(options.node);
        this.ports = createAppPorts({
            navigation: this.navigation,
            journal: this.journal,
            frameScheduler: this.frameScheduler,
            lifecycleBus,
            enterBattle: () => this.enterBattle(),
            track: (unsubscribe) => this.track(unsubscribe),
        });
        const hostedFeatures: HostedFeature[] = appFeatureRegistry.featureIds().map((id) => ({
            id,
            resident: appFeatureRegistry.featureOf(id)?.resident ?? false,
        }));
        this.featureHost = new FeatureHost(hostedFeatures, {
            ports: this.ports,
            appGeneration: this.generation,
        });
        // route refcount → FeatureHost 停用判定（§7.2；built-in 常驻豁免）。
        this.navigation.setRouteObserver((featureId, openCount) => {
            void this.featureHost.releaseIfIdle(featureId, openCount).catch((error) => {
                console.error("[AppRuntime] feature 停用失败：", error);
            });
        });
        this.unsubs.push(() => this.navigation.setRouteObserver(null));
    }

    /** 收编一个外部解绑器（bootstrap 的 lifecycle bridge 等）：dispose 时强制释放。 */
    trackDisposer(unsubscribe: () => void): () => void {
        return this.track(unsubscribe);
    }

    /** 收编一个解绑器：dispose 时强制释放；返回的解绑器可提前显式释放（幂等）。 */
    private track(unsubscribe: () => void): () => void {
        let released = false;
        const entry = (): void => {
            if (released) return;
            released = true;
            unsubscribe();
        };
        this.unsubs.push(entry);
        return entry;
    }

    get isDisposed(): boolean {
        return this.disposed;
    }

    get refreshCoordinator(): RefreshCoordinator {
        return this.refresh;
    }

    get pendingOperationJournal(): PendingOperationJournal {
        return this.journal;
    }

    get features(): FeatureHost {
        return this.featureHost;
    }

    get scheduler(): FrameScheduler {
        return this.frameScheduler;
    }

    /**
     * 会话/生命周期接线（bootstrap 在打开任何页面之前调用）。
     * Register before opening pages so transport loss always tears down the
     * gameplay generation before the navigation layer mounts Login again.
     */
    wireSessionLifecycle(): void {
        if (this.disposed) return;
        this.unsubs.push(
            onAuthInvalid(() => { this.stopGameplay("cancelled"); }),
            onBattleLost(() => { this.stopGameplay("room-lost"); }),
            onConnLost(() => { this.stopGameplay("room-lost"); }),
        );
        // journal 生命周期（§7.2/§7.3）：auth-invalid = session ended → 同步清空；
        // dropped → 在途写结算为 unknown（⛔ 不新增条目）；final-loss 保留待重进对账。
        this.unsubs.push(
            onAuthInvalid(() => { this.journal.clearForSessionEnd(); }),
            lifecycleBus.subscribe("connection", (event) => {
                if (event.kind === "dropped") this.journal.markInflightUnknown();
                if (event.kind === "reconnected") {
                    // 发送闸已恢复：刷新当前 authenticated base（合流经 RefreshCoordinator）。
                    void refreshAuthenticatedBaseProfile().catch(() => {});
                }
            }),
            // 宿主 hide 只暂停本地 ticker、禁止新意图（不判失败、不清 journal）；
            // show 恢复 ticker 并刷新 authenticated base（Lobby 未 ready 时只置 dirty）。
            lifecycleBus.subscribe("host", (event) => {
                if (event.kind === "hide") this.frameScheduler.setPaused(true);
                if (event.kind === "show") {
                    this.frameScheduler.setPaused(false);
                    void refreshAuthenticatedBaseProfile().catch(() => {});
                }
            }),
        );
    }

    /** 导航启动（openLogin 等价入口）；失败只记录，不炸宿主帧循环。 */
    async startNavigation(): Promise<void> {
        try {
            if (this.disposed) return;
            await openLogin(() => this.enterBattle(), this.pageScope);
        } catch (error) {
            console.error("[AppRuntime] 大厅初始化失败（FairyGUI 扩展/资源包是否就绪？）：", error);
        }
    }

    /** 帧驱动（Main.update 转发）：RoomController.tick + FrameScheduler。 */
    tick(dt: number): void {
        const controller = this.roomController;
        if (controller) {
            void controller.tick(dt).catch((error) => {
                console.error("[AppRuntime] gameplay tick 失败：", error);
            });
        }
        this.frameScheduler.tick(dt);
    }

    /**
     * 释放宿主。顺序逐字保序自原 Main.onDestroy（appRuntime.test.ts 顺序行为断言）：
     * disposePages → battleAbort.abort → unsubs → unregisterGameplay →
     * controller.dispose；5b 新增件（ticker/feature host）的清理跟在其后。
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.disposePages?.();
        this.disposePages = null;
        this.battleAbort?.abort();
        this.battleAbort = null;
        for (const unsubscribe of this.unsubs.splice(0)) unsubscribe();
        this.unregisterGameplay?.();
        this.unregisterGameplay = null;
        this.gameplayRegistry = null;
        const controller = this.roomController;
        this.roomController = null;
        void controller?.dispose().catch((error) => {
            console.error("[AppRuntime] gameplay dispose 失败：", error);
        });
        this.frameScheduler.clear();
        void this.featureHost.disposeAll().catch((error) => {
            console.error("[AppRuntime] feature dispose 失败：", error);
        });
    }

    private configureGameplay(node: Node): void {
        const registry = new GameplayRegistry<any, any>();
        const controller = new RoomController<any, any>();
        const presentationHost = {
            node,
            dispatchInput: (input: unknown): void => {
                if (!this.roomController) return;
                void this.roomController.input(input).catch((error) => {
                    console.error("[AppRuntime] gameplay input 失败：", error);
                });
            },
        };
        this.unregisterGameplay = registerDefaultGameplays(registry, {
            presentationHost,
        });
        this.gameplayRegistry = registry;
        this.roomController = controller;
    }

    /** Home's command boundary; concurrent clicks share one observable transition. */
    enterBattle(): Promise<void> {
        if (this.disposed) return Promise.resolve();
        if (this.battleTransition) return this.battleTransition;
        const abort = new AbortController();
        const transition = this.startGameplay(abort.signal);
        this.battleAbort = abort;
        this.battleTransition = transition;
        const settle = (): void => {
            if (this.battleTransition === transition) {
                this.battleTransition = null;
                this.battleAbort = null;
            }
        };
        // Promise.finally is ES2018; keep the Creator legacy probe at ES2017.
        void transition.then(settle, settle);
        return transition;
    }

    private async startGameplay(signal: AbortSignal): Promise<void> {
        const controller = this.roomController;
        const registry = this.gameplayRegistry;
        if (!controller || !registry || signal.aborted || controller.status === "running") return;
        const sessionGeneration = getSessionGeneration();
        const isCurrent = (): boolean => !this.disposed
            && !signal.aborted
            && getSessionGeneration() === sessionGeneration;

        try {
            // 关闭大厅壳（原 pages.closeLobby 动态 import；导航层已内建动态 ViewMgr 边界）。
            this.navigation.closeGroup("authenticated");
        } catch {
            // 关闭失败不阻断进战斗（与旧 pages import 失败同级的吞错语义）。
        }
        if (!isCurrent()) return;

        const requestedId = typeof this.gameplayId === "string" && this.gameplayId.trim().length > 0
            ? this.gameplayId.trim()
            : GameplayModeId.BallMove;
        const result = await reconcileGameplayStartResult(
            controller.startRegistered(registry, requestedId, signal),
            {
                stop: (reason) => controller.stop(reason).catch((error) => {
                    console.error("[AppRuntime] 迟到 gameplay transition 清理失败：", error);
                }),
            },
            isCurrent,
        );
        if (result === undefined) return;
        if (result.status === "started" || result.status === "already-running") return;
        if (result.status === "cancelled" || result.status === "disposed") return;
        await this.handleGameplayStartFailure(result, isCurrent);
    }

    private async handleGameplayStartFailure(result: GameplayStartResult, isCurrent: () => boolean): Promise<void> {
        if (!isCurrent() || result.status === "busy") return;
        const error = result.status === "failed"
            ? result.error
            : new Error(`unexpected gameplay result: ${result.status}`);
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[AppRuntime] 进入战斗失败：${joinErrText(message, "连接房间失败（请确认已运行 npm run dev）")}`, error);
        await recoverGameplayStartFailure(error, {
            stop: (reason) => this.roomController?.stop(reason),
            isCurrent,
            reportStopError: (stopError) => {
                console.error("[AppRuntime] 进入战斗失败后的 gameplay stop 失败：", stopError);
            },
            returnToLogin: () => returnToLogin({ kind: "BATTLE_JOIN_FAILED" }),
        });
    }

    private stopGameplay(kind: "cancelled" | "room-lost"): void {
        this.battleAbort?.abort();
        void this.roomController?.stop({ kind }).catch((error) => {
            console.error("[AppRuntime] gameplay stop 失败：", error);
        });
    }
}
