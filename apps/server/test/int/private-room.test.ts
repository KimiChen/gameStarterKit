/**
 * 私房邀请码 / access ticket 集成测试（真 Redis，⛔ 不 mock——先
 * `npm --workspace @game/server run stack`）。对应 Non-intrusive §10.2 中判定方式为
 * `test:int` 的行：SET NX 单一胜者、碰撞重试上限、Lua CAS（旧 lease 不能 renew/release
 * 新 lease）、renew lost、tombstone 隔离期（⛔ 非 DEL）、崩溃 TTL 回收与 generation 永不
 * 重置、ticket jti 状态机（并发/重放/失败重试/expiry）、配额、resolve 折叠类响应字节
 * 完全相同、专用速率桶，以及「invite 房不被 joinOrCreate 选中 + driver 回查 private」
 * 的真服端到端（§6.9 用户流程）。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import {
    C2S,
    GamePhase,
    GAME_ROOM_PROTOCOL_VERSION,
    RoomName,
    type IGameRoomJoinOptions,
} from "@game/shared";
import {
    INVITE_CODE_ALLOC_MAX_ATTEMPTS,
    INVITE_MAX_ROOMS_PER_UID,
    RESOLVE_FAIL_CAPACITY,
} from "../../src/core/infra/config";
import { kInviteCode, kInviteCodeGen, kRl, kRoomTicket, kRoomTicketQuota, zoneCtx } from "../../src/core/infra/keys";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { evalshaWithReload } from "../../src/core/infra/redisScripts";
import { INVITE_CODE_ALLOCATE } from "../../src/core/rooms/invite/redisScripts";
import {
    InviteCodePoolExhaustedError,
    inviteCodeMetrics,
    inviteCodeService,
    readInviteLease,
} from "../../src/core/rooms/invite/InviteCodeReservation";
import {
    accessTicketHash,
    accessTicketService,
    issueCreationTicket,
    issueJoinTicket,
} from "../../src/core/rooms/invite/AccessTicket";
import { handleRoomResolve } from "../../src/core/rooms/privateRoomRpc";
import { RateLimitedError, RpcFault } from "../../src/core/errors";
import { dispatchRpc, type RpcCtx } from "../../src/websocket/dispatcher";
import { registerAllRoutes } from "../../src/websocket/loader";
import { GameRoom } from "../../src/rooms/GameRoom";
import { gameModeRegistry } from "../../src/rooms/GameMode";
import { PrivateFixturePlayerState, type PrivateFixtureState } from "../../src/rooms/schema/GameRoomState";
import { assertRedisUp, issueSession, sleep, testUid } from "./helpers";

const FIXTURE_MODE_ID = "privateFixture";
/** 每次运行独享一段码空间，避免与历史残留/并行运行互踩（清理仍然逐 key UNLINK）。 */
const codeBase = 100000 + (Date.now() % 800000);
let codeSeq = 0;
const nextCode = (): string => String(codeBase + (codeSeq++ % 100000)).padStart(6, "0").slice(-6);
const usedCodes: string[] = [];
const trackedCode = (): string => {
    const code = nextCode();
    usedCodes.push(code);
    return code;
};
const usedTicketHashes: string[] = [];
const usedQuotaUids: string[] = [];

const SID = 0;

after(async () => {
    const client = coordClient();
    const keys: string[] = [];
    for (const code of usedCodes) keys.push(kInviteCode(SID, code), kInviteCodeGen(SID, code));
    for (const hash of usedTicketHashes) keys.push(kRoomTicket(SID, hash));
    for (const uid of usedQuotaUids) keys.push(kRoomTicketQuota(SID, uid));
    if (keys.length > 0) await client.unlink(...keys);
    // 与其它 int 文件同款收尾：断开 Redis 连接，避免测试进程被空闲连接挂住。
    await closeRedis();
});

