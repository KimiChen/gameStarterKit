/**
 * mmoWorld 客户端 GameplayModule（mmo kit 的世界形态玩法；MK0-B3 占位，MK0-B4 换成 world.enter + WorldRoomTransport 的真实 joiner）。
 * canonical（wireExposed）玩法必须有一份 client module；世界形态不经 GameRoom joiner 进入（docs/CLIENT.md §7）。
 */
import type { GameplayModule } from "../../../logic/gameplay/index";
import { GAMEPLAY_CATALOG } from "../../../shared/index";
import type { GameplayServicesContext } from "../../services";

export interface MmoWorldLaunch {
    readonly profile?: string;
}

function validateMmoWorldLaunch(input: unknown): MmoWorldLaunch {
    if (input === undefined || input === null) return {};
    if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("[mmoWorld] launch 必须是对象");
    for (const key of Object.keys(input as Record<string, unknown>)) {
        if (key !== "profile") throw new TypeError(`[mmoWorld] launch 未知字段：${key}`);
    }
    const profile = (input as { readonly profile?: unknown }).profile;
    if (profile === undefined) return {};
    const allowed: readonly string[] = GAMEPLAY_CATALOG.mmoWorld.profiles;
    if (typeof profile !== "string" || !allowed.includes(profile)) throw new TypeError("[mmoWorld] launch.profile 不在 catalog 声明的 profiles 中");
    return { profile };
}

const notYet = (): never => {
    throw new Error("[mmoWorld] 世界形态玩法经 Lobby world.enter + WorldRoomTransport 进入（MK0-B4 接线）");
};

/** generated catalog 的约定入口。 */
export function createGameplayModule(_services: GameplayServicesContext): GameplayModule<MmoWorldLaunch, never, never> {
    return { id: "mmoWorld", validateLaunch: validateMmoWorldLaunch, joiner: { join: notYet }, createPlugin: notYet };
}
