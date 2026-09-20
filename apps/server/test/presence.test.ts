/**
 * presence（docs/MMO.md §6.2；MF6a-B1）单测：假 Redis（HASH + TTL 按假时钟过期）+ 两个节点身份。
 *  - onJoin 后 `isOnline` 真且 seat 公开前已写（LobbyRoom 接线：touchLobby 在 onJoin resolve 之前完成）；
 *  - final onLeave 后假（本节点该 (uid,sId) 无连接才清）；
 *  - 节点 b 持新连接时节点 a 下线 ⛔ 不清 `lobby`（顶号跨节点，owner 比较）；
 *  - 伪时钟 90 s 无心跳 ⇒ null（崩溃自愈）；心跳续命。
 * 变异验证：PRESENCE_CLEAR_IF_OWNER 删 owner 比较 → 「顶号跨节点」转红；touchLobby 删 EXPIRE → 「崩溃自愈」转红；
 * LobbyRoom 把 touchLobby 挪到 onJoin resolve 之后 → 「seat 公开前已写」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type Redis from "ioredis";
import { PRESENCE_CLEAR_IF_OWNER, createPresence, type PresenceDeps } from "../src/core/presence/presence";
import { kPresence } from "../src/core/infra/keys";
import { LobbyRoom, type LobbyJoinDependencies } from "../src/websocket/LobbyRoom";
import type { OnlineRegistration } from "../src/websocket/push";

/** 最小假 Redis：HASH + EXPIRE（按注入时钟惰性过期）+ 本模块 Lua 的等价实现。 */
class FakeRedis {
    readonly hashes = new Map<string, Map<string, string>>();
    readonly expires = new Map<string, number>();
    constructor(readonly now: () => number) {}
    private live(key: string): Map<string, string> | undefined {
        const exp = this.expires.get(key);
        if (exp !== undefined && exp <= this.now()) { this.hashes.delete(key); this.expires.delete(key); }
        return this.hashes.get(key);
    }
    async hset(key: string, ...fv: string[]): Promise<number> {
        let m = this.live(key);
        if (!m) { m = new Map(); this.hashes.set(key, m); }
        for (let i = 0; i < fv.length; i += 2) m.set(fv[i], fv[i + 1]);
        return 1;
    }
    async expire(key: string, seconds: number): Promise<number> {
        if (!this.live(key)) return 0;
        this.expires.set(key, this.now() + seconds * 1000);
        return 1;
    }
    async hmget(key: string, ...fields: string[]): Promise<(string | null)[]> {
        const m = this.live(key);
        return fields.map((f) => m?.get(f) ?? null);
    }
    pipeline() {
        const ops: Array<() => Promise<unknown>> = [];
        const chain = {
            hset: (key: string, ...fv: string[]) => { ops.push(() => this.hset(key, ...fv)); return chain; },
            expire: (key: string, seconds: number) => { ops.push(() => this.expire(key, seconds)); return chain; },
            exec: async () => { const out: [null, unknown][] = []; for (const op of ops) out.push([null, await op()]); return out; },
        };
        return chain;
    }
    async evalsha(sha: string, _numkeys: number, key: string, ...argv: string[]): Promise<number> {
        if (sha !== PRESENCE_CLEAR_IF_OWNER.sha) throw new Error("NOSCRIPT unexpected script");
        const m = this.live(key);
        const owner = m?.get(argv[0]);
        if (owner === undefined || owner !== argv[1]) return 0;
        for (const f of argv.slice(2)) m!.delete(f);
        if (m!.size === 0) { this.hashes.delete(key); this.expires.delete(key); }
        return 1;
    }
    async call(): Promise<never> { throw new Error("unexpected call"); }
}

function twoNodes() {
    let now = 1_000_000;
    const redis = new FakeRedis(() => now);
    const deps = (nodeId: string): PresenceDeps => ({
        client: () => redis as unknown as Redis,
        nodeId: () => nodeId,
        now: () => now,
        ttlSeconds: () => 90,
    });
    return { redis, a: createPresence(deps("node-a")), b: createPresence(deps("node-b")), advance: (ms: number) => { now += ms; } };
}

test("presence：touch 后 isOnline 真、lobby=NODE_ID；clearIfOwner 只清自己写的并在字段空时删键", async () => {
    const { redis, a } = twoNodes();
    await a.touchLobby("u1", 3);
    assert.equal(await a.isOnline("u1", 3), true);
    assert.equal((await a.readPresence("u1", 3))?.lobby, "node-a");
    assert.equal(await a.isOnline("u1", 4), false, "presence 按 (uid, sId) 分键");
    assert.equal(await a.clearLobbyIfOwner("u1", 3), true);
    assert.equal(await a.isOnline("u1", 3), false);
    assert.equal(redis.hashes.has(kPresence("u1", 3)), false, "字段清空后整键 DEL");
});

