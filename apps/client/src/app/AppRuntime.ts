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
import type { GameplayControllerBridge } from "../logic/gameplay/GameplayModule";
import { registerGeneratedGameplays } from "../gameplay/catalog.generated";
import {
    createGameplayServices,
    type AppGameplayRegistry,
    type GameplayServicesContext,
} from "../gameplay/services";
import type { GameRoomConnectionSnapshot } from "../net/connectionEvents";
import { joinErrText, UserRpc } from "../shared/index";
import {
    getSessionGeneration,
    onAuthInvalid,
    onBattleLost,
    onConnLost,
    returnToLogin,
} from "./SessionCoordinator";
import { resolveLaunchGameplayId } from "./builtinFeature";
import type { FeatureLaunchTarget, FeatureMenuContribution } from "./builtinFeature";
import { FeatureHost, type FeatureStatus, type HostedFeature } from "./FeatureHost";
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
    setHomeMenuRuntime,
    setProfileWriteRuntime,
    type PageSessionScope,
} from "./loginFlow";
import type { NavigationService } from "./NavigationService";

/**
 * launch target(gameplayId) → 贡献它的 feature id：menu contribution 是唯一映射源
 * （§7.4）。codegen:features 已闸「一 gameplayId 一贡献者」（PLUGIN-REVIEW F17），映射不再
 * 需要靠排序裁决；这里保留「先到者不被覆盖」只是对手工 fixture 的防御。route 形态的
 * target 不进此表（它按 route 归属 feature 过闸，见 launch()）。无贡献者的 target 不受
 * feature 闸管控。
 */
export function deriveLaunchFeatureIds(
    contributions: readonly FeatureMenuContribution[],
): ReadonlyMap<string, string> {
    const map = new Map<string, string>();
    for (const item of contributions) {
        if (item.launch.kind !== "gameplay") continue;
        if (!map.has(item.launch.gameplayId)) map.set(item.launch.gameplayId, item.featureId);
    }
    return map;
}

export interface AppRuntimeOptions {
    /** 玩法 presentation 挂载节点（Main 传入；本类不 import cc 值）。 */
    readonly node: Node;
    /** 要进入的已登记玩法 id；缺省 = 宿主 features/host.json 的 defaultLaunch（DEFAULT_LAUNCH_GAMEPLAY_ID）。 */
    readonly gameplayId?: string;
    /** §7.8 show 三态判定的战斗连接快照 seam（测试注入；生产缺省读 gameplay services 的 roomClient）。 */
    readonly battleConnection?: () => GameRoomConnectionSnapshot;
    /** 测试注入：覆盖 hosted feature 列表（生产缺省由 appFeatureRegistry 派生，全部静态常驻）。 */
    readonly hostedFeatures?: readonly HostedFeature[];
    /** 测试注入：覆盖 launch target(gameplayId) → 贡献 feature id 的映射（生产缺省由 menu contributions 派生）。 */
    readonly launchFeatureMap?: ReadonlyMap<string, string>;
}

export class AppRuntime {
    /** app generation：构造递增（经页面 scope claim）、dispose 冻结。 */
    readonly generation: number;

    private gameplayRegistry: AppGameplayRegistry | null = null;
    private roomController: RoomController<any, any> | null = null;
    private gameplayServices: GameplayServicesContext | null = null;
    private unregisterGameplay: (() => void) | null = null;
    private disposePages: (() => void) | null = null;
    private battleTransition: Promise<void> | null = null;
    private battleAbort: AbortController | null = null;
    private disposed = false;
    /** §7.8：宿主 hide 期间为 true——停喂玩法 tick、拒绝新输入意图（seq 不跳变）。 */
    private hostHidden = false;
    /** §7.8 show 三态之 drop 宽限：等 reconnect（battle 通道 ready/reconnected/closed 解除）。 */
    private battleInputHold = false;
    private readonly battleConnection: (() => GameRoomConnectionSnapshot) | null;
    private readonly unsubs: Array<() => void> = [];

    private readonly gameplayId: string;
    private readonly pageScope: PageSessionScope;
    private readonly navigation: NavigationService;
    private readonly featureHost: FeatureHost;
    private readonly launchFeatureIds: ReadonlyMap<string, string>;
    private readonly frameScheduler = new FrameScheduler();
    private readonly journal = new PendingOperationJournal();
    private readonly refresh = new RefreshCoordinator();
    readonly ports: AppPorts;