test("邀请码 lease：同一 (sId,code) 并发分配只有一个胜者；不同区同码互不影响", async () => {
    await assertRedisUp();
    const code = trackedCode();
    const alloc = (roomId: string, sId = SID) => evalshaWithReload(
        coordClient(),
        INVITE_CODE_ALLOCATE,
        [kInviteCode(sId, code), kInviteCodeGen(sId, code)],
        [15_000, roomId, FIXTURE_MODE_ID, 1, "private", sId, `token-${roomId}`],
    );
    // §10.2 行 1（变异：把 SET NX 语义改成无条件 SET → 双胜者，转红）。
    const results = await Promise.all([alloc("room-a"), alloc("room-b")]);
    const winners = results.filter((reply) => Array.isArray(reply) && reply[0] === "ok");
    const losers = results.filter((reply) => Array.isArray(reply) && reply[0] === "taken");
    assert.equal(winners.length, 1, "并发分配同码必须只有一个 lease 成功");
    assert.equal(losers.length, 1);
    // 不同区同码是不同 key（sId 显式入键）：另一个区允许持有同一六位码。
    const otherZone = 9;
    const crossZone = await alloc("room-z", otherZone);
    assert.ok(Array.isArray(crossZone) && crossZone[0] === "ok", "不同区复用同码必须相互独立");
    await coordClient().unlink(kInviteCode(otherZone, code), kInviteCodeGen(otherZone, code));
});

test("邀请码分配：碰撞重试有上限，耗尽 fail-closed 且 ⛔ 不降级为长码", async () => {
    await assertRedisUp();
    const code = trackedCode();
    // 预占该码：后续 codeFactory 恒返回同码 → 每次尝试都碰撞。
    const first = await inviteCodeService.allocate({
        sId: SID, roomId: "occupier", mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
        codeFactory: () => code,
    });
    assert.equal(first.code, code);
    const attempts: string[] = [];
    const exhaustedBefore = inviteCodeMetrics.allocExhausted;
    await assert.rejects(
        inviteCodeService.allocate({
            sId: SID, roomId: "collider", mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
            codeFactory: () => { attempts.push(code); return code; },
        }),
        (error: unknown) => error instanceof InviteCodePoolExhaustedError,
        "重试耗尽必须 fail-closed 稳定错误",
    );
    // §10.2 行 2（变异：去掉重试上限 → 本断言挂死/转红；降级为长码会改变 attempts 内容）。
    assert.equal(attempts.length, INVITE_CODE_ALLOC_MAX_ATTEMPTS, "重试次数必须恰为上限");
    assert.ok(attempts.every((attempt) => /^\d{6}$/.test(attempt)), "⛔ 不得降级为更长的码");
    assert.equal(inviteCodeMetrics.allocExhausted, exhaustedBefore + 1, "码池拥塞必须计入告警指标");
});

