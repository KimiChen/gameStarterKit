/**
 * mmoWorld 客户端 GameplayModule（kits/mmo 的世界形态玩法）：纯装配层——launch `{ characterId, mapId, transfer? }`（选角页带参 launch，MF9-B4；
 * `transfer` = 交接凭据，两图交接后由本模块自己带参重进目标图，MK1-B3）→ joiner（kit runtime 的 world.enter 签凭据 / 交接凭据直进 →
 * WorldRoomTransport.join）→ MmoWorldGameplay；presentation 经字面量动态 import（铁律 10）。
 * kit 自带玩法与插件玩法同一形态，⛔ 不修改 Main / RoomClient / catalog 中央文件。世界形态 ⛔ 走 services.joinGameRoom（那是 GameRoom 路径）。
 */
import type { GameplayInstanceHost, GameplayModule } from "../../../logic/gameplay/index";
import { MMO_WORLD_GAMEPLAY_ID, createMmoWorldGameplay, type MmoWorldInput, type MmoWorldPresentation, type MmoWorldRoom } from "../../../logic/rooms/mmoWorld/MmoWorldGameplay";
import { createMmoWorldRoomJoiner, type MmoWorldTransferCredential } from "../../../net/rooms/MmoWorldRoom";
import { WorldRoomTransport } from "../../../net/rooms/WorldRoomTransport";
import { getMmoRuntime } from "../../../kits/mmo/logic/mmoRuntime";
import { isMapId, parseWorldAddress } from "../../../shared/kits/mmo/api/world/index";
import { GAMEPLAY_CATALOG } from "../../../shared/index";
import type { GameplayServicesContext } from "../../services";

export interface MmoWorldLaunch {
    readonly characterId: string;
    readonly mapId: string;
    /** joiner 用；validateLaunch 从 kit runtime 的角色缓存补全（launch 输入 ⛔ 带 personaId） */
    readonly personaId?: string;
    readonly profile?: string;
    /** 交接凭据（transferReady 载荷）：有它就跳过 world.enter 直进目标分线；mapId 必须与凭据的 worldAddress 一致 */
    readonly transfer?: MmoWorldTransferCredential;
}

/** launch 载荷 exact 校验：{ characterId, mapId, profile?, transfer? }。 */
export function validateMmoWorldLaunch(input: unknown): MmoWorldLaunch {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("[mmoWorld] launch 必须是 { characterId, mapId } 对象");
    const record = input as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        if (key !== "characterId" && key !== "mapId" && key !== "profile" && key !== "transfer") throw new TypeError(`[mmoWorld] launch 未知字段：${key}`);
    }
    const characterId = record.characterId;
    if (typeof characterId !== "string" || characterId.length === 0 || characterId.length > 64) throw new TypeError("[mmoWorld] launch.characterId 非法");
    if (!isMapId(record.mapId)) throw new TypeError("[mmoWorld] launch.mapId 非法");
    let out: MmoWorldLaunch = { characterId, mapId: record.mapId };
    const profile = record.profile;
    if (profile !== undefined) {
        const allowed: readonly string[] = GAMEPLAY_CATALOG.mmoWorld.profiles;
        if (typeof profile !== "string" || !allowed.includes(profile)) throw new TypeError("[mmoWorld] launch.profile 不在 catalog 声明的 profiles 中");
        out = { ...out, profile };
    }
    if (record.transfer !== undefined) out = { ...out, transfer: validateTransferCredential(record.transfer, record.mapId) };
    return out;
}

function validateTransferCredential(input: unknown, mapId: string): MmoWorldTransferCredential {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("[mmoWorld] launch.transfer 必须是对象");
    const record = input as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        if (key !== "transferId" && key !== "worldAddress" && key !== "ticket" && key !== "expiresAt") throw new TypeError(`[mmoWorld] launch.transfer 未知字段：${key}`);
    }
    const { transferId, worldAddress, ticket, expiresAt } = record;
    if (typeof transferId !== "string" || transferId.length === 0 || transferId.length > 64) throw new TypeError("[mmoWorld] launch.transfer.transferId 非法");
    const parts = typeof worldAddress === "string" ? parseWorldAddress(worldAddress) : null;
    if (!parts || parts.mapId !== mapId) throw new TypeError("[mmoWorld] launch.transfer.worldAddress 非法或与 mapId 不一致");
    if (typeof ticket !== "string" || ticket.length === 0) throw new TypeError("[mmoWorld] launch.transfer.ticket 非法");
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt < 0) throw new TypeError("[mmoWorld] launch.transfer.expiresAt 非法");
    return { transferId, worldAddress: worldAddress as string, ticket, expiresAt };
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
                        const capability = joiner.joinFor(character.personaId, launch.mapId, signal, launch.transfer ?? null);
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
            // 两图交接：本局 stop 时拿到凭据 ⇒ 下一拍带参重进目标图（凭据只在内存流转，⛔ 落日志）
            onTransfer: (ready) => {
                const runtime = getMmoRuntime();
                const parts = parseWorldAddress(ready.worldAddress);
                const characterId = selfCharacterId;
                if (!runtime || !parts || characterId === null) { console.error("[mmoWorld] 交接就绪但无法重进（runtime / 地址 / 角色缺席）"); return; }
                setTimeout(() => {
                    void runtime.launchWorld(characterId, parts.mapId, ready).catch((error) => { console.error("[mmoWorld] 交接后重进世界失败：", error); });
                }, 0);
            },
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
