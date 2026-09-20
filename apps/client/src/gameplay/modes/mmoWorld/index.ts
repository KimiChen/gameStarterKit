/**
 * mmoWorld 客户端 GameplayModule（kits/mmo 的世界形态玩法）：纯装配层——launch `{ characterId, mapId }`（选角页带参 launch，MF9-B4）
 * → joiner（kit runtime 的 world.enter 签凭据 → WorldRoomTransport.join）→ MmoWorldGameplay；presentation 经字面量动态 import（铁律 10）。
 * kit 自带玩法与插件玩法同一形态，⛔ 不修改 Main / RoomClient / catalog 中央文件。世界形态 ⛔ 走 services.joinGameRoom（那是 GameRoom 路径）。
 */
import type { GameplayInstanceHost, GameplayModule } from "../../../logic/gameplay/index";
import { MMO_WORLD_GAMEPLAY_ID, createMmoWorldGameplay, type MmoWorldInput, type MmoWorldPresentation, type MmoWorldRoom } from "../../../logic/rooms/mmoWorld/MmoWorldGameplay";
import { createMmoWorldRoomJoiner } from "../../../net/rooms/MmoWorldRoom";
import { WorldRoomTransport } from "../../../net/rooms/WorldRoomTransport";
import { getMmoRuntime } from "../../../kits/mmo/logic/mmoRuntime";
import { isMapId } from "../../../shared/kits/mmo/api/world/index";
import { GAMEPLAY_CATALOG } from "../../../shared/index";
import type { GameplayServicesContext } from "../../services";

export interface MmoWorldLaunch {
    readonly characterId: string;
    readonly mapId: string;
    /** joiner 用；validateLaunch 从 kit runtime 的角色缓存补全（launch 输入 ⛔ 带 personaId） */
    readonly personaId?: string;
    readonly profile?: string;
}

/** launch 载荷 exact 校验：{ characterId, mapId, profile? }。 */
export function validateMmoWorldLaunch(input: unknown): MmoWorldLaunch {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("[mmoWorld] launch 必须是 { characterId, mapId } 对象");
    const record = input as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        if (key !== "characterId" && key !== "mapId" && key !== "profile") throw new TypeError(`[mmoWorld] launch 未知字段：${key}`);
    }
    const characterId = record.characterId;
    if (typeof characterId !== "string" || characterId.length === 0 || characterId.length > 64) throw new TypeError("[mmoWorld] launch.characterId 非法");
    if (!isMapId(record.mapId)) throw new TypeError("[mmoWorld] launch.mapId 非法");
    const out: MmoWorldLaunch = { characterId, mapId: record.mapId };
    const profile = record.profile;
    if (profile === undefined) return out;
    const allowed: readonly string[] = GAMEPLAY_CATALOG.mmoWorld.profiles;
    if (typeof profile !== "string" || !allowed.includes(profile)) throw new TypeError("[mmoWorld] launch.profile 不在 catalog 声明的 profiles 中");
    return { ...out, profile };
}

/** generated catalog 的约定入口：注入稳定服务，返回本玩法的模块。 */
export function createGameplayModule(services: GameplayServicesContext): GameplayModule<MmoWorldLaunch, MmoWorldInput, MmoWorldRoom> {
    const joiner = createMmoWorldRoomJoiner({
        transport: () => WorldRoomTransport.forCurrentServer(),
        enter: (personaId, mapId) => {
            const runtime = getMmoRuntime();
            if (!runtime) throw new Error("[mmoWorld] mmo kit 未装载（runtime 缺席），不能进入世界");
            return runtime.enterWorld(personaId, mapId);
        },
    });
    let selfCharacterId: string | null = null;
    return {
        id: MMO_WORLD_GAMEPLAY_ID,
        validateLaunch: validateMmoWorldLaunch,
        joiner: {
            join: (launch, signal) => {
                selfCharacterId = launch.characterId;
                return {
                    ready: (async () => {
                        const runtime = getMmoRuntime();
                        if (!runtime) throw new Error("[mmoWorld] mmo kit 未装载（runtime 缺席），不能进入世界");
                        // characterId → personaId：从 kit 的角色列表解析（launch 输入 ⛔ 带 personaId）
                        const listing = await runtime.characters();
                        const character = listing.characters.find((entry) => entry.characterId === launch.characterId);
                        if (!character) throw new Error(`[mmoWorld] 角色 ${launch.characterId} 不属于本账号`);
                        const capability = joiner.joinFor(character.personaId, launch.mapId, signal);
                        pending = capability;
                        return capability.ready;
                    })(),
                    leave: async () => { await pending?.leave(); },
                };
            },
        },
        createPlugin: (host) => createMmoWorldGameplay({
            host,
            ...(selfCharacterId === null ? {} : { selfCharacterId }),
            ...(services.presentationHost ? { presentationFactory: () => createMmoWorldPresentation(services, host) } : {}),
        }),
    };
}

let pending: { ready: Promise<MmoWorldRoom>; leave(): Promise<void> } | null = null;

async function createMmoWorldPresentation(services: GameplayServicesContext, host: GameplayInstanceHost<MmoWorldInput>): Promise<MmoWorldPresentation | undefined> {
    const presentationHost = services.presentationHost;
    if (!presentationHost) return undefined;
    const { MmoWorldView } = await import("../../../view/rooms/mmoWorld/MmoWorldView");
    return new MmoWorldView(presentationHost.node, (input) => {
        void host.dispatchInput(input).catch((error) => {
            console.error("[mmoWorld] gameplay input 失败：", error);
        });
    });
}