test("Lua CAS：旧 lease 不能 renew/release 删除后重用同码的新 lease；generation 永不重置", async () => {
    await assertRedisUp();
    const code = trackedCode();
    const roomA = "cas-room-a";
    const leaseA = await inviteCodeService.allocate({
        sId: SID, roomId: roomA, mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
        codeFactory: () => code,
    });
    assert.equal(leaseA.generation, 1);
    assert.equal(await inviteCodeService.renew({ sId: SID, code, roomId: roomA, leaseToken: leaseA.leaseToken }), "renewed");
    // 释放到 tombstone（短隔离期便于测试重分配）。
    assert.equal(await inviteCodeService.releaseToTombstone({
        sId: SID, code, roomId: roomA, leaseToken: leaseA.leaseToken, cooldownMs: 60,
    }), "ok");
    // 隔离期内：resolve 折叠 + 分配器不得重用（SET NX 因 tombstone key 仍存在而失败）。
    assert.equal(await readInviteLease(SID, code), "unavailable", "隔离期内 resolve 一律折叠");
    await assert.rejects(
        inviteCodeService.allocate({
            sId: SID, roomId: "reuse-too-early", mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
            codeFactory: () => code,
        }),
        (error: unknown) => error instanceof InviteCodePoolExhaustedError,
        "隔离期内该码不可被新房间分配（§10.2：把 tombstone 改回 DEL → 本断言转红）",
    );
    await sleep(120); // 隔离期满由 TTL 自然回收
    const roomB = "cas-room-b";
    const leaseB = await inviteCodeService.allocate({
        sId: SID, roomId: roomB, mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
        codeFactory: () => code,
    });
    assert.equal(leaseB.generation, 2, "generation 独立 INCR，永不重置（在途引用可识别上一代分配）");
    // 旧房的 leaseToken 对新 lease 一律 lost（§10.2：去掉 CAS 的 leaseToken 比对 → 转红）。
    assert.equal(await inviteCodeService.renew({ sId: SID, code, roomId: roomA, leaseToken: leaseA.leaseToken }), "lost");
    assert.equal(await inviteCodeService.releaseToTombstone({
        sId: SID, code, roomId: roomA, leaseToken: leaseA.leaseToken, cooldownMs: 60,
    }), "lost");
    assert.equal(await inviteCodeService.renew({ sId: SID, code, roomId: roomB, leaseToken: leaseB.leaseToken }), "renewed");
    // resolve 命中的是新一代 lease（好友不会被旧房引向新占码的房间以外的地方）。
    const view = await readInviteLease(SID, code);
    assert.ok(view !== "unavailable" && view.roomId === roomB && view.generation === 2);
    await coordClient().unlink(kInviteCode(SID, code));
});

test("崩溃回收：短 lease TTL 到期后 key 消失，同码可重新分配且 generation 递增", async () => {
    await assertRedisUp();
    const code = trackedCode();
    await inviteCodeService.allocate({
        sId: SID, roomId: "crash-room", mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
        leaseTtlMs: 60,
        codeFactory: () => code,
    });
    await sleep(120);
    assert.equal(await coordClient().exists(kInviteCode(SID, code)), 0, "进程崩溃由短 TTL 回收（无隔离期是刻意取舍）");
    const again = await inviteCodeService.allocate({
        sId: SID, roomId: "crash-room-2", mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
        codeFactory: () => code,
    });
    assert.equal(again.generation, 2);
    await coordClient().unlink(kInviteCode(SID, code));
});

