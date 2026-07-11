/**
 * M8a DoD 集成测试（10·M8a）——真实 Redis(6401) + 真实 MySQL(3316)，⛔ 不 mock：
 *  1. 生产→消费闭环：emitMatchEvidence 一条证据（同局两名玩家同 payload）→ consumeOnce →
 *     match_index / match_results 各一行、payload 完整回读（09·K5 输入完整性）
 *  2. 幂等闸（DoD）：同一 matchId 重复投递 + 重复消费 → match_results 仍只有一行
 *     （非分区 match_index ODKU 闸，09·DB4/05·Δ2；-FOUND_ROWS 下 affectedRows 语义可信）
 *  3. 常驻消费循环冒烟：startMatchConsumer（独占连接 XREADGROUP BLOCK）自动落库；
 *     stopMatchConsumer 打断阻塞及时退出
 *  4. 房间端到端：@colyseus/testing 起真 GameRoom 打完一局（绑定框架账号）→ state.matchId
 *     开局即生成（09·K4）→ 收局后 stream:match 出现该 matchId 的证据 → 消费落库
 * 前置：npm --workspace @game/server run stack。清理：XDEL 测试条目 + DELETE 测试行（09·R6）。
 */
import "./env-setup"; // 必须第一个 import（env 先于 config.ts 模块级读取）
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";

import { C2S, GamePhase, RoomName } from "@game/shared";
import {
  consumeOnce,
  emitMatchEvidence,
  MATCH_MODE_CASUAL,
  newMatchId,
  startMatchConsumer,
  stopMatchConsumer,
  type MatchEvidence,
} from "../../src/gameplay/matchConsumer";
import { activeLruBucketOf, kActiveLru, kSess, K_STREAM_MATCH } from "../../src/infra/keys";
import { closeMysql, getPool, type RowDataPacket } from "../../src/infra/mysql";
import { clientFor, clientForKey, closeRedis, indexClientFor } from "../../src/infra/redisRoute";
import { assertRedisUp, cleanupUser, sleep, testUid } from "./helpers";

const GROUP = "settle";
const stream = () => clientForKey(K_STREAM_MATCH);

/** 本轮用过的 matchId / stream 条目 id —— after 里定点清理，不碰别人的数据。 */
const usedMatchIds: string[] = [];
const usedStreamIds: string[] = [];

/** 排干历史遗留（先前测试运行的残余条目/PEL）：ACK + XDEL，⛔ 不落库——避免污染本轮断言。 */
async function drainStale(): Promise<void> {
  const c = stream();
  try {
    await c.xgroup("CREATE", K_STREAM_MATCH, GROUP, "0", "MKSTREAM");
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("BUSYGROUP")) { throw e; }
  }
  // 历史 PEL（崩溃进程遗留）：XACK 对任意 owner 的 pending 条目都有效
  const summary = (await c.xpending(K_STREAM_MATCH, GROUP)) as [number, ...unknown[]];
  if (Number(summary?.[0] ?? 0) > 0) {
    const detail = (await c.call("XPENDING", K_STREAM_MATCH, GROUP, "-", "+", "1000")) as [string, ...unknown[]][];
    const ids = detail.map((d) => d[0]);
    if (ids.length > 0) {
      await c.xack(K_STREAM_MATCH, GROUP, ...ids);
      await c.xdel(K_STREAM_MATCH, ...ids);
    }
  }
  // 未投递的历史条目：用一次性 drain consumer 读走 → ACK → XDEL
  const drainName = `drain_${process.pid}`;
  for (;;) {
    const res = (await c.call(
      "XREADGROUP", "GROUP", GROUP, drainName, "COUNT", "1000", "STREAMS", K_STREAM_MATCH, ">",
    )) as [string, [string, string[]][]][] | null;
    const entries = res?.[0]?.[1] ?? [];
    if (entries.length === 0) { break; }
    const ids = entries.map(([id]) => id);
    await c.xack(K_STREAM_MATCH, GROUP, ...ids);
    await c.xdel(K_STREAM_MATCH, ...ids);
  }
  await c.xgroup("DELCONSUMER", K_STREAM_MATCH, GROUP, drainName);
}

before(async () => {
  await assertRedisUp();
  await drainStale();
});

after(async () => {
  const c = stream();
  if (usedStreamIds.length > 0) { await c.xdel(K_STREAM_MATCH, ...usedStreamIds); }
  if (usedMatchIds.length > 0) {
    const ph = usedMatchIds.map(() => "?").join(",");
    await getPool().query(`DELETE FROM match_results WHERE match_id IN (${ph})`, usedMatchIds);
    await getPool().query(`DELETE FROM match_index WHERE match_id IN (${ph})`, usedMatchIds);
  }
  await closeMysql();
  await closeRedis();
});