test("presence：顶号跨节点——节点 b 持新连接时节点 a 的迟到下线 ⛔ 不清 lobby", async () => {
    const { a, b } = twoNodes();
    await a.touchLobby("u1", 0);
    await b.touchLobby("u1", 0); // 新登录落在 b：lobby 改写为 node-b
    assert.equal(await a.clearLobbyIfOwner("u1", 0), false, "owner ≠ node-a ⇒ 不清");
    assert.equal((await a.readPresence("u1", 0))?.lobby, "node-b");
    assert.equal(await b.clearLobbyIfOwner("u1", 0), true);
    assert.equal(await b.isOnline("u1", 0), false);
});

test("presence：伪时钟 90 s 无心跳 ⇒ null（崩溃自愈）；心跳续命", async () => {
    const { a, advance } = twoNodes();
    await a.touchLobby("u1", 0);
    advance(60_000);
    assert.equal(await a.isOnline("u1", 0), true);
    await a.touchLobby("u1", 0); // 心跳
    advance(60_000);
    assert.equal(await a.isOnline("u1", 0), true, "心跳后 TTL 重置");
    advance(30_000);
    assert.equal(await a.readPresence("u1", 0), null, "满 TTL 无心跳 ⇒ 视为离线");
});

test("presence：world 字段独立于 lobby；readPresenceMany 缺席为 null", async () => {
    const { a, b } = twoNodes();
    await a.touchLobby("u1", 0);
    await b.touchWorld("u1", 0, { mapId: "m1", instanceId: "i1", characterId: "c1" });
    const rec = await a.readPresence("u1", 0);
    assert.deepEqual({ lobby: rec?.lobby, world: rec?.world, mapId: rec?.mapId }, { lobby: "node-a", world: "node-b", mapId: "m1" });
    assert.equal(await a.clearWorldIfOwner("u1", 0), false, "world 由 b 写，a 不得清");
    assert.equal(await b.clearWorldIfOwner("u1", 0), true);
    assert.equal((await a.readPresence("u1", 0))?.world, null);
    assert.equal((await a.readPresence("u1", 0))?.lobby, "node-a", "清 world 不动 lobby");
    const many = await a.readPresenceMany(["u1", "u2"], 0);
    assert.equal(many.get("u1")?.lobby, "node-a");
    assert.equal(many.get("u2"), null);
});

// ── LobbyRoom 接线 ───────────────────────────────────────────────────────────

function lobbyWith(zoneOfflineOnUnregister: boolean | undefined) {
    const log: string[] = [];
    let clearResolve!: () => void;
    const cleared = new Promise<void>((resolve) => { clearResolve = resolve; });
    const deps: LobbyJoinDependencies = {
        ensureCharacterReady: async () => { log.push("ready"); },
        verifySession: async () => {},
        registerOnline: (_uid, sessionId): OnlineRegistration => { log.push(`register:${sessionId}`); return { token: Symbol(sessionId) }; },
        unregisterOnline: (_uid, sessionId) => { log.push(`unregister:${sessionId}`); return zoneOfflineOnUnregister; },
        tokenHashOf: (value) => `hash:${value}`,
        loadFields: async () => ({}),
        setOnlineGuild: () => {},
        presence: {
            touchLobby: async (uid, sId) => { log.push(`touch:${uid}:${sId}`); },
            clearLobbyIfOwner: async (uid, sId) => { log.push(`clear:${uid}:${sId}`); clearResolve(); return true; },
        },
    };
    const room = new LobbyRoom(deps);
    room.clock.stop();
    const client = {
        sessionId: "seat-1",
        auth: { userId: "u-presence", token: "tok", sId: 7 },
        send: () => {},
        leave: async () => {},
    } as never;
    return { room, client, log, cleared };
}

test("LobbyRoom：presence 在 registerOnline 之后、onJoin resolve 之前写；final onLeave 本节点无连接时清", async () => {
    const { room, client, log, cleared } = lobbyWith(true);
    await room.onJoin(client);
    assert.deepEqual(log, ["register:seat-1", "ready", "touch:u-presence:7"], "touch 必须在 onJoin resolve 之前、registerOnline 之后");
    room.heartbeatPresence();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(log.filter((l) => l.startsWith("touch:")).length, 2, "心跳给每条有效登记续命");
    room.onLeave(client);
    await cleared;
    assert.deepEqual(log.slice(-2), ["unregister:seat-1", "clear:u-presence:7"]);
    room.heartbeatPresence();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(log.filter((l) => l.startsWith("touch:")).length, 2, "离开后不再心跳");
});

test("LobbyRoom：同 (uid,sId) 本节点仍有其它连接（zoneOffline=false）⇒ 离开不清 presence；假 deps 返回 void 同样不清", async () => {
    for (const flag of [false, undefined]) {
        const { room, client, log } = lobbyWith(flag);
        await room.onJoin(client);
        room.onLeave(client);
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(log.some((l) => l.startsWith("clear:")), false, `zoneOffline=${String(flag)} 不得清 presence`);
    }
});