test("access ticket jti 状态机：并发 claim、重放、失败重试与 expiry（Lua CAS）", async () => {
    await assertRedisUp();
    const uid = testUid("ticket-owner");
    usedQuotaUids.push(uid);
    // creation ticket：issued → claimed（一次性）→ seated；重复 claim 拒绝。
    const issued = await issueCreationTicket({
        sId: SID, uid, mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private", nowMs: Date.now(),
    });
    assert.equal(issued.kind, "ok");
    const creation = issued as { kind: "ok"; ticket: string };
    usedTicketHashes.push(accessTicketHash(creation.ticket));
    // §10.2：ticket 是不透明串 + 服务端记录（256bit base64url），⛔ 不是自包含签名 token
    //（变异：让 ticket 自带可解析声明（如 JWT 的 `.` 分段）→ 形状断言转红）。
    assert.match(creation.ticket, /^[A-Za-z0-9_-]{43}$/, "ticket 必须是不透明 base64url 串");
    assert.ok(!creation.ticket.includes("."), "⛔ 不得携带自描述分段");
    const claim = await accessTicketService.claimCreation({
        sId: SID, ticket: creation.ticket, roomId: "jti-room", mode: FIXTURE_MODE_ID, profile: "private",
    });
    assert.deepEqual(claim, { kind: "ok", uid, modeVersion: 1 });
    const replayCreate = await accessTicketService.claimCreation({
        sId: SID, ticket: creation.ticket, roomId: "jti-room-2", mode: FIXTURE_MODE_ID, profile: "private",
    });
    assert.equal(replayCreate.kind, "refused", "creation claim 是一次性的（⛔ 一票开两房）");

    // join ticket：issued → pending(session) → seated；并发第二 claim 拒绝；安全失败退回 issued。
    const joinUid = testUid("ticket-joiner");
    const joinTicket = await issueJoinTicket({
        sId: SID, uid: joinUid, roomId: "jti-room", mode: FIXTURE_MODE_ID, modeVersion: 1,
        profile: "private", code: "000000", generation: 1, nowMs: Date.now(),
    });
    usedTicketHashes.push(accessTicketHash(joinTicket.ticket));
    const claimArgs = {
        sId: SID, ticket: joinTicket.ticket, roomId: "jti-room", mode: FIXTURE_MODE_ID,
        profile: "private", code: "000000", generation: 1,
    };
    const [c1, c2] = await Promise.all([
        accessTicketService.claimJoin({ ...claimArgs, sessionId: "sess-a" }),
        accessTicketService.claimJoin({ ...claimArgs, sessionId: "sess-b" }),
    ]);
    assert.equal([c1, c2].filter((entry) => entry.kind === "ok").length, 1, "同 ticket 并发 claim 只有一个胜者");
    const winner = c1.kind === "ok" ? "sess-a" : "sess-b";
    // 绑定不匹配（roomId / generation）在 claim 原子段内拒绝。
    assert.equal((await accessTicketService.claimJoin({ ...claimArgs, sessionId: "sess-c", roomId: "other" })).kind, "refused");
    assert.equal((await accessTicketService.claimJoin({ ...claimArgs, sessionId: "sess-c", generation: 2 })).kind, "refused");
    // 入座前安全失败：退回 issued，原 expiry 内可重试。
    await accessTicketService.releaseJoin(SID, joinTicket.ticket, winner);
    const retry = await accessTicketService.claimJoin({ ...claimArgs, sessionId: "sess-retry" });
    assert.equal(retry.kind, "ok", "安全失败后原 expiry 内必须可恢复重试");
    // 落座：seated 后重放必须拒绝（§10.2：去掉 seated 后的重放拒绝 → 转红）。
    await accessTicketService.seatJoin(SID, joinTicket.ticket, "sess-retry");
    assert.equal((await accessTicketService.claimJoin({ ...claimArgs, sessionId: "sess-late" })).kind, "refused");

    // expiry：短 TTL join ticket 到期后 claim 必须拒绝。
    const shortLived = await issueJoinTicket({
        sId: SID, uid: joinUid, roomId: "jti-room", mode: FIXTURE_MODE_ID, modeVersion: 1,
        profile: "private", code: "000000", generation: 1, nowMs: Date.now(), ttlMs: 60,
    });
    usedTicketHashes.push(accessTicketHash(shortLived.ticket));
    await sleep(120);
    assert.equal(
        (await accessTicketService.claimJoin({ ...claimArgs, ticket: shortLived.ticket, sessionId: "sess-x" })).kind,
        "refused",
        "过期 ticket 的 claim 必须拒绝（PX=exp 权威）",
    );
});

test("配额：单账号活跃私房 + 未消费 creation ticket 原子计数，超限拒绝；随 exp 回收", async () => {
    await assertRedisUp();
    const uid = testUid("quota");
    usedQuotaUids.push(uid);
    const issue = (ttlMs?: number) => issueCreationTicket({
        sId: SID, uid, mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private", nowMs: Date.now(),
        ...(ttlMs === undefined ? {} : { ttlMs }),
    });
    const tickets: string[] = [];
    for (let index = 0; index < INVITE_MAX_ROOMS_PER_UID; index++) {
        const result = await issue(300);
        assert.equal(result.kind, "ok", `第 ${index + 1} 张 creation ticket 应在配额内`);
        tickets.push((result as { kind: "ok"; ticket: string }).ticket);
        usedTicketHashes.push(accessTicketHash((result as { kind: "ok"; ticket: string }).ticket));
    }
    // §10.2：未消费 ticket 计入配额（变异：去掉配额检查 → 本断言转红）。
    assert.equal((await issue()).kind, "quota", "超过 maxConcurrentRoomsPerUid 必须拒绝");
    await sleep(400); // 未消费 ticket 随 exp 自然回收（quota 成员按 score 剪除）
    assert.equal((await issue(300)).kind, "ok", "配额随 ticket exp 自然回收");
});

