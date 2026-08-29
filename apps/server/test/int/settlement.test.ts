/**
 * M8a DoD 集成测试（10·M8a）——真实 Redis(6401) + 真实 MySQL(3316)，⛔ 不 mock：
 *  1. 生产→消费闭环：emitMatchEvidence 一条证据（同局两名玩家同 payload）→ consumeOnce →
 *     match_index / match_results 各一行、payload 完整回读（09·K5 输入完整性）
 *  2. 幂等闸（DoD）：同一 matchId 重复投递 + 重复消费 → match_results 仍只有一行
 *     （非分区 match_index ODKU 闸，09·DB4/05·Δ2；-FOUND_ROWS 下 affectedRows 语义可信）
 *  3. 常驻消费循环冒烟：startMatchConsumer（独占连接 XREADGROUP BLOCK）自动落库；
 *     stopMatchConsumer 打断阻塞及时退出
 *  4. 房间端到端：@colyseus/testing 起真 GameRoom 打完一局（绑定框架账号）→ state.matchId
 *     开局即生成（09·K4）→ 收局后 stream:match:v2 出现该 matchId 的证据 → 消费落库
 * 前置：npm --workspace @game/server run stack。清理：XDEL 测试条目 + DELETE 测试行（09·R6）。
 */
import "./env-setup"; // 必须第一个 import（env 先于 config.ts 模块级读取）
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";

import {
  C2S,
  ErrorCode,
  GamePhase,
  GameplayModeId,
  PROTOCOL_VERSION,
  RoomName,
  type IGameRoomJoinOptions,
} from "@game/shared";
import {
  consumeOnce,
  emitMatchEvidence,
  MATCH_MODE_CASUAL,
  MATCH_MODE_RANKED,
  MATCH_STREAM_CONSUMER,
  MATCH_STREAM_SCHEMA_VERSION,
  newMatchId,
  quarantineMalformedMatchEntry,
  startMatchConsumer,
  stopMatchConsumer,
  trimToSafePoint,
  type MatchEvidence,
} from "../../src/core/match/matchConsumer";
import {
  activeLruBucketOf, kActiveLru, kSess,
  K_STREAM_MATCH, K_STREAM_MATCH_QUARANTINE, K_STREAM_MATCH_V2,
} from "../../src/core/infra/keys";
import { closeMysql, getPool, type RowDataPacket } from "../../src/core/infra/mysql";
import { bucketOf, clientFor, clientForKey, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { GameRoom } from "../../src/rooms/GameRoom";
import { assertRedisUp, cleanupUser, sleep, testUid } from "./helpers";

const GROUP = "settle";
const MATCH_STREAM_KEYS = [K_STREAM_MATCH, K_STREAM_MATCH_V2] as const;
const stream = (key: string = K_STREAM_MATCH_V2) => clientForKey(key);

/** 本轮用过的 matchId / stream 条目 id —— after 里定点清理，不碰别人的数据。 */
const usedMatchIds: string[] = [];
const usedStreamEntries: { key: string; id: string }[] = [];
const rememberStreamEntry = (key: string, id: string): void => {
  usedStreamEntries.push({ key, id });
};

/** 排干历史遗留（先前测试运行的残余条目/PEL）：ACK + XDEL，⛔ 不落库——避免污染本轮断言。 */
async function drainStale(key: string): Promise<void> {
  const c = stream(key);
  try {
    await c.xgroup("CREATE", key, GROUP, "0", "MKSTREAM");
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("BUSYGROUP")) { throw e; }
  }
  // 历史 PEL（崩溃进程遗留）：XACK 对任意 owner 的 pending 条目都有效
  const summary = (await c.xpending(key, GROUP)) as [number, ...unknown[]];
  if (Number(summary?.[0] ?? 0) > 0) {
    const detail = (await c.call("XPENDING", key, GROUP, "-", "+", "1000")) as [string, ...unknown[]][];
    const ids = detail.map((d) => d[0]);
    if (ids.length > 0) {
      await c.xack(key, GROUP, ...ids);
      await c.xdel(key, ...ids);
    }
  }
  // 未投递的历史条目：用一次性 drain consumer 读走 → ACK → XDEL
  const drainName = `drain_${process.pid}`;
  for (;;) {
    const res = (await c.call(
      "XREADGROUP", "GROUP", GROUP, drainName, "COUNT", "1000", "STREAMS", key, ">",
    )) as [string, [string, string[]][]][] | null;
    const entries = res?.[0]?.[1] ?? [];
    if (entries.length === 0) { break; }
    const ids = entries.map(([id]) => id);
    await c.xack(key, GROUP, ...ids);
    await c.xdel(key, ...ids);
  }
  await c.xgroup("DELCONSUMER", key, GROUP, drainName);
}