/** 造一条两名玩家的完整证据（一局一条：两人名次同 payload，09·K5）。 */
function makeEvidence(matchId: string): MatchEvidence {
  return {
    matchId,
    mode: MATCH_MODE_CASUAL,
    seed: 305419896,
    mapIndex: 2,
    loadout: null, // 休闲 BYO
    injectWaves: [{ nonce: 0, count: 1, targetSessionId: "sB", atMs: 41_000 }],
    participants: [
      { sessionId: "sA", userId: "u_int_a", name: "甲", place: 1, round: 9, elapsedMs: 88_000, survived: true },
      { sessionId: "sB", userId: null, name: "乙", place: 2, round: 6, elapsedMs: 61_000, survived: false },
    ],
  };
}

async function countRows(table: "match_index" | "match_results", matchId: string): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE match_id = ?`, [matchId]);
  return Number(rows[0].n);
}

// ── 1. 生产 → 消费闭环：一条证据 → 两表各一行、payload 完整 ─────────────────

test("emitMatchEvidence + consumeOnce：一局(两名玩家)一条证据 → match_index/match_results 各一行，payload 完整", async () => {
  const m = newMatchId();
  usedMatchIds.push(m);
  // matchId 形制（09·K4/05）：m_ + 时间戳36 + 随机hex，纯 ascii ≤ 40
  assert.match(m, /^m_[0-9a-z]+[0-9a-f]{16}$/);
  assert.ok(m.length <= 40, `matchId 长度 ${m.length} ≤ 40`);

  const ev = makeEvidence(m);
  const sid = await emitMatchEvidence(ev);
  assert.ok(sid, "XADD 成功返回条目 id");
  usedStreamIds.push(sid!);

  const n = await consumeOnce();
  assert.ok(n >= 1, "至少消费到本条证据");

  // 一局一条（两名玩家在同一 payload），⛔ 不是每人一行
  assert.equal(await countRows("match_index", m), 1, "match_index 一行");
  assert.equal(await countRows("match_results", m), 1, "match_results 一行（两人同一条证据）");

  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT mode, payload FROM match_results WHERE match_id = ?", [m]);
  assert.equal(rows[0].mode, MATCH_MODE_CASUAL);
  // mysql2 JSON 列自动解析（09·DB8）；证据完整回读：seed/mapIndex/loadout/InjectWave/两人名次
  assert.deepEqual(rows[0].payload, ev, "payload 与投递的证据逐字段一致（09·K5 输入完整）");
  assert.equal((rows[0].payload as MatchEvidence).participants.length, 2);
});

// ── 2. 幂等闸（DoD）：同 matchId 重复投递/重复消费 → 只一行 ────────────────

test("同一 matchId 重复投递 + 重复消费 → match_results 仍只有一行（match_index 幂等闸）", async () => {
  const m = newMatchId();
  usedMatchIds.push(m);
  const ev = makeEvidence(m);

  // 重复投递：同一局的证据被 XADD 两次（如收局路径重放/进程重启补发）
  const id1 = await emitMatchEvidence(ev);
  const id2 = await emitMatchEvidence(ev);
  assert.ok(id1 && id2 && id1 !== id2, "两条独立的 stream 条目");
  usedStreamIds.push(id1!, id2!);

  const n = await consumeOnce();
  assert.ok(n >= 2, "两条都被消费（重复者判重跳过但仍 ACK）");
  assert.equal(await countRows("match_index", m), 1, "幂等闸只放行一次");
  assert.equal(await countRows("match_results", m), 1, "重复投递不产生第二行（M8 DoD）");

  // 重复消费：再跑一轮,无新条目、无 PEL 残留 → 0 条,行数不变
  assert.equal(await consumeOnce(), 0, "已 ACK 的条目不会二次投递");
  assert.equal(await countRows("match_results", m), 1);
});

// ── 3. 常驻消费循环冒烟：BLOCK 等待中来证据 → 自动落库；stop 能打断阻塞快速退出 ──

test("startMatchConsumer 常驻循环：阻塞等待中投递的证据被自动落库；stopMatchConsumer 及时退出", async () => {
  startMatchConsumer();
  try {
    const m = newMatchId();
    usedMatchIds.push(m);
    const sid = await emitMatchEvidence(makeEvidence(m));
    assert.ok(sid);
    usedStreamIds.push(sid!);

    // 循环用独占连接 XREADGROUP BLOCK；给它一点时间取走并落库
    let rows = 0;
    for (let i = 0; i < 60 && rows === 0; i++) { await sleep(50); rows = await countRows("match_results", m); }
    assert.equal(rows, 1, "常驻循环自动消费落库");
  } finally {
    const t0 = Date.now();
    await stopMatchConsumer(); // disconnect 打断阻塞中的 XREADGROUP
    assert.ok(Date.now() - t0 < 3000, "stop 不用等完整个 BLOCK 周期");
  }
});

// ── 4. 房间端到端：真 GameRoom 打一局 → matchId 进 state、证据进流、消费落库 ──

test("GameRoom 端到端：开局生成 matchId（09·K4）→ 收局 XADD 证据 → 消费落库", async () => {
  const colyseus: ColyseusTestServer = await boot((await import("../../src/app.config")).server);
  const uids: string[] = [];
  try {
    // 造框架账号会话（绕过 wxLogin——微信侧 M3 已单独测过；GameRoom.onAuth 走 verifyBearer 快路径，
    // 快路径只查 sess:{uid}，无需 accounts 行）
    const { issueSession } = await import("../../src/auth/session");
    const { createUser } = await import("../../src/gameplay/userStore");
    const mk = async (name: string) => {
      const uid = testUid(name).slice(0, 32);
      uids.push(uid);
      await createUser(uid);
      const { token } = await issueSession(uid, 0, null);
      return { uid, token };
    };
    const a = await mk("gsA");
    const b = await mk("gsB");

    const room = await colyseus.createRoom(RoomName.Game, {});
    const c1 = await colyseus.connectTo(room, { token: a.token });
    assert.equal(room.state.matchId, "", "等人期尚无 matchId");
    const c2 = await colyseus.connectTo(room, { token: b.token });
    c1.onMessage("*", () => { });
    c2.onMessage("*", () => { });

    // 两人到齐即开局
    for (let i = 0; i < 80 && room.state.phase !== GamePhase.Playing; i++) { await room.waitForNextPatch(); }
    assert.equal(room.state.phase, GamePhase.Playing, "开赛");
    const matchId = room.state.matchId as string;
    usedMatchIds.push(matchId);
    assert.match(matchId, /^m_[0-9a-z]+[0-9a-f]{16}$/, "开局即生成 matchId 写进 state（09·K4）");

    // 击杀收局：服务端权威状态直接把守方血量压到一击可破（@colyseus/testing 的 room 即服务端实例），
    // c1 一发普攻收人头 → 存活 ≤1 → Settle
    room.state.players.get(c2.sessionId)!.hp = 1;
    c1.send(C2S.CastSkill, { skillId: 1, targetId: c2.sessionId });
    for (let i = 0; i < 80 && room.state.phase !== GamePhase.Settle; i++) { await room.waitForNextPatch(); }
    assert.equal(room.state.phase, GamePhase.Settle, "收局");

    // 证据是 fire-and-forget XADD：轮询等它到流里（同一 matchId）
    let entryId: string | undefined;
    for (let i = 0; i < 40 && !entryId; i++) {
      const entries = (await stream().xrange(K_STREAM_MATCH, "-", "+")) as [string, string[]][];
      for (const [id, fields] of entries) {
        const idx = fields.indexOf("matchId");
        if (idx >= 0 && fields[idx + 1] === matchId) { entryId = id; break; }
      }
      if (!entryId) { await sleep(50); }
    }
    assert.ok(entryId, "收局后 stream:match 出现本局证据");
    usedStreamIds.push(entryId!);

    // 消费落库：payload 里两名参与者、userId 齐全、名次正确
    await consumeOnce();
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT mode, payload FROM match_results WHERE match_id = ?", [matchId]);
    assert.equal(rows.length, 1, "端到端一局一行");
    assert.equal(rows[0].mode, MATCH_MODE_CASUAL, "休闲局 mode=0");
    const payload = rows[0].payload as MatchEvidence;
    assert.equal(payload.participants.length, 2);
    const winner = payload.participants.find((p) => p.place === 1);
    const loser = payload.participants.find((p) => p.place === 2);
    assert.equal(winner?.userId, a.uid, "幸存者第一");
    assert.equal(winner?.survived, true);
    assert.equal(loser?.userId, b.uid, "阵亡者第二");
    assert.equal(loser?.survived, false);
    assert.ok(typeof payload.seed === "number" && payload.mapIndex === 0, "seed/mapIndex 入证据");
    assert.equal(payload.loadout, null, "休闲局无归一化 loadout（BYO）");
  } finally {
    await colyseus.shutdown();
    for (const u of uids) {
      await cleanupUser(u);
      await clientFor(u).unlink(kSess(u));
      const bkt = activeLruBucketOf(u);
      await indexClientFor(bkt).zrem(kActiveLru(bkt), u);
    }
  }
});
