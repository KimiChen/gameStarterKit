/**
 * Cocos application shell: boot environment, wire session navigation and drive
 * the active GameplayPlugin. ballMove networking, ECS, input and rendering live
 * behind their room/plugin/view adapters rather than in this component.
 */
import { _decorator, Component, ResolutionPolicy, view } from "cc";
import { DEV_SERVER_URL } from "./core/devEnv";
import { initHttp, initPortal } from "./core/http";
import { installWeChatCompat } from "./core/wechat-compat";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "./designSpec";
import { GameplayRegistry } from "./logic/gameplay/GameplayRegistry";
import {
    recoverGameplayStartFailure,
    reconcileGameplayStartResult,
    RoomController,
} from "./logic/gameplay/RoomController";
import {
    BALL_MOVE_GAMEPLAY_ID,
} from "./logic/rooms/ballMove/BallMoveGameplay";
import { getSessionGeneration, onAuthInvalid, onBattleLost, onConnLost, returnToLogin } from "./net/session";
import { joinErrText } from "./shared/index";
import type { GameplayStartResult } from "./logic/gameplay/RoomController";
import { BallMoveView } from "./view/rooms/ballMove/BallMoveView";
import { registerDefaultGameplays, type AppGameplayRegistry } from "./gameplay/catalog";

// Must run before the first Colyseus operation. Imported network modules do not
// connect during evaluation; RoomController starts the join only from enterBattle.
installWeChatCompat();

const { ccclass, property } = _decorator;

@ccclass("Main")
export class Main extends Component {
    @property({ tooltip: "服务端 http(s) 地址。留空 = 自动跟随根 .env.development 的 PORT；填写即覆盖。" })
    serverUrl = "";

    @property({ tooltip: "WebPlatform Public http(s) 地址（登录 + 选服），必填。" })
    portalUrl = "";
    @property({ tooltip: "要进入的已登记玩法 id；默认 ballMove，可替换为 idle。" })
    gameplayId = BALL_MOVE_GAMEPLAY_ID;

    private gameplayRegistry: AppGameplayRegistry | null = null;
    private roomController: RoomController<any, any> | null = null;
    private unregisterGameplay: (() => void) | null = null;
    private disposePages: (() => void) | null = null;
    private battleTransition: Promise<void> | null = null;
    private battleAbort: AbortController | null = null;
    private destroyed = false;
    private readonly unsubs: Array<() => void> = [];

    private get effectiveServerUrl(): string {
        return this.serverUrl || DEV_SERVER_URL;
    }

    onLoad(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        this.configureGameplay();
    }

    async start(): Promise<void> {
        initHttp(this.effectiveServerUrl);
        initPortal(this.portalUrl);

        // Register before opening pages so transport loss always tears down the
        // gameplay generation before the navigation layer mounts Login again.
        this.unsubs.push(
            onAuthInvalid(() => { this.stopGameplay("cancelled"); }),
            onBattleLost(() => { this.stopGameplay("room-lost"); }),
            onConnLost(() => { this.stopGameplay("room-lost"); }),
        );

        try {
            const pages = await import("./view/pages");
            if (this.destroyed) {
                return;
            }
            // Claim ownership only after the dynamic import has resolved and
            // this instance is still alive. A stale Main must not install a
            // disposer that can tear down a newer scene's page root.
            const scope = pages.createPageSessionScope();
            this.disposePages = scope.dispose;
            if (this.destroyed) {
                scope.dispose();
                this.disposePages = null;
                return;
            }
            await pages.openLogin(() => this.enterBattle(), scope);
        } catch (error) {
            console.error("[Main] 大厅初始化失败（FairyGUI 扩展/资源包是否就绪？）：", error);
        }
    }

    update(dt: number): void {
        const controller = this.roomController;
        if (!controller) return;
        void controller.tick(dt).catch((error) => {
            console.error("[Main] gameplay tick 失败：", error);
        });
    }

    onDestroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
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
            console.error("[Main] gameplay dispose 失败：", error);
        });
    }

    private configureGameplay(): void {
        const registry = new GameplayRegistry<any, any>();
        const controller = new RoomController<any, any>();
        const presentation = new BallMoveView(this.node, (action) => {
            if (!this.roomController) return;
            void this.roomController.input(action).catch((error) => {
                console.error("[Main] gameplay input 失败：", error);
            });
        });
        this.unregisterGameplay = registerDefaultGameplays(registry, { ballMovePresentation: presentation });
        this.gameplayRegistry = registry;
        this.roomController = controller;
    }

    /** Home's command boundary; concurrent clicks share one observable transition. */
    private enterBattle(): Promise<void> {
        if (this.destroyed) return Promise.resolve();
        if (this.battleTransition) return this.battleTransition;
        const abort = new AbortController();
        const transition = this.startGameplay(abort.signal);
        this.battleAbort = abort;
        this.battleTransition = transition;
        void transition.finally(() => {
            if (this.battleTransition === transition) {
                this.battleTransition = null;
                this.battleAbort = null;
            }
        }).catch(() => {});
        return transition;
    }

    private async startGameplay(signal: AbortSignal): Promise<void> {
        const controller = this.roomController;
        const registry = this.gameplayRegistry;
        if (!controller || !registry || signal.aborted || controller.status === "running") return;
        const sessionGeneration = getSessionGeneration();
        const isCurrent = (): boolean => !this.destroyed
            && !signal.aborted
            && getSessionGeneration() === sessionGeneration;

        try {
            const pages = await import("./view/pages");
            if (!isCurrent()) return;
            pages.closeLobby();
        } catch {
            if (!isCurrent()) return;
        }

        const requestedId = typeof this.gameplayId === "string" && this.gameplayId.trim().length > 0
            ? this.gameplayId.trim()
            : BALL_MOVE_GAMEPLAY_ID;
        const result = await reconcileGameplayStartResult(
            controller.startRegistered(registry, requestedId, signal),
            {
                stop: (reason) => controller.stop(reason).catch((error) => {
                    console.error("[Main] 迟到 gameplay transition 清理失败：", error);
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
        console.error(`[Main] 进入战斗失败：${joinErrText(message, "连接房间失败（请确认已运行 npm run dev）")}`, error);
        await recoverGameplayStartFailure(error, {
            stop: (reason) => this.roomController?.stop(reason),
            isCurrent,
            reportStopError: (stopError) => {
                console.error("[Main] 进入战斗失败后的 gameplay stop 失败：", stopError);
            },
            returnToLogin: () => returnToLogin({ kind: "BATTLE_JOIN_FAILED" }),
        });
    }

    private stopGameplay(kind: "cancelled" | "room-lost"): void {
        this.battleAbort?.abort();
        void this.roomController?.stop({ kind }).catch((error) => {
            console.error("[Main] gameplay stop 失败：", error);
        });
    }
}