test("resolve：折叠类五因（不存在/隔离期/过期/mode 不匹配/区不匹配）响应字节完全相同", async () => {
    await assertRedisUp();
    await registerAllRoutes();
    const uid = testUid("fold");
    await issueSession(uid, null, "", SID);

    // 布置五种内部原因：
    const missingCode = trackedCode(); // ① 不存在（从未分配）
    const tombCode = trackedCode(); // ② 隔离期
    const tombLease = await inviteCodeService.allocate({
        sId: SID, roomId: "fold-tomb", mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
        codeFactory: () => tombCode,
    });
    await inviteCodeService.releaseToTombstone({
        sId: SID, code: tombCode, roomId: "fold-tomb", leaseToken: tombLease.leaseToken, cooldownMs: 60_000,
    });
    const expiredCode = trackedCode(); // ③ 过期（短 TTL 已回收 = 不存在同形）
    await inviteCodeService.allocate({
        sId: SID, roomId: "fold-expired", mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
        leaseTtlMs: 60, codeFactory: () => expiredCode,
    });
    await sleep(120);
    const ghostCode = trackedCode(); // ④ mode/profile 不匹配（lease 的 mode 已不在 catalog）
    await inviteCodeService.allocate({
        sId: SID, roomId: "fold-ghost", mode: "ghostMode", modeVersion: 1, profile: "private",
        codeFactory: () => ghostCode,
    });
    const zoneCode = trackedCode(); // ⑤ 区不匹配（码在另一区分配，本区 resolve）
    const otherZone = 9;
    await inviteCodeService.allocate({
        sId: otherZone, roomId: "fold-zone", mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
        codeFactory: () => zoneCode,
    });

    const ctx: RpcCtx = { uid, sessionId: "fold-session", push: () => undefined };
    const replies: string[] = [];
    for (const code of [missingCode, tombCode, expiredCode, ghostCode, zoneCode]) {
        const reply = await zoneCtx.run({ sId: SID }, () => dispatchRpc(ctx, {
            id: "fold-probe", type: "room.resolve", payload: { code },
        }));
        replies.push(JSON.stringify(reply));
    }
    // §10.2（变异：让任一类返回不同 detail/回显 code → 逐对比较转红）。
    for (let index = 1; index < replies.length; index++) {
        assert.equal(replies[index], replies[0], `折叠类第 ${index + 1} 因的响应字节必须与第 1 因完全相同`);
    }
    const parsed = JSON.parse(replies[0]) as { ok: boolean; err?: { code: string; msg: string } };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.err?.code, "ROOM_CODE_UNAVAILABLE");
    for (const [index, reply] of replies.entries()) {
        assert.ok(!reply.includes(usedCodes[usedCodes.length - 5 + index] ?? "@@"), "折叠响应 ⛔ 不回显 code");
    }
    await coordClient().unlink(
        kInviteCode(otherZone, zoneCode), kInviteCodeGen(otherZone, zoneCode),
    );
});

