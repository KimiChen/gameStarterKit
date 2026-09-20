/**
 * presence（在线提示，docs/MMO.md §6.2；MF6a-B1）。
 *
 * - 键 `kPresence(uid, sId)`（durable，`clientFor(uid)`），字段 `lobby` = 承载大厅连接的 NODE_ID、`lobbyAt`；
 *   world 侧字段（`world` / `mapId` / `instanceId` / `characterId` / `worldAt`）由 MF4 WorldRoom 写，本文件只给写口。
 * - **TTL 提示语义**：每次写都 EXPIRE PRESENCE_TTL_S，LobbyRoom 每 PRESENCE_HEARTBEAT_S 心跳续命；节点崩溃后
 *   ≤ 90 s 自愈成「离线」。⛔ 不是投递权威（投递看各节点本地在线表 websocket/push.ts）。
 * - **只清自己写的**（PRESENCE_CLEAR_IF_OWNER Lua：`HGET lobby == NODE_ID` 才 HDEL）：顶号跨节点时，旧节点的
 *   final onLeave 迟到 ⛔ 不得抹掉新节点刚写的 `lobby`；全部字段被删空时整键 DEL。
 * - 刻意不放：附近玩家列表（兴趣集）、全区在线索引、好友 / last-seen（插件）、presence 变更事件流（消费方都是拉取）。
 *
 * 依赖经 `PresenceDeps` 注入（Redis client getter / 节点 id / 时钟），单测用假 Redis + 假时钟（presence.test.ts）。
 */
import type Redis from "ioredis";
import { NODE_ID, PRESENCE_TTL_S } from "../infra/config";
import { kPresence } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { defineScript, evalshaWithReload } from "../infra/redisScripts";

export interface PresenceRecord {
    readonly lobby: string | null;
    readonly lobbyAt: number | null;
    readonly world: string | null;
    readonly mapId: string | null;
    readonly instanceId: string | null;
    readonly characterId: string | null;
    readonly worldAt: number | null;
}

export const PRESENCE_FIELDS = ["lobby", "lobbyAt", "world", "mapId", "instanceId", "characterId", "worldAt"] as const;

/** 只清「自己写的」那一组字段；字段全空则整键 DEL。KEYS[1]=presence，ARGV=[ownerField, nodeId, ...fieldsToClear]。 */
export const PRESENCE_CLEAR_IF_OWNER = defineScript("presenceClearIfOwner", `
local owner = redis.call('HGET', KEYS[1], ARGV[1])
if owner == false or owner ~= ARGV[2] then
  return 0
end
for i = 3, #ARGV do
  redis.call('HDEL', KEYS[1], ARGV[i])
end
if redis.call('HLEN', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[1])
end
return 1
`);

export interface PresenceDeps {
    /** presence 键所在 durable client（生产 = clientFor(uid)）。 */
    client(uid: string): Pick<Redis, "hset" | "expire" | "hmget" | "pipeline" | "evalsha" | "call">;
    nodeId(): string;
    now(): number;
    ttlSeconds(): number;
}

const productionDeps: PresenceDeps = {
    client: (uid) => clientFor(uid),
    nodeId: () => NODE_ID,
    now: () => Date.now(),
    ttlSeconds: () => PRESENCE_TTL_S,
};

function parseAt(raw: unknown): number | null {
    if (typeof raw !== "string" || !/^\d{1,16}$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : null;
}

function parseRecord(values: readonly (string | null)[]): PresenceRecord | null {
    const [lobby, lobbyAt, world, mapId, instanceId, characterId, worldAt] = values;
    const record: PresenceRecord = {
        lobby: typeof lobby === "string" && lobby.length > 0 ? lobby : null,
        lobbyAt: parseAt(lobbyAt),
        world: typeof world === "string" && world.length > 0 ? world : null,
        mapId: typeof mapId === "string" && mapId.length > 0 ? mapId : null,
        instanceId: typeof instanceId === "string" && instanceId.length > 0 ? instanceId : null,
        characterId: typeof characterId === "string" && characterId.length > 0 ? characterId : null,
        worldAt: parseAt(worldAt),
    };
    return record.lobby === null && record.world === null ? null : record;
}

export function createPresence(deps: PresenceDeps = productionDeps) {
    const touchLobby = async (uid: string, sId: number): Promise<void> => {
        const key = kPresence(uid, sId);
        const client = deps.client(uid);
        // HSET + EXPIRE 走 pipeline（两条命令同 key 同槽）；心跳与 onJoin 同一写口。
        await client.pipeline()
            .hset(key, "lobby", deps.nodeId(), "lobbyAt", String(deps.now()))
            .expire(key, deps.ttlSeconds())
            .exec();
    };
    const clearLobbyIfOwner = async (uid: string, sId: number): Promise<boolean> => {
        const r = await evalshaWithReload(
            deps.client(uid) as Redis,
            PRESENCE_CLEAR_IF_OWNER,
            [kPresence(uid, sId)],
            ["lobby", deps.nodeId(), "lobby", "lobbyAt"],
        );
        return r === 1;
    };
    const touchWorld = async (
        uid: string, sId: number, world: { mapId: string; instanceId: string; characterId: string },
    ): Promise<void> => {
        const key = kPresence(uid, sId);
        await deps.client(uid).pipeline()
            .hset(key, "world", deps.nodeId(), "mapId", world.mapId, "instanceId", world.instanceId,
                "characterId", world.characterId, "worldAt", String(deps.now()))
            .expire(key, deps.ttlSeconds())
            .exec();
    };
    const clearWorldIfOwner = async (uid: string, sId: number): Promise<boolean> => {
        const r = await evalshaWithReload(
            deps.client(uid) as Redis,
            PRESENCE_CLEAR_IF_OWNER,
            [kPresence(uid, sId)],
            ["world", deps.nodeId(), "world", "mapId", "instanceId", "characterId", "worldAt"],
        );
        return r === 1;
    };
    const readPresence = async (uid: string, sId: number): Promise<PresenceRecord | null> => {
        const values = await deps.client(uid).hmget(kPresence(uid, sId), ...PRESENCE_FIELDS);
        return parseRecord(values);
    };
    /** 批量读（party.get 标记等；调用方限制 ≤ PARTY_MAX_SIZE 量级）：按 uid 分别 HMGET，缺席为 null。 */
    const readPresenceMany = async (uids: readonly string[], sId: number): Promise<Map<string, PresenceRecord | null>> => {
        const out = new Map<string, PresenceRecord | null>();
        await Promise.all(uids.map(async (uid) => { out.set(uid, await readPresence(uid, sId)); }));
        return out;
    };
    const isOnline = async (uid: string, sId: number): Promise<boolean> => (await readPresence(uid, sId)) !== null;
    return { touchLobby, clearLobbyIfOwner, touchWorld, clearWorldIfOwner, readPresence, readPresenceMany, isOnline };
}

export type Presence = ReturnType<typeof createPresence>;

/** 生产单例（LobbyRoom / WorldRoom / party.get 共用）。 */
export const presence: Presence = createPresence();
export const { touchLobby, clearLobbyIfOwner, readPresence, readPresenceMany, isOnline } = presence;
