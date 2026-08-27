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
import { RoomController } from "./logic/gameplay/RoomController";
import {
    BALL_MOVE_GAMEPLAY_ID,
    registerBallMoveGameplay,
    type BallMoveInput,
    type BallMoveRoom,
} from "./logic/rooms/ballMove/BallMoveGameplay";
import { createBallMoveRoomJoiner } from "./net/rooms/BallMoveRoom";
import { onAuthInvalid, onBattleLost, onConnLost, returnToLogin } from "./net/session";
import { joinErrText } from "./shared/index";
import type { GameplayStartResult } from "./logic/gameplay/RoomController";
import { BallMoveView } from "./view/rooms/ballMove/BallMoveView";

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

    private gameplayRegistry: GameplayRegistry<BallMoveRoom, BallMoveInput> | null = null;
    private roomController: RoomController<BallMoveRoom, BallMoveInput> | null = null;
    private unregisterGameplay: (() => void) | null = null;
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
            if (!this.destroyed) await pages.openLogin(() => this.enterBattle());
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
        const registry = new GameplayRegistry<BallMoveRoom, BallMoveInput>();
        const controller = new RoomController<BallMoveRoom, BallMoveInput>(createBallMoveRoomJoiner());
        const presentation = new BallMoveView(this.node, (action) => {
            if (!this.roomController) return;
            void this.roomController.input(action).catch((error) => {
                console.error("[Main] gameplay input 失败：", error);
            });
        });
        this.unregisterGameplay = registerBallMoveGameplay(registry, { presentation });
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

        try {
            const pages = await import("./view/pages");
            if (this.destroyed || signal.aborted) return;
            pages.closeLobby();
        } catch {
            if (this.destroyed || signal.aborted) return;
        }

        const result = await controller.startRegistered(registry, BALL_MOVE_GAMEPLAY_ID, signal);
        if (result.status === "started" || result.status === "already-running") return;
        if (result.status === "cancelled" || result.status === "disposed") return;
        await this.handleGameplayStartFailure(result);
    }

    private async handleGameplayStartFailure(result: GameplayStartResult): Promise<void> {
        if (this.destroyed || result.status === "busy") return;
        const error = result.status === "failed"
            ? result.error
            : new Error(`unexpected gameplay result: ${result.status}`);
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Main] 进入战斗失败：${joinErrText(message, "连接房间失败（请确认已运行 npm run dev）")}`, error);
        await this.roomController?.stop({ kind: "plugin-error", error });
        await returnToLogin({ kind: "BATTLE_JOIN_FAILED" });
    }

    private stopGameplay(kind: "cancelled" | "room-lost"): void {
        this.battleAbort?.abort();
        void this.roomController?.stop({ kind }).catch((error) => {
            console.error("[Main] gameplay stop 失败：", error);
        });
    }
}
