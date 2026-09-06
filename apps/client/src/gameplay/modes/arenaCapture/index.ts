/**
 * arenaCapture 客户端 GameplayModule（kits/arena 的占领赛 mode）：纯装配层——transport（net/rooms/ArenaCaptureRoom）
 * 与玩法实现（logic/rooms/arenaCapture）组装成 §7.6 的模块形状；presentation 经字面量动态 import（铁律 10）。
 * kit 自带玩法与插件玩法同一形态，⛔ 不修改 Main / RoomClient / catalog 中央文件。
 */
import {
    createArenaCaptureGameplay, ARENA_CAPTURE_GAMEPLAY_ID,
    type ArenaCaptureInput, type ArenaCapturePresentation, type ArenaCaptureRoom,
} from "../../../logic/rooms/arenaCapture/ArenaCaptureGameplay";
import type { GameplayInstanceHost, GameplayModule } from "../../../logic/gameplay/index";
import { createArenaCaptureRoomAdapter, createArenaCaptureRoomJoiner } from "../../../net/rooms/ArenaCaptureRoom";
import { GAMEPLAY_CATALOG } from "../../../shared/index";
import type { GameplayServicesContext } from "../../services";

export interface ArenaCaptureLaunch {
    readonly profile?: string;
}

function validateArenaCaptureLaunch(input: unknown): ArenaCaptureLaunch {
    if (input === undefined || input === null) return {};
    if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("[arenaCapture] launch 必须是对象");
    for (const key of Object.keys(input as Record<string, unknown>)) {
        if (key !== "profile") throw new TypeError(`[arenaCapture] launch 未知字段：${key}`);
    }
    const profile = (input as { readonly profile?: unknown }).profile;
    if (profile === undefined) return {};
    const allowed: readonly string[] = GAMEPLAY_CATALOG.arenaCapture.profiles;
    if (typeof profile !== "string" || !allowed.includes(profile)) {
        throw new TypeError("[arenaCapture] launch.profile 不在 catalog 声明的 profiles 中");
    }
    return { profile };
}

/** generated catalog 的约定入口：注入稳定服务，返回本玩法的模块。 */
export function createGameplayModule(services: GameplayServicesContext): GameplayModule<ArenaCaptureLaunch, ArenaCaptureInput, ArenaCaptureRoom> {
    const adapter = createArenaCaptureRoomAdapter();
    const roomJoiner = createArenaCaptureRoomJoiner(adapter, services.roomClient);
    return {
        id: ARENA_CAPTURE_GAMEPLAY_ID,
        validateLaunch: validateArenaCaptureLaunch,
        joiner: {
            join: (_launch, signal) => roomJoiner.join(signal),
        },
        createPlugin: (host) => createArenaCaptureGameplay({
            host,
            ...(services.presentationHost ? { presentationFactory: () => createArenaCapturePresentation(services, host) } : {}),
        }),
    };
}

async function createArenaCapturePresentation(
    services: GameplayServicesContext,
    host: GameplayInstanceHost<ArenaCaptureInput>,
): Promise<ArenaCapturePresentation | undefined> {
    const presentationHost = services.presentationHost;
    if (!presentationHost) return undefined;
    const { ArenaCaptureView } = await import("../../../view/rooms/arenaCapture/ArenaCaptureView");
    return new ArenaCaptureView(presentationHost.node, (input) => {
        void host.dispatchInput(input).catch((error) => {
            console.error("[arenaCapture] gameplay input 失败：", error);
        });
    });
}