test("resolve：专用速率桶（fail/ok/全区 fail 三桶独立于通用 RPC 桶）", async () => {
    await assertRedisUp();
    const uid = testUid("bucket");
    const failKey = kRl(`room:resolve:fail:${uid}`);
    const okKey = kRl(`room:resolve:ok:${uid}`);
    const zoneKey = kRl(`room:resolve:zonefail:s${SID}`);
    try {
        // 失败预算：RESOLVE_FAIL_CAPACITY 次折叠失败后第 N+1 次是 RATE_LIMITED（查询不再发生）。
        let rateLimited = 0;
        for (let index = 0; index < RESOLVE_FAIL_CAPACITY + 1; index++) {
            try {
                await zoneCtx.run({ sId: SID }, () => handleRoomResolve(uid, { code: "999999" }));
                assert.fail("不存在的码必须失败");
            } catch (error) {
                if (error instanceof RateLimitedError) rateLimited++;
                else assert.ok(error instanceof RpcFault && error.rpcCode === "ROOM_CODE_UNAVAILABLE");
            }
        }
        assert.equal(rateLimited, 1, "超过 per-uid 失败预算必须 RATE_LIMITED");
        // §10.2（变异：把 resolve 改回通用 RPC 桶 → 专用 key 不存在，转红）。
        assert.equal(await coordClient().exists(failKey), 1, "per-uid 失败桶必须是专用 kRl scope");
        assert.equal(await coordClient().exists(zoneKey), 1, "全区失败桶必须存在（对抗多账号横扫）");
        assert.equal(await coordClient().exists(kRl(`rpc:${uid}`)), 0, "直接调用 handler 未触发通用桶——两套预算相互独立");

        // 成功预算：命中即消耗 ok 桶（容量 RESOLVE_OK_CAPACITY），独立于失败预算。
        const okCode = trackedCode();
        await inviteCodeService.allocate({
            sId: SID, roomId: "bucket-room", mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
            codeFactory: () => okCode,
        });
        const okUid = testUid("bucket-ok");
        const okUidKey = kRl(`room:resolve:ok:${okUid}`);
        try {
            const resolved = await zoneCtx.run({ sId: SID }, () => handleRoomResolve(okUid, { code: okCode }));
            usedTicketHashes.push(accessTicketHash(resolved.joinTicket));
            assert.equal(resolved.roomId, "bucket-room");
            assert.equal(await coordClient().exists(okUidKey), 1, "成功预算桶必须是专用 kRl scope");
        } finally {
            await coordClient().unlink(okUidKey, kRl(`room:resolve:fail:${okUid}`));
        }
        assert.equal(await coordClient().exists(okKey), 0, "纯失败流量不消耗成功预算");
    } finally {
        await coordClient().unlink(failKey, okKey, zoneKey);
    }
});

