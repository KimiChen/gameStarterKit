/**
 * ballMove 客户端 GameplayModule（Non-intrusive §5.2/§7.6 阶段 9）。
 *
 * 纯装配层：transport（net/rooms）与生命周期实现（logic/rooms/ballMove）**不动**，
 * 本文件只把它们组装成 §7.6 的模块形状。新增玩法照抄本目录形态即可，
 * ⛔ 不修改 Main / RoomClient / pages / Home / catalog 中央文件。
 *
 * adapter 生命周期（坑 10）：module 创建时构造**一个共享 adapter**（与旧 catalog
 * 行为一致）；每局经 createBallMoveRoom 的 beginInputLease 取得新 input lease，
 * 其 generation fence 防的正是「共享 adapter 上旧 capability 写新局」。
 */
import {
    createBallMoveGameplay,
    BALL_MOVE_GAMEPLAY_ID,
    type BallMoveInput,
    type BallMovePresentation,
    type BallMoveRoom,
} from "../../../logic/rooms/ballMove/BallMoveGameplay";
import type { GameplayInstanceHost, GameplayModule } from "../../../logic/gameplay/index";
import { createBallMoveRoomJoiner } from "../../../net/rooms/BallMoveRoom";
import { createBallMoveRoomAdapter } from "../../../net/rooms/GameRoomTransport";
import { GAMEPLAY_CATALOG } from "../../../shared/index";
import type { GameplayServicesContext } from "../../services";

/** ballMove 的 launch 载荷：exact `{}` 或 `{ profile? }`（取值限 catalog 声明的 profiles）。 */
export interface BallMoveLaunch {
    readonly profile?: string;
}

function validateBallMoveLaunch(input: unknown): BallMoveLaunch {
    if (input === undefined || input === null) return {};
    if (typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("[ballMove] launch 必须是对象");
    }
    for (const key of Object.keys(input as Record<string, unknown>)) {
        if (key !== "profile") throw new TypeError(`[ballMove] launch 未知字段：${key}`);
    }
    const profile = (input as { readonly profile?: unknown }).profile;
    if (profile === undefined) return {};
    const allowed: readonly string[] = GAMEPLAY_CATALOG.ballMove.profiles;
    if (typeof profile !== "string" || !allowed.includes(profile)) {
        throw new TypeError("[ballMove] launch.profile 不在 catalog 声明的 profiles 中");
    }
    return { profile };
}

/** generated catalog 的约定入口：注入稳定服务，返回本玩法的模块。 */
export function createGameplayModule(
    services: GameplayServicesContext,
): GameplayModule<BallMoveLaunch, BallMoveInput, BallMoveRoom> {
    const adapter = createBallMoveRoomAdapter();
    const roomJoiner = createBallMoveRoomJoiner(adapter, services.roomClient);
    return {
        id: BALL_MOVE_GAMEPLAY_ID,
        validateLaunch: validateBallMoveLaunch,
        joiner: {
            // launch.profile 目前只允许 catalog 缺省（ballMove 仅声明 "default"，
            // 与 joinGameRoom 注入的 DEFAULT_GAME_ROOM_PROFILE 同值）；带差异 profile
            // 的玩法在此把 launch 织入 join options，transport 文件保持不动。
            join: (_launch, signal) => roomJoiner.join(signal),
        },
        createPlugin: (host) => createBallMoveGameplay({
            ...(services.presentationHost ? {
                presentationFactory: () => createBallMovePresentation(services, host),
            } : {}),
        }),
    };
}

/**
 * presentation 只在本玩法真正启动时经**字面量动态 import**创建（铁律 10：
 * cc/FGUI 渲染实现不得进入普通脚本静态依赖图）；输入回流走 generation-fenced
 * 的 GameplayInstanceHost（§7.7），旧 View 无权染指新一局。
 */
async function createBallMovePresentation(
    services: GameplayServicesContext,
    host: GameplayInstanceHost<BallMoveInput>,
): Promise<BallMovePresentation | undefined> {
    const presentationHost = services.presentationHost;
    if (!presentationHost) return undefined;
    const { BallMoveView } = await import("../../../view/rooms/ballMove/BallMoveView");
    return new BallMoveView(presentationHost.node, (input) => {
        void host.dispatchInput(input).catch((error) => {
            console.error("[ballMove] gameplay input 失败：", error);
        });
    });
}
