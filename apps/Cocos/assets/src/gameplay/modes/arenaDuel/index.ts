/**
 * arenaDuel 客户端 GameplayModule（kits/arena 的决斗 mode）：纯装配层——transport（net/rooms/ArenaDuelRoom）
 * 与玩法实现（logic/rooms/arenaDuel）组装成 §7.6 的模块形状；presentation 经字面量动态 import（铁律 10）。
 * kit 自带玩法与插件玩法同一形态，⛔ 不修改 Main / RoomClient / catalog 中央文件。
 */
import {
    createArenaDuelGameplay, ARENA_DUEL_GAMEPLAY_ID,
    type ArenaDuelInput, type ArenaDuelPresentation, type ArenaDuelRoom,
} from "../../../logic/rooms/arenaDuel/ArenaDuelGameplay";
import type { GameplayInstanceHost, GameplayModule } from "../../../logic/gameplay/index";
import { createArenaDuelRoomAdapter, createArenaDuelRoomJoiner } from "../../../net/rooms/ArenaDuelRoom";
import { GAMEPLAY_CATALOG } from "../../../shared/index";
import type { GameplayServicesContext } from "../../services";

export interface ArenaDuelLaunch {
    readonly profile?: string;
}

function validateArenaDuelLaunch(input: unknown): ArenaDuelLaunch {
    if (input === undefined || input === null) return {};
    if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("[arenaDuel] launch 必须是对象");
    for (const key of Object.keys(input as Record<string, unknown>)) {
        if (key !== "profile") throw new TypeError(`[arenaDuel] launch 未知字段：${key}`);
    }
    const profile = (input as { readonly profile?: unknown }).profile;
    if (profile === undefined) return {};
    const allowed: readonly string[] = GAMEPLAY_CATALOG.arenaDuel.profiles;
    if (typeof profile !== "string" || !allowed.includes(profile)) {
        throw new TypeError("[arenaDuel] launch.profile 不在 catalog 声明的 profiles 中");
    }
    return { profile };
}

/** generated catalog 的约定入口：注入稳定服务，返回本玩法的模块。 */
export function createGameplayModule(services: GameplayServicesContext): GameplayModule<ArenaDuelLaunch, ArenaDuelInput, ArenaDuelRoom> {
    const adapter = createArenaDuelRoomAdapter();
    const roomJoiner = createArenaDuelRoomJoiner(adapter, services.roomClient);
    return {
        id: ARENA_DUEL_GAMEPLAY_ID,
        validateLaunch: validateArenaDuelLaunch,
        joiner: {
            join: (_launch, signal) => roomJoiner.join(signal),
        },
        createPlugin: (host) => createArenaDuelGameplay({
            host,
            ...(services.presentationHost ? { presentationFactory: () => createArenaDuelPresentation(services, host) } : {}),
        }),
    };
}

async function createArenaDuelPresentation(
    services: GameplayServicesContext,
    host: GameplayInstanceHost<ArenaDuelInput>,
): Promise<ArenaDuelPresentation | undefined> {
    const presentationHost = services.presentationHost;
    if (!presentationHost) return undefined;
    const { ArenaDuelView } = await import("../../../view/rooms/arenaDuel/ArenaDuelView");
    return new ArenaDuelView(presentationHost.node, (input) => {
        void host.dispatchInput(input).catch((error) => {
            console.error("[arenaDuel] gameplay input 失败：", error);
        });
    });
}