    constructor(options: AppRuntimeOptions) {
        this.gameplayId = resolveLaunchGameplayId(options.gameplayId);
        this.battleConnection = options.battleConnection ?? null;
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
            launch: (target) => this.launch(target),
            track: (unsubscribe) => this.track(unsubscribe),
        });
        const hostedFeatures: readonly HostedFeature[] = options.hostedFeatures
            ?? appFeatureRegistry.featureIds().map((id) => ({
                id,
                resident: appFeatureRegistry.featureOf(id)?.resident ?? false,
                // feature.json 的 dependencies：FeatureHost 按它先装依赖、逆序拆（codegen 已查环）。
                dependencies: appFeatureRegistry.featureOf(id)?.dependencies ?? [],
                // feature.json 的 module：generated 静态字面量 loader（无 = 静态常驻，与 built-in 同形）。
                ...(appFeatureRegistry.featureOf(id)?.load ? { load: appFeatureRegistry.featureOf(id)!.load } : {}),
            }));
        this.featureHost = new FeatureHost(hostedFeatures, {
            ports: this.ports,
            appGeneration: this.generation,
        });
        // 生产派生见 deriveLaunchFeatureIds 文档注释（多贡献者取菜单排序最前者）。
        this.launchFeatureIds = options.launchFeatureMap
            ?? deriveLaunchFeatureIds(appFeatureRegistry.menuContributions());
        // route refcount → FeatureHost 停用判定（§7.2；built-in 常驻豁免）。
        this.navigation.setRouteObserver((featureId, openCount) => {
            void this.featureHost.releaseIfIdle(featureId, openCount).catch((error) => {
                console.error("[AppRuntime] feature 停用失败：", error);
            });
        });
        this.unsubs.push(() => this.navigation.setRouteObserver(null));
        // §7.4：Home 菜单接线——点击唯一出口 LaunchPort.launch(target)，可用性查询
        // FeatureHost（disabled/failed 叠加层）。注销器身份守卫，随 dispose 强制释放。
        this.unsubs.push(setHomeMenuRuntime({
            launch: (target) => this.ports.launch.launch(target),
            availabilityOf: (featureId) => this.featureAvailability(featureId),
        }));
        // 设置面板的档案写接线：走 ports.lobbyRpc.sendIdempotent（clientReqId +
        // PendingOperationJournal write-ahead 都在那条通道里），⛔ 不直调 rpcIdem。
        // ok=false 是服务端的确定性拒绝，必须当失败抛出去让面板回滚 UI。
        this.unsubs.push(setProfileWriteRuntime({
            updateProfile: async (patch) => {
                const result = await this.ports.lobbyRpc.sendIdempotent(UserRpc.UpdateProfile, patch);
                if (!result.ok) throw new Error("[AppRuntime] user.updateProfile 被拒绝（ok=false）");
            },
        }));
    }

    /** FeatureHost 运行时可用性叠加（未托管的贡献者不误伤为占位）。 */
    private featureAvailability(featureId: string): "available" | "failed" | "disabled" {
        let status: FeatureStatus;
        try {
            status = this.featureHost.statusOf(featureId);
        } catch {
            return "available";
        }
        if (status === "failed") return "failed";
        if (status === "disabled") return "disabled";
        return "available";
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
            // §7.8 宿主前后台（复用 5a 的 LifecycleBus/CocosLifecycleBridge，⛔ 不另起
            // EVENT_HIDE/EVENT_SHOW 监听）：hide 暂停本地 ticker + 停喂玩法 tick +
            // 禁新输入意图（⛔ 不关 room、不把已发输入判失败、不清 journal，seq 不跳变）；
            // show 按连接三态恢复（onHostShow）。
            lifecycleBus.subscribe("host", (event) => {
                if (event.kind === "hide") this.onHostHide();
                if (event.kind === "show") this.onHostShow();
            }),
            // §7.8 第 3/4 条的 drop 宽限收尾：等 reconnect——battle 通道的
            // reconnected（重连完整快照已过 exact validator）或 ready 解除输入挂起；
            // closed（final-loss 已走既有恢复路径 / voluntary 已无局可言）同样解除。
            lifecycleBus.subscribe("battle", (event) => {
                if (event.kind === "reconnected" || event.kind === "ready" || event.kind === "closed") {
                    this.battleInputHold = false;
                }
            }),
        );
    }

    /** §7.8 (1)(2)：hide 暂停本地 tick/预测与新输入意图。 */
    private onHostHide(): void {
        this.hostHidden = true;
        this.frameScheduler.setPaused(true);
    }

    /**
     * §7.8 (3)：show 先判战斗连接三态——
     *  - ready：先请求一次权威快照再恢复输入。authenticated base 经
     *    RefreshCoordinator 合流刷新；GameRoom 侧的权威 state 由存活 socket 的
     *    Schema patch 持续同步（协议无客户端拉取式快照），随恢复的 tick 立即消费；
     *  - drop 宽限：本地 tick 恢复，新输入意图继续挂起等 reconnect（§10.4：重连后的
     *    完整快照过 exact validator 之前不恢复输入；发送闸 stateReady 在 transport
     *    另有一道）；
     *  - final-loss：battle 通道的 closed{final-loss} 已派生 battleLost →
     *    stopGameplay(room-lost) 既有恢复路径，此处无局可恢复。
     */
    private onHostShow(): void {
        this.frameScheduler.setPaused(false);
        void refreshAuthenticatedBaseProfile().catch(() => {});
        const battle = this.battleConnectionState();
        this.battleInputHold = battle.state === "dropped"
            && this.roomController?.status === "running";
        this.hostHidden = false;
    }

    /** 战斗连接快照（seam 可注入；生产读 gameplay services 的 roomClient）。 */
    private battleConnectionState(): GameRoomConnectionSnapshot {
        if (this.battleConnection) return this.battleConnection();
        const services = this.gameplayServices;
        if (!services) return { state: "idle", connGeneration: 0 };
        return services.roomClient.getBattleConnectionState();
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
        // §7.8 (1)：hide 期间停喂玩法 tick（本地预测/插值暂停；room/transport 不动）。
        if (controller && !this.hostHidden) {
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
        this.gameplayServices = null;
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
        this.roomController = controller;
        // §7.7 controller 桥：GameplayInstanceHost 的 generation/输入/退出转发面。
        // generation 直接取 RoomController.currentGeneration（唯一玩法世代计数）；
        // dispatchInput 是 §7.8 的宿主输入闸位（hide/drop 宽限拒绝新输入意图）。
        const controllerBridge: GameplayControllerBridge = {
            currentGeneration: () => this.roomController?.currentGeneration ?? 0,
            dispatchInput: (input) => this.dispatchGameplayInput(input),
            requestStop: async (reason) => {
                const sessionGeneration = getSessionGeneration();
                await this.roomController?.stop(reason);
                // 玩法侧发起的退出（user-exit / settled → manual）：局已停、房已离，把 authenticated base
                // （首屏）恢复回来。此前 closed{voluntary} 不触发导航、controller.stop 也不导航，
                // 2026-09-05 Creator 预览实测：结算/离开后整屏黑（tally、snake 同一条路径）。
                if (this.disposed || getSessionGeneration() !== sessionGeneration) return;
                await this.restoreAuthenticatedBaseAfterGameplay();
            },
        };
        const presentationHost = {
            node,
            dispatchInput: (input: unknown): void => {
                void this.dispatchGameplayInput(input).catch((error) => {
                    console.error("[AppRuntime] gameplay input 失败：", error);
                });
            },
        };
        const services = createGameplayServices({
            controllerBridge,
            presentationHost,
        });
        this.unregisterGameplay = registerGeneratedGameplays(registry, services);
        this.gameplayRegistry = registry;
        this.gameplayServices = services;
    }

    /**
     * 玩法输入统一入口（presentation host 与 GameplayInstanceHost 共用）。
     * §7.8 (2)：hide 期间禁止产生新的输入意图——直接拒绝（false），⛔ 不排队、
     * 不递增任何输入 seq；drop 宽限的 show 后同样挂起，等 reconnect。
     */
    private dispatchGameplayInput(input: unknown): Promise<boolean> {
        if (this.hostHidden || this.battleInputHold) return Promise.resolve(false);
        const controller = this.roomController;
        if (!controller) return Promise.resolve(false);
        return controller.input(input);
    }

    /** Home's command boundary; concurrent clicks share one observable transition. */
    enterBattle(): Promise<void> {
        return this.launchGameplay(null);
    }

    /**
     * §7.4 统一玩法启动通道（LaunchPort.launch 的宿主实现）：target 覆盖默认玩法 id。
     * 启动前先过 FeatureHost 闸：点击 = 显式用户意图（userIntent），failed 在此刻重试
     * 装载；结算非 active（failed/disabled）则不启动玩法——菜单 enabled 只是渲染期
     * 快照，本闸是启动时刻的唯一判定（§7.2 状态机不得被启动通道绕过；built-in 常驻
     * feature 恒 active，零开销直通）。
     */
    async launch(target: FeatureLaunchTarget): Promise<void> {
        if (this.disposed) return;
        if (target.kind === "route") return this.launchRoute(target.routeId);
        const featureId = this.launchFeatureIds.get(target.gameplayId) ?? null;
        // 映射指向未托管 feature 时不误伤、直通——与渲染侧 featureAvailability 对未登记
        // id 返回 "available" 的防御裁定一致（⛔ 不用 try/catch 吞异常：真实 install
        // 错误不得被掩蔽为直通）。
        if (featureId !== null && this.featureHost.hosts(featureId)) {
            // ⚠ 闸是 await：install 期间会话可能换代（clearSession/setSession）、app 可能
            // dispose。迟到的 install 完成不得 closeGroup("authenticated")（会关掉换代后
            // 重开的 Login），也不得在新会话下启动玩法——await 后复验，不一致直接
            // return（换代/dispose 是正常竞态，⛔ 不进 launchGameplay、不打错误）。
            const sessionGeneration = getSessionGeneration();
            const status = await this.featureHost.launch(featureId, { userIntent: true });
            if (this.disposed || getSessionGeneration() !== sessionGeneration) return;
            if (status !== "active") {
                console.error(`[AppRuntime] feature ${featureId} 不可用（${status}），取消启动玩法 ${target.gameplayId}`);
                return;
            }
        }
        return this.launchGameplay(target);
    }

    /**
     * route 形态的入口（纯 feature 插件的唯一入口形态，docs/PLUGIN.md §6 / PLUGIN-REVIEW F23）：
     * 先让 route 归属的 feature 过同一道 FeatureHost 闸（userIntent），再经 navigation 打开 route。
     * 未登记的 route 不猜测、不打开（生成器已闸，这里只是防御）。
     */
    private async launchRoute(routeId: string): Promise<void> {
        if (!appFeatureRegistry.hasRoute(routeId)) {
            console.error(`[AppRuntime] launch 引用未登记的 route ${routeId}，忽略`);
            return;
        }
        const featureId = appFeatureRegistry.routeOf(routeId).featureId;
        if (this.featureHost.hosts(featureId)) {
            const sessionGeneration = getSessionGeneration();
            const status = await this.featureHost.launch(featureId, { userIntent: true });
            if (this.disposed || getSessionGeneration() !== sessionGeneration) return;
            if (status !== "active") {
                console.error(`[AppRuntime] feature ${featureId} 不可用（${status}），取消打开 route ${routeId}`);
                return;
            }
        }
        await this.navigation.open(routeId);
    }

    private launchGameplay(target: { readonly kind: "gameplay"; readonly gameplayId: string } | null): Promise<void> {
        if (this.disposed) return Promise.resolve();
        if (this.battleTransition) return this.battleTransition;
        const abort = new AbortController();
        const transition = this.startGameplay(abort.signal, target?.gameplayId);
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

    private async startGameplay(signal: AbortSignal, targetGameplayId?: string): Promise<void> {
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

        // launch target（generated contribution）优先；Main 的 gameplayId @property 仍是
        // 默认 launch target 的兜底（开发调试快捷入口）。两级都走 resolveLaunchGameplayId：
        // 未填/空白最终回落到宿主 features/host.json 的 defaultLaunch，⛔ 此处不再硬编码玩法名。
        const requestedId = resolveLaunchGameplayId(
            typeof targetGameplayId === "string" && targetGameplayId.trim().length > 0
                ? targetGameplayId
                : this.gameplayId,
        );
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

    /**
     * 玩法退出后恢复 authenticated base 栈顶（launchGameplay 进战斗前 closeGroup("authenticated") 的对称
     * 操作）。未登录 / 从未登记 base（Main 的开发快捷入口）时无事可做；失败只记日志，⛔ 不回登录页。
     */
    private async restoreAuthenticatedBaseAfterGameplay(): Promise<void> {
        if (!this.ports.session.isLoggedIn() || !this.navigation.hasAuthenticatedBase()) return;
        try {
            await this.navigation.restoreAuthenticatedBase({
                userId: this.ports.session.getUserId(),
                user: this.ports.session.getSessionProfile(),
            });
        } catch (error) {
            console.error("[AppRuntime] 玩法退出后恢复首屏失败：", error);
        }
    }

    private stopGameplay(kind: "cancelled" | "room-lost"): void {
        this.battleAbort?.abort();
        void this.roomController?.stop({ kind }).catch((error) => {
            console.error("[AppRuntime] gameplay stop 失败：", error);
        });
    }
}
