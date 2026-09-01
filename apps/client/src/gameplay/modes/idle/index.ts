/**
 * idle 客户端 GameplayModule（Non-intrusive §5.2/§7.6 阶段 9）。
 *
 * 纯装配层：transport（net/rooms/IdleRoom）与玩法实现（logic/rooms/idle）不动。
 * idle 无 presentation、无 host 输入回流（pulse 由外部 handleInput 驱动），
 * adapter 刻意无 reconcile（坑 14：通用 reconnect ⛔ 不得替它伪造重放）。
 */
import {
    createIdleGameplay,
    IDLE_GAMEPLAY_ID,
    type IdleInput,
    type IdleRoom,
} from "../../../logic/rooms/idle/IdleGameplay";
import type { GameplayModule } from "../../../logic/gameplay/index";
import { createIdleRoomJoiner } from "../../../net/rooms/IdleRoom";
import { createIdleRoomAdapter } from "../../../net/rooms/GameRoomTransport";
import { GAMEPLAY_CATALOG } from "../../../shared/index";
import type { GameplayServicesContext } from "../../services";

/** idle 的 launch 载荷：exact `{}` 或 `{ profile? }`（取值限 catalog 声明的 profiles）。 */
export interface IdleLaunch {
    readonly profile?: string;
}

function validateIdleLaunch(input: unknown): IdleLaunch {
    if (input === undefined || input === null) return {};
    if (typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("[idle] launch 必须是对象");
    }
    for (const key of Object.keys(input as Record<string, unknown>)) {
        if (key !== "profile") throw new TypeError(`[idle] launch 未知字段：${key}`);
    }
    const profile = (input as { readonly profile?: unknown }).profile;
    if (profile === undefined) return {};
    const allowed: readonly string[] = GAMEPLAY_CATALOG.idle.profiles;
    if (typeof profile !== "string" || !allowed.includes(profile)) {
        throw new TypeError("[idle] launch.profile 不在 catalog 声明的 profiles 中");
    }
    return { profile };
}

/** generated catalog 的约定入口：注入稳定服务，返回本玩法的模块。 */
export function createGameplayModule(
    services: GameplayServicesContext,
): GameplayModule<IdleLaunch, IdleInput, IdleRoom> {
    const adapter = createIdleRoomAdapter();
    const roomJoiner = createIdleRoomJoiner(adapter, services.roomClient);
    return {
        id: IDLE_GAMEPLAY_ID,
        validateLaunch: validateIdleLaunch,
        joiner: {
            join: (_launch, signal) => roomJoiner.join(signal),
        },
        // idle 无 View 输入回流：host（generation-fenced）此处不接线，plugin 输入
        // 仍经 RoomController.input 的统一入口。
        createPlugin: (_host) => createIdleGameplay(),
    };
}
