/**
 * GameplayServicesContext（Non-intrusive §7.6 阶段 9）：generated client catalog
 * 注入给各 GameplayModule 的**稳定服务面**。
 *
 * 它取代旧 GameplayCatalogContext 的逐玩法字段——⛔ 不再出现
 * ballMoveJoiner / idleJoiner / ballMoveAdapter / idleAdapter 之类的按玩法命名注入：
 * 新增玩法只新增 `gameplay/modes/<id>/` 模块文件，本文件与 catalog 中央面不变。
 *
 * 字段即 §7.6 列出的稳定服务：房间客户端、session 只读 port、presentation host、
 * joinGameRoom 辅助与 launch 缺省（catalog 的 modeVersion/profile 单源）；另加
 * controllerBridge——RoomController 的面向引擎投影（§7.7 GameplayInstanceHost 的
 * 转发目标，由 AppRuntime 绑定其当前 controller 注入）。
 */
import type { Node } from "cc";
import type { GameplayControllerBridge, GameplayRegistry } from "../logic/gameplay/index";
import type { SessionReadPort } from "../app/ports";
import {
    getSessionGeneration,
    getSessionProfile,
    getUserId,
    isLoggedIn,
} from "../app/SessionCoordinator";
import { RoomClient } from "../net/RoomClient";
import type {
    GameplayRoomAdapter,
    GameRoomOwnership,
    SupportedGameRoomMode,
} from "../net/RoomClient";
import { joinGameRoom } from "../net/rooms/GameRoomTransport";
import { DEFAULT_GAME_ROOM_PROFILE, gameRoomModeVersion } from "../net/rooms/matchmaking";
import type { C2SPayloadMap } from "../shared/index";

/** Inputs/rooms are intentionally erased at the app composition boundary. */
export type AppGameplayRegistry = GameplayRegistry<any, any>;

/** Engine host passed once to the services context; module 只经它取得挂载节点。 */
export interface GameplayPresentationHost {
    readonly node: Node;
    /** 宿主原始输入通道（§7.8 hide 闸位于宿主实现内）；View 建议改经 GameplayInstanceHost。 */
    readonly dispatchInput: (input: unknown) => void;
}

export interface GameplayLaunchDefaults {
    readonly modeVersion: number;
    readonly profile: string;
}

export interface GameplayServicesContext {
    /** 通用战斗房客户端（生产注入 RoomClient.inst）。 */
    readonly roomClient: RoomClient;
    /** 只读会话视图（凭证生命周期归 SessionCoordinator，⛔ 无写入面）。 */
    readonly session: SessionReadPort;
    /** 引擎挂载 host；无头装配（测试）可缺省——缺省时依赖 presentation 的玩法启动失败。 */
    readonly presentationHost?: GameplayPresentationHost;
    /** RoomController 的面向引擎投影（GameplayInstanceHost 的转发目标）。 */
    readonly controllerBridge: GameplayControllerBridge;
    /** joinGameRoom 辅助：按当前区服/凭证进入一间 GameRoom（v8 必填信封已注入）。 */
    joinGameRoom<TMode extends SupportedGameRoomMode, TOutbound extends keyof C2SPayloadMap>(
        adapter: GameplayRoomAdapter<TMode, TOutbound>,
        signal: AbortSignal,
    ): GameRoomOwnership<TMode, TOutbound>;
    /** launch 缺省（client catalog 单源）：该玩法的 modeVersion 与缺省 profile。 */
    launchDefaults(mode: string): GameplayLaunchDefaults;
}

export interface GameplayServicesDeps {
    readonly controllerBridge: GameplayControllerBridge;
    readonly presentationHost?: GameplayPresentationHost;
    /** 测试替身注入面；生产缺省 RoomClient.inst。 */
    readonly roomClient?: RoomClient;
}

/** 组装生产 services（AppRuntime 经 bootstrap 装配调用；测试可整体替换）。 */
export function createGameplayServices(deps: GameplayServicesDeps): GameplayServicesContext {
    const roomClient = deps.roomClient ?? RoomClient.inst;
    return {
        roomClient,
        session: {
            getUserId,
            isLoggedIn,
            getSessionGeneration,
            getSessionProfile,
        },
        ...(deps.presentationHost ? { presentationHost: deps.presentationHost } : {}),
        controllerBridge: deps.controllerBridge,
        joinGameRoom: (adapter, signal) => joinGameRoom(roomClient, adapter, signal),
        launchDefaults: (mode) => ({
            modeVersion: gameRoomModeVersion(mode),
            profile: DEFAULT_GAME_ROOM_PROFILE,
        }),
    };
}
