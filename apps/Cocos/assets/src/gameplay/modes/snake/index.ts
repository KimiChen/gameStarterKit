/**
 * snake 客户端 GameplayModule（Non-intrusive §7.6；Snake Off 首版）。
 *
 * 纯装配层：transport（net/rooms/SnakeRoom）与生命周期实现（logic/rooms/snake）
 * 不动，本文件只组装成 §7.6 的模块形状。⛔ 不修改 Main/RoomClient/pages/Home/
 * catalog 中央文件。presentation 只在真正启动时经字面量动态 import 创建（铁律 10）。
 */
import type { GameplayInstanceHost, GameplayModule } from "../../../logic/gameplay/index";
import {
    createSnakeGameplay,
    SNAKE_GAMEPLAY_ID,
    type SnakeInput,
    type SnakePresentation,
    type SnakeRoomLike,
} from "../../../logic/rooms/snake/SnakeGameplay";
import {
    createSnakeRoomAdapter,
    createSnakeRoomJoiner,
} from "../../../net/rooms/SnakeRoom";
import type { GameplayServicesContext } from "../../services";

/** snake 的 launch 载荷：首版恒 `{}`（drop-in 撮合无参数；留 exact 校验闸防脏数据）。 */
export interface SnakeLaunch {
    readonly [key: string]: never;
}

function validateSnakeLaunch(input: unknown): SnakeLaunch {
    if (input === undefined || input === null) return {};
    if (typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("[snake] launch 必须是对象");
    }
    for (const key of Object.keys(input as Record<string, unknown>)) {
        throw new TypeError(`[snake] launch 未知字段：${key}`);
    }
    return {};
}

/** generated catalog 的约定入口：注入稳定服务，返回本玩法的模块。 */
export function createGameplayModule(
    services: GameplayServicesContext,
): GameplayModule<SnakeLaunch, SnakeInput, SnakeRoomLike> {
    const adapter = createSnakeRoomAdapter();
    const roomJoiner = createSnakeRoomJoiner(adapter, services.roomClient);
    return {
        id: SNAKE_GAMEPLAY_ID,
        validateLaunch: validateSnakeLaunch,
        joiner: {
            join: (_launch, signal) => roomJoiner.join(signal),
        },
        createPlugin: (host) => createSnakeGameplay({
            ...(services.presentationHost ? {
                presentationFactory: () => createSnakePresentation(services, host),
            } : {}),
        }),
    };
}

/** presentation 经字面量动态 import（铁律 10）；输入回流走 generation-fenced host。 */
async function createSnakePresentation(
    services: GameplayServicesContext,
    host: GameplayInstanceHost<SnakeInput>,
): Promise<SnakePresentation | undefined> {
    const presentationHost = services.presentationHost;
    if (!presentationHost) return undefined;
    const { SnakeWorldView } = await import("../../../view/rooms/snake/SnakeWorldView");
    return new SnakeWorldView(
        presentationHost.node,
        (input) => {
            void host.dispatchInput(input).catch((error) => {
                console.error("[snake] gameplay input 失败：", error);
            });
        },
        () => {
            void host.requestExit("settled").catch((error) => {
                console.error("[snake] 结算退出失败：", error);
            });
        },
    );
}
