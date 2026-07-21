import "./env-setup"; // ⚠ 必须第一个 import（限流放宽）

/**
 * 工会广播/事件链路集成测试（docs/SERVER.md 2026-07，此前只有 lobby-rpc-contract 的 schema 校验）：
 *  1. join：档字段 + memberJoin 事件（seq 工会内单调）+ 在线成员收「只带 seq」的唤醒推送；
 *     getEvents 全量/增量自愈拉取（唤醒式推送语义：推送是优化，拉取是权威路径）
 *  2. 幂等重放：同 clientReqId 返回缓存结果，⛔ 不重复发事件
 *  3. leave：在线索引清除（不再收工会唤醒）+ memberLeave 留在原工会频道；无工会视图归零
 * 前置：npm --workspace @game/server run stack（且 dev server 未占 2568）。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { LOBBY_MSG_PUSH, LOBBY_MSG_RPC, PROTOCOL_VERSION, RoomName } from "@game/shared";
import { server } from "../../src/app.config";
import { issueSession } from "../../src/core/auth/session";
import { GUILD_CATALOG } from "../../src/core/guild/catalog";
import { createUser } from "../../src/core/userRecord";
import { stopMailWakeLoop } from "../../src/websocket/push";
import {
  activeLruBucketOf, kActiveLru, kGuildEvtLog, kGuildEvtSeq, kSess, kUser,
} from "../../src/core/infra/keys";
import { clientFor, clientForKey, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { ResultSetHeader } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, sleep, testUid } from "./helpers";

let colyseus: ColyseusTestServer;
const uids: string[] = [];
const gids = new Set<number>();

/** 工会 id 从目录顺序取（join 有 guildExists 硬校验，目录外 gid 直接被拒）：
 *  跨运行隔离改为 before 钩子里预清理全部目录 gid 的事件键（含上轮中断残留）。 */
let gidCursor = 0;
const newGid = (): number => {
  const entry = GUILD_CATALOG[gidCursor++];
  if (!entry) { throw new Error(`工会目录只有 ${GUILD_CATALOG.length} 个，测试用量超了——扩目录或复用`); }
  gids.add(entry.gid);
  return entry.gid;
};

/** 造号：accounts 行 + Redis 档 + 会话（同 gateway.test 模式，绕过 wxLogin）。 */
async function makeUser(name: string): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO accounts (user_id, openid) VALUES (?, ?)", [uid, `op_${uid}`]);
  await createUser(uid);
  const { token } = await issueSession(uid, 0, null);
  return { uid, token };
}

/** 经 SDK 入大厅房（v = 协议版本，onAuth 硬闸）。 */
async function joinLobby(token: string) {
  colyseus.sdk.auth.token = token;
  return colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: PROTOCOL_VERSION });
}