before(async () => {
  await assertRedisUp();
  for (const key of MATCH_STREAM_KEYS) { await drainStale(key); }
});

after(async () => {
  for (const key of new Set(usedStreamEntries.map((entry) => entry.key))) {
    const ids = usedStreamEntries.filter((entry) => entry.key === key).map((entry) => entry.id);
    if (ids.length > 0) { await stream(key).xdel(key, ...ids); }
  }
  if (usedMatchIds.length > 0) {
    const ph = usedMatchIds.map(() => "?").join(",");
    await getPool().query(`DELETE FROM match_results WHERE match_id IN (${ph})`, usedMatchIds);
    await getPool().query(`DELETE FROM match_index WHERE match_id IN (${ph})`, usedMatchIds);
  }
  await closeMysql();
  await closeRedis();
});

/** 造一条两名玩家的完整证据（一局一条：两人名次同 payload，09·K5）。 */
function makeEvidence(matchId: string, sId = 0): MatchEvidence {
  return {
    matchId,
    sId,
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

test("GameRoom sId 只接受 0..65535 整数（网络输入先运行时校验）", async () => {
  for (const raw of [-1, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null]) {
    const options = {
      v: PROTOCOL_VERSION,
      sId: raw,
      mode: GameplayModeId.BallMove,
    } as unknown as IGameRoomJoinOptions;
    await assert.rejects(
      GameRoom.onAuth("", options, undefined as never),
      (e: unknown) => e instanceof Error && e.message.includes(String(ErrorCode.WrongServer)),
      `非法 sId=${String(raw)} 应按 WrongServer 拒绝`,
    );
  }

  // 入口必须先走 shared room-options contract，未知键和预留字段的非法值不能静默放行。
  const malformed: readonly [unknown, number][] = [
    [{ v: PROTOCOL_VERSION, mode: GameplayModeId.BallMove, extra: true }, ErrorCode.BadRequest],
    [{ v: PROTOCOL_VERSION, mode: GameplayModeId.BallMove, unexpected: true }, ErrorCode.BadRequest],
    [{ v: PROTOCOL_VERSION, mode: GameplayModeId.BallMove, token: "" }, ErrorCode.TokenExpired],
    [{ v: PROTOCOL_VERSION, sId: 0 }, ErrorCode.BadRequest],
  ];
  for (const [options, code] of malformed) {
    await assert.rejects(
      GameRoom.onAuth("", options as IGameRoomJoinOptions, undefined as never),
      (e: unknown) => e instanceof Error && e.message.includes(String(code)),
      `非法 join options 应按 ${code} 拒绝：${JSON.stringify(options)}`,
    );
  }
});

test("match v2 key 与 legacy 同槽但物理隔离（旧 consumer 永远看不到新消息）", () => {
  const tag = /\{([^{}]+)\}/.exec(K_STREAM_MATCH_V2)?.[1];
  assert.equal(tag, K_STREAM_MATCH, "v2 hash-tag 必须精确锚定完整 legacy 运行时 key");
  assert.equal(bucketOf(tag!), bucketOf(K_STREAM_MATCH), "自定义 Redis 路由桶一致");
  assert.strictEqual(clientForKey(K_STREAM_MATCH_V2), clientForKey(K_STREAM_MATCH), "两个 key 路由到同一 Redis 实例");
  assert.notEqual(K_STREAM_MATCH_V2, K_STREAM_MATCH, "但 key 必须物理隔离，旧 consumer 只读 legacy");
  const quarantineTag = /\{([^{}]+)\}/.exec(K_STREAM_MATCH_QUARANTINE)?.[1];
  assert.equal(quarantineTag, K_STREAM_MATCH, "quarantine 必须与两条来源流同槽，才能原子 XADD + XACK");
  assert.strictEqual(clientForKey(K_STREAM_MATCH_QUARANTINE), clientForKey(K_STREAM_MATCH));
  assert.ok(
    MATCH_STREAM_CONSUMER.endsWith(`_${process.pid}`),
    "同主机多 worker 必须使用进程唯一 consumer；崩溃 PEL 交给 XAUTOCLAIM",
  );
});

async function countRows(table: "match_index" | "match_results", matchId: string): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE match_id = ?`, [matchId]);
  return Number(rows[0].n);
}

// ── 1. 生产 → 消费闭环：一条证据 → 两表各一行、payload 完整 ─────────────────

test("emitMatchEvidence 只写 schema v2 流；consumeOnce 落库完整 payload", async () => {
  const m = newMatchId();
  usedMatchIds.push(m);
  // matchId 形制（09·K4/05）：m_ + 时间戳36 + 随机hex，纯 ascii ≤ 40
  assert.match(m, /^m_[0-9a-z]+[0-9a-f]{16}$/);
  assert.ok(m.length <= 40, `matchId 长度 ${m.length} ≤ 40`);

  const ev = makeEvidence(m);
  ev.participants[0].userId = "u".repeat(128);
  const rejected = makeEvidence(`m_uid_too_long_${Date.now().toString(36)}`);
  rejected.participants[0].userId = "u".repeat(129);
  const lenBeforeRejected = await stream().xlen(K_STREAM_MATCH_V2);
  assert.equal(await emitMatchEvidence(rejected), null, "WebPlatform 上限外 userId 必须在 producer 侧拒绝");
  assert.equal(await stream().xlen(K_STREAM_MATCH_V2), lenBeforeRejected, "非法 evidence 不得进入 stream");
  const unstableLoadout = makeEvidence(`m_bad_loadout_${Date.now().toString(36)}`);
  unstableLoadout.loadout = { roll: Number.NaN };
  assert.equal(await emitMatchEvidence(unstableLoadout), null, "会被 JSON 静默改写的 loadout 必须拒绝");
  assert.equal(await stream().xlen(K_STREAM_MATCH_V2), lenBeforeRejected);
  const legacyLenBefore = await stream(K_STREAM_MATCH).xlen(K_STREAM_MATCH);
  const sid = await emitMatchEvidence(ev);
  assert.ok(sid, "XADD 成功返回条目 id");
  rememberStreamEntry(K_STREAM_MATCH_V2, sid!);
  assert.equal(await stream(K_STREAM_MATCH).xlen(K_STREAM_MATCH), legacyLenBefore, "新 producer ⛔ 不写 legacy 流");
  const entries = await stream().xrange(K_STREAM_MATCH_V2, sid!, sid!);
  assert.equal(entries.length, 1, "消息只存在 v2 key");
  const fields = Object.fromEntries(
    Array.from({ length: entries[0][1].length / 2 }, (_, i) => entries[0][1].slice(i * 2, i * 2 + 2)),
  );
  assert.equal(fields.schemaVersion, String(MATCH_STREAM_SCHEMA_VERSION), "v2 顶层版本字段精确为 2");

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

test("schema v2 ranked evidence 保真落库非 null 嵌套 JSON loadout", async () => {
  const matchId = newMatchId();
  usedMatchIds.push(matchId);
  const evidence = makeEvidence(matchId, 23);
  evidence.mode = MATCH_MODE_RANKED;
  evidence.loadout = {
    deck: [
      { id: "starter-sword", level: 3, affixes: ["swift", "guard"] },
      { id: "starter-shield", level: 2, affixes: [] },
    ],
    cosmetics: { title: "season-one", visible: true, badge: null },
  };

  const entryId = await emitMatchEvidence(evidence);
  assert.ok(entryId, "ranked evidence 必须进入 v2 stream");
  rememberStreamEntry(K_STREAM_MATCH_V2, entryId!);
  const entries = await stream().xrange(K_STREAM_MATCH_V2, entryId!, entryId!);
  const fields = Object.fromEntries(
    Array.from({ length: entries[0][1].length / 2 }, (_, index) =>
      entries[0][1].slice(index * 2, index * 2 + 2)),
  );
  assert.equal(fields.schemaVersion, "2", "兼容 ranked payload 仍属于 schema v2");

  assert.ok(await consumeOnce() >= 1, "ranked evidence 必须被 settle consumer 消费");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT mode, payload FROM match_results WHERE match_id = ?", [matchId],
  );
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].mode), MATCH_MODE_RANKED);
  assert.deepEqual(rows[0].payload, evidence, "嵌套 opaque loadout 必须逐字段保真");
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
  rememberStreamEntry(K_STREAM_MATCH_V2, id1!);
  rememberStreamEntry(K_STREAM_MATCH_V2, id2!);

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
    rememberStreamEntry(K_STREAM_MATCH_V2, sid!);

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

test("GameRoom 区服端到端：跨区 joinById 拒绝；同区开局 → 收局证据落库", async () => {
  const colyseus: ColyseusTestServer = await boot((await import("../../src/app.config")).server);
  const players: { uid: string; sId: number }[] = [];
  try {
    // 造玩法档 + 组缓存会话。GameRoom strict onAuth 仍需契约一致的 WebPlatform 测试服务。
    const { issueSession } = await import("./helpers");
    const { createUser } = await import("../../src/core/userRecord");
    const mk = async (name: string, sId: number) => {
      const uid = testUid(name).slice(0, 32);
      players.push({ uid, sId });
      await createUser(uid);
      const { token } = await issueSession(uid, null, "", sId);
      return { uid, token };
    };

    // joinById 不经过 filterBy(["sId", "mode"])：先由 s1 正常 joinOrCreate，再拿合法 s2 会话指定进该房，
    // 必须由 GameRoom.onJoin 比较 client.auth.sId 与房级 sId 拒绝。
    const owner = await mk("joinById-s1-owner", 1);
    const intruder = await mk("joinById-s2", 2);
    colyseus.sdk.auth.token = owner.token;
    const roomS1 = await colyseus.sdk.joinOrCreate(RoomName.Game, {
      token: owner.token, v: PROTOCOL_VERSION, sId: 1, mode: GameplayModeId.BallMove,
    });
    colyseus.sdk.auth.token = intruder.token;
    await assert.rejects(
      colyseus.sdk.joinById(roomS1.roomId, {
        token: intruder.token, v: PROTOCOL_VERSION, sId: 2, mode: GameplayModeId.BallMove,
      }),
      (e: unknown) => e instanceof Error && e.message.includes(String(ErrorCode.WrongServer)),
      "持 s2 权威会话的玩家不得通过 joinById 进入 s1 房间",
    );
    await roomS1.leave();

    const a = await mk("gsA", 7);
    const b = await mk("gsB", 7);

    // ⚠ 带 sId 建房：钉住 `GameRoom.onCreate` 真的读了它（房级区上下文，DUAL_MODE §4.1）——
    //   ⛔ 之前 onCreate 是 `_options` 整个丢弃，证据里的区永远是 0，这条路径无人覆盖。
    const room = await colyseus.createRoom(RoomName.Game, {
      v: PROTOCOL_VERSION,
      sId: 7,
      mode: GameplayModeId.BallMove,
    });
    // ⚠ 带 v：PROTOCOL_VERSION 自 M12e 起为 2，`connectTo` 的 options 会走 GameRoom.onAuth 的版本闸
    colyseus.sdk.auth.token = a.token;
    const c1 = await colyseus.connectTo(room, {
      token: a.token, v: PROTOCOL_VERSION, sId: 7, mode: GameplayModeId.BallMove,
    });
    assert.equal(room.state.matchId, "", "等人期尚无 matchId");
    colyseus.sdk.auth.token = b.token;
    const c2 = await colyseus.connectTo(room, {
      token: b.token, v: PROTOCOL_VERSION, sId: 7, mode: GameplayModeId.BallMove,
    });
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
      const entries = (await stream().xrange(K_STREAM_MATCH_V2, "-", "+")) as [string, string[]][];
      for (const [id, fields] of entries) {
        const idx = fields.indexOf("matchId");
        if (idx >= 0 && fields[idx + 1] === matchId) { entryId = id; break; }
      }
      if (!entryId) { await sleep(50); }
    }
    assert.ok(entryId, "收局后 stream:match:v2 出现本局证据");
    rememberStreamEntry(K_STREAM_MATCH_V2, entryId!);

    // 消费落库：payload 里两名参与者、userId 齐全、名次正确
    await consumeOnce();
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT mode, server_id, payload FROM match_results WHERE match_id = ?", [matchId]);
    assert.equal(rows.length, 1, "端到端一局一行");
    assert.equal(rows[0].mode, MATCH_MODE_CASUAL, "休闲局 mode=0");
    // ⚠ 端到端钉住区：建房 options.sId=7 → onCreate 存房级 sId → 收局证据带出 → 落库 server_id
    assert.equal(Number(rows[0].server_id), 7, "⛔ 建房时的 sId 必须一路带到 match_results.server_id");
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
    for (const { uid, sId } of players) {
      await cleanupUser(uid);
      await clientFor(uid).unlink(kSess(uid, sId));
      const bkt = activeLruBucketOf(uid);
      await indexClientFor(bkt).zrem(kActiveLru(bkt), uid);
    }
  }
});

test("对局按区：证据的 sId 落进 match_results.server_id（喂运营统计 + 关区回收）", async () => {
  // ⚠ 这条钉住「区能从对局里带出来」——证据 XADD 之后房间即 dispose，⛔ 那时再想知道
  //   这局属于哪个区就无处可查了。发奖（U6）按区记账依赖它。
  const mid = `m_zone_${Date.now().toString(36)}`;
  usedMatchIds.push(mid);
  const entryId = await emitMatchEvidence(makeEvidence(mid, 107));
  assert.ok(entryId);
  rememberStreamEntry(K_STREAM_MATCH_V2, entryId!);
  await consumeOnce();

  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT server_id FROM match_results WHERE match_id = ?", [mid]);
  assert.equal(rows.length, 1, "证据已落库");
  assert.equal(Number(rows[0].server_id), 107, "⛔ server_id 必须是证据里的区，不能恒 0");
});

test("单轮双读：f91 legacy 顶层 sId 保留，v2 同时落库，两流 PEL 各自 ACK", async () => {
  const legacyMid = `m_f91_${Date.now().toString(36)}`;
  const v2Mid = `m_v2_${Date.now().toString(36)}`;
  usedMatchIds.push(legacyMid, v2Mid);
  const legacyEv = makeEvidence(legacyMid, 107);
  const legacyId = await stream(K_STREAM_MATCH).xadd(
    K_STREAM_MATCH, "*",
    "matchId", legacyMid, "mode", String(legacyEv.mode), "sId", "107", "payload", JSON.stringify(legacyEv),
  );
  assert.ok(legacyId);
  rememberStreamEntry(K_STREAM_MATCH, legacyId!);
  const v2Id = await emitMatchEvidence(makeEvidence(v2Mid, 8));
  assert.ok(v2Id);
  rememberStreamEntry(K_STREAM_MATCH_V2, v2Id!);

  assert.ok(await consumeOnce() >= 2, "同一轮同时读取 legacy 与 v2");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT match_id, server_id, payload FROM match_results WHERE match_id IN (?, ?)", [legacyMid, v2Mid]);
  const byMid = new Map(rows.map((row) => [String(row.match_id), row]));
  assert.equal(Number(byMid.get(legacyMid)?.server_id), 107, "f91 legacy 顶层非零 sId 保留");
  assert.equal(Number(byMid.get(legacyMid)?.payload.sId), 107, "legacy DB JSON 同步为权威顶层 sId");
  assert.equal(Number(byMid.get(v2Mid)?.server_id), 8, "v2 sId 正常落库");
  for (const key of MATCH_STREAM_KEYS) {
    const pending = await stream(key).xpending(key, GROUP) as [number, ...unknown[]];
    assert.equal(Number(pending[0]), 0, `${key} 的 ACK 必须落回各自来源流`);
  }
});

test("真正旧条目（顶层和 payload 都无 sId）规范化为 0 后再存", async () => {
  // ⚠ pre-f91 消息两处都没有 sId；不能拿新版 makeEvidence 原样 JSON.stringify 冒充旧 fixture。
  const mid = `m_nosid_${Date.now().toString(36)}`;
  usedMatchIds.push(mid);
  const legacyPayload: Record<string, unknown> = { ...makeEvidence(mid, 0) };
  delete legacyPayload.sId;
  const entryId = await stream(K_STREAM_MATCH).xadd(
    K_STREAM_MATCH, "*",
    "matchId", mid, "mode", String(legacyPayload.mode), "payload", JSON.stringify(legacyPayload),
  );
  assert.ok(entryId);
  rememberStreamEntry(K_STREAM_MATCH, entryId!);
  await consumeOnce();

  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT server_id, payload FROM match_results WHERE match_id = ?", [mid]);
  assert.equal(rows.length, 1, "⛔ 旧条目必须照常落库（不得被当结构损坏丢弃）");
  assert.equal(Number(rows[0].server_id), 0, "缺省按大混服 0");
  assert.equal(Number(rows[0].payload.sId), 0, "DB JSON 也必须补齐数值 sId，满足当前 MatchEvidence");
});

test("v2 损坏条目先完整写入 quarantine 再 ACK 来源 PEL", async () => {
  const missingMid = `m_v2_nover_${Date.now().toString(36)}`;
  const nonCanonicalMid = `m_v2_badver_${Date.now().toString(36)}`;
  const incompleteMid = `m_v2_incomplete_${Date.now().toString(36)}`;
  usedMatchIds.push(missingMid, nonCanonicalMid, incompleteMid);
  const missingEv = makeEvidence(missingMid, 1);
  const missingId = await stream().xadd(
    K_STREAM_MATCH_V2, "*",
    "matchId", missingMid, "mode", String(missingEv.mode), "sId", "1", "payload", JSON.stringify(missingEv),
  );
  const badEv = makeEvidence(nonCanonicalMid, 1);
  const badId = await stream().xadd(
    K_STREAM_MATCH_V2, "*",
    "schemaVersion", "02",
    "matchId", nonCanonicalMid, "mode", String(badEv.mode), "sId", "1", "payload", JSON.stringify(badEv),
  );
  const incompletePayload: Record<string, unknown> = { ...makeEvidence(incompleteMid, 1) };
  delete incompletePayload.participants;
  const incompleteId = await stream().xadd(
    K_STREAM_MATCH_V2, "*",
    "schemaVersion", String(MATCH_STREAM_SCHEMA_VERSION),
    "matchId", incompleteMid, "mode", String(MATCH_MODE_CASUAL), "sId", "1",
    "payload", JSON.stringify(incompletePayload),
  );
  assert.ok(missingId && badId && incompleteId);
  rememberStreamEntry(K_STREAM_MATCH_V2, missingId!);
  rememberStreamEntry(K_STREAM_MATCH_V2, badId!);
  rememberStreamEntry(K_STREAM_MATCH_V2, incompleteId!);
  const missingSource = await stream().xrange(K_STREAM_MATCH_V2, missingId!, missingId!) as [string, string[]][];
  const badSource = await stream().xrange(K_STREAM_MATCH_V2, badId!, badId!) as [string, string[]][];
  const incompleteSource = await stream().xrange(
    K_STREAM_MATCH_V2, incompleteId!, incompleteId!,
  ) as [string, string[]][];
  const sourceIds = new Set([missingId!, badId!, incompleteId!]);
  const quarantinedForSources = async () => {
    const entries = await stream(K_STREAM_MATCH_QUARANTINE).xrange(
      K_STREAM_MATCH_QUARANTINE, "-", "+",
    ) as [string, string[]][];
    return entries.map(([id, fields]) => ({ id, fields: Object.fromEntries(
      Array.from({ length: fields.length / 2 }, (_, i) => fields.slice(i * 2, i * 2 + 2)),
    ) })).filter((entry) => sourceIds.has(entry.fields.sourceId));
  };

  try {
    assert.ok(await consumeOnce() >= 3, "三条损坏 v2 都被读取并处置");
    assert.equal(await countRows("match_index", missingMid), 0, "缺 schemaVersion 不得落库");
    assert.equal(await countRows("match_index", nonCanonicalMid), 0, "非精确字符串 2 不得落库");
    assert.equal(await countRows("match_index", incompleteMid), 0, "缺完整 evidence 字段不得落库");
    const pending = await stream().xpending(K_STREAM_MATCH_V2, GROUP) as [number, ...unknown[]];
    assert.equal(Number(pending[0]), 0, "quarantine 持久化成功后来源条目才 ACK");

    const relevant = await quarantinedForSources();
    const bySourceId = new Map(relevant.map((entry) => [entry.fields.sourceId, entry]));
    const missingQuarantine = bySourceId.get(missingId!);
    const badQuarantine = bySourceId.get(badId!);
    const incompleteQuarantine = bySourceId.get(incompleteId!);
    assert.ok(
      missingQuarantine && badQuarantine && incompleteQuarantine,
      "每条损坏证据都必须有可人工修复的隔离副本",
    );
    assert.equal(missingQuarantine!.fields.sourceStream, K_STREAM_MATCH_V2);
    assert.equal(missingQuarantine!.fields.sourceGroup, GROUP);
    assert.equal(missingQuarantine!.fields.sourceKind, "v2");
    assert.equal(
      missingQuarantine!.fields.sourceIdentity,
      `${K_STREAM_MATCH_V2}\n${GROUP}\n${missingId}`,
    );
    assert.equal(missingQuarantine!.fields.reason, "V2_FIELD_SET");
    assert.deepEqual(JSON.parse(missingQuarantine!.fields.rawFields), missingSource[0][1]);
    assert.equal(badQuarantine!.fields.reason, "V2_SCHEMA_VERSION");
    assert.deepEqual(JSON.parse(badQuarantine!.fields.rawFields), badSource[0][1]);
    assert.equal(incompleteQuarantine!.fields.reason, "V2_PAYLOAD_SHAPE");
    assert.deepEqual(JSON.parse(incompleteQuarantine!.fields.rawFields), incompleteSource[0][1]);
    assert.match(badQuarantine!.fields.quarantinedAtMs, /^(?:0|[1-9]\d*)$/);

    await trimToSafePoint();
    for (const entry of relevant) {
      const stillQuarantined = await stream(K_STREAM_MATCH_QUARANTINE).xrange(
        K_STREAM_MATCH_QUARANTINE, entry.id, entry.id,
      );
      assert.equal(stillQuarantined.length, 1, "来源流安全裁剪不得触碰 quarantine");
    }
  } finally {
    const cleanupEntries = await quarantinedForSources();
    if (cleanupEntries.length > 0) {
      await stream(K_STREAM_MATCH_QUARANTINE).xdel(
        K_STREAM_MATCH_QUARANTINE, ...cleanupEntries.map((entry) => entry.id),
      );
    }
  }
});

test("quarantine 写入失败时不得 ACK 损坏来源条目", async () => {
  const mid = `m_v2_quarantine_fail_${Date.now().toString(36)}`;
  const ev = makeEvidence(mid, 1);
  const sourceId = await stream().xadd(
    K_STREAM_MATCH_V2, "*",
    "schemaVersion", "broken",
    "matchId", mid, "mode", String(ev.mode), "sId", "1", "payload", JSON.stringify(ev),
  );
  assert.ok(sourceId);
  rememberStreamEntry(K_STREAM_MATCH_V2, sourceId!);
  const reader = `quarantine_failure_${process.pid}`;
  const read = await stream().call(
    "XREADGROUP", "GROUP", GROUP, reader, "COUNT", "1", "STREAMS", K_STREAM_MATCH_V2, ">",
  ) as [string, [string, string[]][]][] | null;
  const entry = read?.[0]?.[1]?.find(([id]) => id === sourceId);
  assert.ok(entry, "测试条目必须先进入 settle PEL");

  const wrongTypeKey = `${K_STREAM_MATCH_QUARANTINE}:wrongtype:${process.pid}:${Date.now()}`;
  await stream(wrongTypeKey).set(wrongTypeKey, "not-a-stream");
  try {
    await assert.rejects(
      quarantineMalformedMatchEntry(
        stream(), K_STREAM_MATCH_V2, "v2", sourceId!, entry![1], "V2_SCHEMA_VERSION", wrongTypeKey,
      ),
      /WRONGTYPE/,
    );
    const details = await stream().call(
      "XPENDING", K_STREAM_MATCH_V2, GROUP, sourceId!, sourceId!, "1",
    ) as [string, ...unknown[]][];
    assert.equal(details.length, 1, "XADD quarantine 失败时 Lua 不得继续执行 XACK");
  } finally {
    await stream().xack(K_STREAM_MATCH_V2, GROUP, sourceId!);
    await stream(wrongTypeKey).del(wrongTypeKey);
    await stream().xgroup("DELCONSUMER", K_STREAM_MATCH_V2, GROUP, reader);
  }
});