test("端到端：private 房不进 joinOrCreate 撮合、driver 回查 private===true、resolve→joinById→Ready→Start", {
    timeout: 30_000,
}, async () => {
    await assertRedisUp();
    const ownerUid = testUid("e2e-owner");
    const friendUid = testUid("e2e-friend");
    const { token: ownerToken } = await issueSession(ownerUid, null, "", SID);
    const { token: friendToken } = await issueSession(friendUid, null, "", SID);

    // fixture mode 临时登记（生产 catalog.ts ⛔ 不登记它；本测试自建 Server）。
    const unregisterFixture = gameModeRegistry.register(FIXTURE_MODE_ID, () => ({
        id: FIXTURE_MODE_ID,
        roster: { min: 2, max: 4, autoStart: 4 },
        createPlayer({ sessionId, name }: { sessionId: string; name: string }) {
            const player = new PrivateFixturePlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
    }) as never);

    const server = new Server({
        transport: new WebSocketTransport(),
        gracefullyShutdown: false,
        greet: false,
        devMode: false,
    });
    server.define(RoomName.Game, GameRoom).filterBy(["sId", "mode", "profile"]);

    let listening = false;
    let ownerRoom: SDKRoom | undefined;
    let friendRoom: SDKRoom | undefined;
    try {
        await server.listen(0);
        listening = true;
        const address = server.transport.server?.address();
        assert.ok(address && typeof address === "object");
        const endpoint = `http://127.0.0.1:${address.port}`;

        // §6.9 房主流程：prepareCreate（配额原子检查 + creation ticket）→ create。
        usedQuotaUids.push(ownerUid);
        const prepared = await issueCreationTicket({
            sId: SID, uid: ownerUid, mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private", nowMs: Date.now(),
        });
        assert.equal(prepared.kind, "ok");
        const creationTicket = (prepared as { kind: "ok"; ticket: string }).ticket;
        usedTicketHashes.push(accessTicketHash(creationTicket));

        const ownerClient = new SDKClient(endpoint);
        ownerClient.auth.token = ownerToken;
        const createOptions: IGameRoomJoinOptions = {
            v: GAME_ROOM_PROTOCOL_VERSION,
            sId: SID,
            mode: FIXTURE_MODE_ID,
            modeVersion: 1,
            profile: "private",
            access: { kind: "create", ticket: creationTicket },
        };
        ownerRoom = await ownerClient.create(RoomName.Game, createOptions);
        const roomId = ownerRoom.roomId;
        const serverRoom = matchMaker.getLocalRoomById(roomId) as GameRoom;
        const view = serverRoom.state as unknown as PrivateFixtureState;
        assert.match(view.roomCode, /^\d{6}$/, "房主入座后能看到六位 roomCode");
        usedCodes.push(view.roomCode);
        assert.equal(view.ownerId !== "", true, "expectedOwnerUid 落座即为 owner");

        // §10.2：onCreate 返回后从 matchmaker driver 回查 listing，private === true
        //（变异：把 setPrivate 挪到 onCreate 之外并用 persist=false → 本断言转红）。
        const listing = await matchMaker.driver.findOne({ roomId });
        assert.ok(listing, "driver 必须能列出私房（private 只影响撮合可见性）");
        assert.equal(listing.private, true, "invite 房必须以 private 身份持久化");
        assert.ok(!JSON.stringify(listing).includes(view.roomCode), "⛔ roomCode 不进 listing/metadata");

        // 普通 joinOrCreate（同 mode+profile）不得选中私房：无候选 → 尝试新建 → 缺
        // creation ticket 被拒 → 整个 joinOrCreate 失败。
        const strangerClient = new SDKClient(endpoint);
        strangerClient.auth.token = friendToken;
        await assert.rejects(
            strangerClient.joinOrCreate(RoomName.Game, {
                v: GAME_ROOM_PROTOCOL_VERSION, sId: SID, mode: FIXTURE_MODE_ID, modeVersion: 1, profile: "private",
            }),
            "joinOrCreate 不得撮合进 private 房，也不能白手创建私房",
        );

        // §6.9 好友流程：resolve(code) → joinById(roomId, joinTicket)。
        const resolved = await zoneCtx.run({ sId: SID }, () => handleRoomResolve(friendUid, { code: view.roomCode }));
        usedTicketHashes.push(accessTicketHash(resolved.joinTicket));
        assert.equal(resolved.roomId, roomId);
        assert.equal(resolved.mode, FIXTURE_MODE_ID);
        assert.equal(resolved.profile, "private");
        friendRoom = await strangerClient.joinById(roomId, {
            v: GAME_ROOM_PROTOCOL_VERSION,
            sId: SID,
            mode: FIXTURE_MODE_ID,
            modeVersion: 1,
            profile: "private",
            access: { kind: "join", ticket: resolved.joinTicket },
        });
        assert.equal(view.players.size, 2, "好友经 ticket 准入落座");
        // 入座默认 Ready=false；双方 Ready 后房主 Start → Playing。
        ownerRoom.send(C2S.RoomReady, { ready: true });
        friendRoom.send(C2S.RoomReady, { ready: true });
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
            const allReady = [...view.players.values()].every((player) => player.ready);
            if (allReady) break;
            await sleep(20);
        }
        ownerRoom.send(C2S.RoomStart, {});
        while (Date.now() < deadline) {
            if (view.phase === GamePhase.Playing) break;
            await sleep(20);
        }
        assert.equal(view.phase, GamePhase.Playing, "全员 Ready 后房主 Start 必须发布 Playing");
        // Start 成功：码进隔离期（resolve 折叠）。
        assert.equal(await readInviteLease(SID, view.roomCode), "unavailable", "Playing 后码立即失效");
    } finally {
        await Promise.allSettled([
            friendRoom?.leave() ?? Promise.resolve(),
            ownerRoom?.leave() ?? Promise.resolve(),
        ]);
        if (listening) await server.gracefullyShutdown(false);
        unregisterFixture();
    }
});