/** RPC 往返：按信封 id 配对回包。 */
let rpcSeq = 0;
function rpc(room: Awaited<ReturnType<typeof joinLobby>>, type: string, payload?: unknown):
  Promise<{ id: string; ok: boolean; data?: any; err?: { code: string; msg: string } }> {
  const id = `r${rpcSeq++}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop(); // 超时也要摘监听——房间存活期内 onMessage 会持续累积
      reject(new Error(`rpc 超时: ${type}`));
    }, 15_000);
    const stop = room.onMessage(LOBBY_MSG_RPC, (reply: any) => {
      if (reply.id !== id) { return; }
      clearTimeout(timer);
      stop();
      resolve(reply);
    });
    room.send(LOBBY_MSG_RPC, { id, type, payload });
  });
}

before(async () => {
  await assertRedisUp();
  // 预清理全部目录 gid 的事件键：目录固定 → 键跨运行常驻，开跑前清干净保证 seq 从 1 起
  for (const { gid } of GUILD_CATALOG) {
    await clientForKey(kGuildEvtSeq(gid)).unlink(kGuildEvtSeq(gid), kGuildEvtLog(gid));
  }
  colyseus = await boot(server);
});

after(async () => {
  stopMailWakeLoop();
  await colyseus?.shutdown();
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await cleanupUser(u);
    await clientFor(u).unlink(kSess(u));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  for (const gid of gids) {
    await clientForKey(kGuildEvtSeq(gid)).unlink(kGuildEvtSeq(gid), kGuildEvtLog(gid));
  }
  await closeRedis();
  await closeMysql();
});

test("join：写档 + memberJoin 事件 + 在线成员收唤醒推送；getEvents 全量/增量自愈拉取", async () => {
  const gid = newGid();
  const a = await makeUser("ga");
  const b = await makeUser("gb");
  const roomA = await joinLobby(a.token);
  const roomB = await joinLobby(b.token);
  await sleep(50); // 等 onJoin 工会索引异步挂载落定（读档先于端点写），防与端点维护点交错

  const j1 = await rpc(roomA, "guild.join", { clientReqId: "gj_a1", guildId: gid });
  assert.equal(j1.ok, true);
  assert.equal(j1.data.seq, 1, "新工会首发 seq=1");
  assert.equal(Number(await clientFor(a.uid).hget(kUser(a.uid), "guildId")), gid, "档字段已写");

  // B 入会同工会：A 已在索引中（join 端点的换会维护点），收到只带 seq+guildId 的唤醒
  const pushed = new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("等 guild.event 推送超时")), 8000);
    roomA.onMessage(LOBBY_MSG_PUSH, (m: any) => {
      if (m.type === "guild.event") { clearTimeout(t); resolve(m.data); }
    });
  });
  const j2 = await rpc(roomB, "guild.join", { clientReqId: "gj_b1", guildId: gid });
  assert.equal(j2.data.seq, 2, "seq 工会内单调递增");
  assert.deepEqual(await pushed, { seq: 2, guildId: gid }, "唤醒只带 seq+guildId，不承载事件内容");

  // getEvents 自愈端：全量（sinceSeq=0）与增量（sinceSeq=1）同一条路径
  const all = await rpc(roomA, "guild.getEvents", { sinceSeq: 0 });
  assert.equal(all.data.guildId, gid);
  assert.equal(all.data.latestSeq, 2);
  assert.deepEqual(
    all.data.events.map((e: any) => [e.seq, e.kind]),
    [[1, "memberJoin"], [2, "memberJoin"]],
    "seq 升序返回两条 memberJoin",
  );
  const inc = await rpc(roomA, "guild.getEvents", { sinceSeq: 1 });
  assert.equal(inc.data.events.length, 1);
  assert.equal(inc.data.events[0].seq, 2);

  await roomA.leave();
  await roomB.leave();
});

test("幂等重放：同 clientReqId 重试返回缓存结果，不重复发事件", async () => {
  const gid = newGid();
  const u = await makeUser("idem");
  const room = await joinLobby(u.token);
  await sleep(50);

  const r1 = await rpc(room, "guild.join", { clientReqId: "gj_idem", guildId: gid });
  const r2 = await rpc(room, "guild.join", { clientReqId: "gj_idem", guildId: gid });
  assert.equal(r1.data.seq, 1);
  assert.equal(r2.data.seq, 1, "幂等命中回缓存结果（同一 clientReqId）");

  const ev = await rpc(room, "guild.getEvents", { sinceSeq: 0 });
  assert.equal(ev.data.events.length, 1, "重放不产生重复 memberJoin 事件");
  await room.leave();
});

test("join 目录外 gid：INVALID_PAYLOAD 拒绝，档/事件键零写入（防恶意遍历铸键）", async () => {
  const bogusGid = 987_654_321; // 不在 GUILD_CATALOG
  const u = await makeUser("bogus");
  const room = await joinLobby(u.token);
  await sleep(50);

  const r = await rpc(room, "guild.join", { clientReqId: "gj_bogus", guildId: bogusGid });
  assert.equal(r.ok, false);
  assert.equal(r.err?.code, "INVALID_PAYLOAD", "目录外 gid 必须被拒");
  const g = await clientFor(u.uid).hget(kUser(u.uid), "guildId");
  assert.ok(g === null || g === "0", `档字段不得被写（实际: ${g}；缺失即默认 0，⛔ 不回填）`);
  assert.equal(await clientForKey(kGuildEvtSeq(bogusGid)).exists(kGuildEvtSeq(bogusGid), kGuildEvtLog(bogusGid)), 0,
    "未知 gid 不得铸出任何事件键（durable noeviction，键面必须有硬上限）");
  await room.leave();
});

test("leave：索引清除不再收唤醒 + memberLeave 留原频道；无工会 getEvents 归零", async () => {
  const gid = newGid();
  const a = await makeUser("la");
  const b = await makeUser("lb");
  const roomA = await joinLobby(a.token);
  const roomB = await joinLobby(b.token);
  await sleep(50);

  await rpc(roomA, "guild.join", { clientReqId: "gl_a", guildId: gid });
  await rpc(roomB, "guild.join", { clientReqId: "gl_b", guildId: gid });
  const lv = await rpc(roomA, "guild.leave", { clientReqId: "gl_lv" });
  assert.equal(lv.ok, true);

  // 档已清 → 无工会视图归零（客户端据此重置 seq 水位）
  const none = await rpc(roomA, "guild.getEvents", { sinceSeq: 0 });
  assert.deepEqual(none.data, { events: [], latestSeq: 0, guildId: 0 });

  // A 已退出索引：B 再入会触发的新唤醒，A 不应收到
  let got = false;
  roomA.onMessage(LOBBY_MSG_PUSH, (m: any) => { if (m.type === "guild.event") { got = true; } });
  const j2 = await rpc(roomB, "guild.join", { clientReqId: "gl_b2", guildId: gid });
  assert.equal(j2.data.seq, 4, "1=A.join 2=B.join 3=A.leave 4=B.join");
  await sleep(300);
  assert.equal(got, false, "退会后索引已清（leave 维护点），不再收工会唤醒");

  // memberLeave 留在原工会频道：B 增量可见 [memberLeave, memberJoin]
  const inc = await rpc(roomB, "guild.getEvents", { sinceSeq: 2 });
  assert.deepEqual(inc.data.events.map((e: any) => e.kind), ["memberLeave", "memberJoin"]);

  await roomA.leave();
  await roomB.leave();
});
