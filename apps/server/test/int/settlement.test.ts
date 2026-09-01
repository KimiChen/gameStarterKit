/**
 * M8a DoD 集成测试（10·M8a）——真实 Redis(6401) + 真实 MySQL(3316)，⛔ 不 mock：
 *  1. 生产→消费闭环：GameRoom 生成 v3，emitMatchEvidence 单写 v3 → consumeOnce →
 *     match_index / match_results 各一行、payload 完整回读（09·K5 输入完整性）
 *  2. 幂等闸（DoD）：同一 matchId 重复投递 + 重复消费 → match_results 仍只有一行
 *     （非分区 match_index ODKU 闸，09·DB4/05·Δ2；-FOUND_ROWS 下 affectedRows 语义可信）
 *  3. 常驻消费循环冒烟：startMatchConsumer（独占连接 XREADGROUP BLOCK）自动落库；
 *     stopMatchConsumer 打断阻塞及时退出
 *  4. 房间端到端：@colyseus/testing 起真 GameRoom 打完一局（绑定框架账号）→ state.matchId
 *     开局即生成（09·K4）→ 收局后 stream:match:v3 出现该 matchId 的证据 → 消费落库
 * 前置：npm --workspace @game/server run stack。清理：XDEL 测试条目 + DELETE 测试行（09·R6）。
 */
import "./env-setup"; // 必须第一个 import（env 先于 config.ts 模块级读取）
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";

import {
  ErrorCode,
  GamePhase,
  GameplayModeId,
  GAMEPLAY_CATALOG,
  GAME_ROOM_PROTOCOL_VERSION,
  RoomName,
  type IGameRoomJoinOptions,
} from "@game/shared";
import {
  consumeOnce,
  emitMatchEvidence,
  MATCH_MODE_CASUAL,
  MATCH_MODE_RANKED,
  MATCH_STREAM_CONSUMER,
  MATCH_STREAM_V2_SCHEMA_VERSION,
  MATCH_STREAM_V3_SCHEMA_VERSION,
  MATCH_V3_MAX_PAYLOAD_BYTES,
  newMatchId,
  quarantineMalformedMatchEntry,
  startMatchConsumer,
  stopMatchConsumer,
  trimToSafePoint,
  type MatchEvidence,
} from "../../src/core/match/matchConsumer";
import {
  BALL_MOVE_RULESET_ID,
  BALL_MOVE_RULESET_VERSION,
  MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS,
  validateMatchEvidenceV3,
  type MatchEvidenceV3,
} from "../../src/core/match/matchEvidence";
import { replayMatchEvidenceV3 } from "../../src/core/match/matchReplay";
import {
  activeLruBucketOf, kActiveLru, kSess,
  K_STREAM_MATCH, K_STREAM_MATCH_QUARANTINE, K_STREAM_MATCH_V2, K_STREAM_MATCH_V3,
} from "../../src/core/infra/keys";
import { closeMysql, getPool, type RowDataPacket } from "../../src/core/infra/mysql";
import { bucketOf, clientFor, clientForKey, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { GameRoom } from "../../src/rooms/GameRoom";
import { createBallMoveGameMode } from "../../src/rooms/modes/ballMove/index";
import { assertRedisUp, cleanupUser, sleep, testUid } from "./helpers";

const GROUP = "settle";
const MATCH_STREAM_KEYS = [K_STREAM_MATCH, K_STREAM_MATCH_V2, K_STREAM_MATCH_V3] as const;
const stream = (key: string = K_STREAM_MATCH_V2) => clientForKey(key);

/** Historical input fixture only; production exports no v2 writer. */
const emitV2Evidence = (evidence: MatchEvidence): Promise<string | null> => stream(K_STREAM_MATCH_V2).xadd(
  K_STREAM_MATCH_V2, "*",
  "schemaVersion", String(MATCH_STREAM_V2_SCHEMA_VERSION),
  "matchId", evidence.matchId,
  "mode", String(evidence.mode),
  "sId", String(evidence.sId),
  "payload", JSON.stringify(evidence),
);

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

async function makeV3Evidence(matchId: string, sId = 0): Promise<MatchEvidenceV3> {
  let evidence: MatchEvidenceV3 | undefined;
  const room = new GameRoom({
    seed: 0x1234_5678,
    matchId: () => matchId,
    // 阶段 1 起 shell 无隐式默认玩法：显式注入 ballMove mode。
    mode: createBallMoveGameMode(),
    evidenceEmitter: (value) => {
      evidence = value;
      return Promise.resolve({ ok: true as const, entryId: "0-0" });
    },
  });
  (room as unknown as { sId: number }).sId = sId;
  (room as unknown as { lock: () => Promise<void> }).lock = async () => undefined;
  const client = (sessionId: string, userId: string) => ({
    sessionId,
    auth: { userId, sId, mode: GameplayModeId.BallMove, profile: "default" },
    send() {},
  });
  const first = client("sA", "u_int_a");
  const second = client("sB", "u_int_b");
  await room.onJoin(first as never, {});
  await room.onJoin(second as never, {});
  await room.onLeave(second as never, 4000);
  assert.ok(evidence, "GameRoom leave must synchronously hand v3 evidence to the emitter");
  replayMatchEvidenceV3(validateMatchEvidenceV3(evidence));
  await room.onDispose();
  return evidence;
}

test("GameRoom sId 只接受 0..65535 整数（网络输入先运行时校验）", async () => {
  for (const raw of [-1, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null]) {
    const options = {
      v: GAME_ROOM_PROTOCOL_VERSION,
      sId: raw,
      mode: GameplayModeId.BallMove,
      modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
      profile: "default",
    } as unknown as IGameRoomJoinOptions;
    await assert.rejects(
      GameRoom.onAuth("", options, undefined as never),
      (e: unknown) => e instanceof Error && e.message.includes(String(ErrorCode.WrongServer)),
      `非法 sId=${String(raw)} 应按 WrongServer 拒绝`,
    );
  }

  // 入口必须先走 shared room-options contract，未知键和预留字段的非法值不能静默放行。
  const fullEnvelope = {
    v: GAME_ROOM_PROTOCOL_VERSION,
    mode: GameplayModeId.BallMove,
    modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
    profile: "default",
  };
  const malformed: readonly [unknown, number][] = [
    [{ ...fullEnvelope, extra: true }, ErrorCode.BadRequest],
    [{ ...fullEnvelope, unexpected: true }, ErrorCode.BadRequest],
    [{ ...fullEnvelope, token: "" }, ErrorCode.TokenExpired],
    // v8 必填切换（§4.4）：缺 mode/modeVersion/profile 均按 BadRequest 拒（⛔ 不注入缺省）。
    [{ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0 }, ErrorCode.BadRequest],
    [{ ...fullEnvelope, modeVersion: undefined }, ErrorCode.BadRequest],
    [{ ...fullEnvelope, profile: undefined }, ErrorCode.BadRequest],
  ];
  for (const [options, code] of malformed) {
    await assert.rejects(
      GameRoom.onAuth("", options as IGameRoomJoinOptions, undefined as never),
      (e: unknown) => e instanceof Error && e.message.includes(String(code)),
      `非法 join options 应按 ${code} 拒绝：${JSON.stringify(options)}`,
    );
  }
});

test("match v2/v3 keys 与 legacy 同槽但物理隔离", () => {
  const tag = /\{([^{}]+)\}/.exec(K_STREAM_MATCH_V2)?.[1];
  assert.equal(tag, K_STREAM_MATCH, "v2 hash-tag 必须精确锚定完整 legacy 运行时 key");
  assert.equal(/\{([^{}]+)\}/.exec(K_STREAM_MATCH_V3)?.[1], K_STREAM_MATCH);
  assert.equal(bucketOf(tag!), bucketOf(K_STREAM_MATCH), "自定义 Redis 路由桶一致");
  assert.strictEqual(clientForKey(K_STREAM_MATCH_V2), clientForKey(K_STREAM_MATCH), "两个 key 路由到同一 Redis 实例");
  assert.strictEqual(clientForKey(K_STREAM_MATCH_V3), clientForKey(K_STREAM_MATCH));
  assert.notEqual(K_STREAM_MATCH_V2, K_STREAM_MATCH, "但 key 必须物理隔离，旧 consumer 只读 legacy");
  assert.notEqual(K_STREAM_MATCH_V3, K_STREAM_MATCH_V2);
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

test("v3 producer changes neither legacy nor v2 and consumer stores the replay-verified payload", async () => {
  const matchId = newMatchId();
  usedMatchIds.push(matchId);
  const evidence = await makeV3Evidence(matchId, 17);
  const before = new Map<string, number>();
  for (const key of MATCH_STREAM_KEYS) before.set(key, await stream(key).xlen(key));

  const emitted = await emitMatchEvidence(evidence);
  assert.ok(emitted.ok, "生产侧应当成功 XADD");
  const entryId = emitted.entryId;
  assert.ok(entryId);
  rememberStreamEntry(K_STREAM_MATCH_V3, entryId!);
  assert.equal(await stream(K_STREAM_MATCH).xlen(K_STREAM_MATCH), before.get(K_STREAM_MATCH));
  assert.equal(await stream(K_STREAM_MATCH_V2).xlen(K_STREAM_MATCH_V2), before.get(K_STREAM_MATCH_V2));
  assert.equal(await stream(K_STREAM_MATCH_V3).xlen(K_STREAM_MATCH_V3), before.get(K_STREAM_MATCH_V3)! + 1);

  const entries = await stream(K_STREAM_MATCH_V3).xrange(K_STREAM_MATCH_V3, entryId!, entryId!);
  const fields = Object.fromEntries(
    Array.from({ length: entries[0][1].length / 2 }, (_, index) =>
      entries[0][1].slice(index * 2, index * 2 + 2)),
  );
  assert.equal(fields.schemaVersion, String(MATCH_STREAM_V3_SCHEMA_VERSION));
  assert.equal(fields.matchId, evidence.matchId);
  assert.equal(fields.sId, String(evidence.sId));
  assert.deepEqual(JSON.parse(fields.payload), evidence);

  assert.ok(await consumeOnce() >= 1);
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT server_id, mode, payload FROM match_results WHERE match_id = ?", [matchId],
  );
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].server_id), 17);
  assert.equal(Number(rows[0].mode), MATCH_MODE_CASUAL);
  assert.deepEqual(rows[0].payload, evidence);
  const pending = await stream(K_STREAM_MATCH_V3).xpending(K_STREAM_MATCH_V3, GROUP) as [number, ...unknown[]];
  assert.equal(Number(pending[0]), 0);
});

/**
 * ⚠ 用例名从「before any XADD」改成现在这样是必须的：producer 自检失败**现在会 XADD**一条
 * quarantine（这正是 d312541 的落点——自检失败必须留下不可忽略的持久痕迹）。旧名字与生产行为
 * 相反，而且旧断言只比对了三条来源流的 xlen，等于把新增的那次 XADD 完全放在视野之外。
 *
 * 更要紧的是覆盖：把 `quarantineProducerSelfCheck` 里整段 XADD 删掉，此前全仓仍然全绿
 * （单测 315/315、int settlement 20/20）——本轮唯一新增的行为在回归上完全裸奔。下面逐字段断言
 * quarantine 条目，并在末尾清理，⛔ 不把条目泄漏进这条永不自动裁剪的流。
 */
test("v3 producer 自检失败：不碰三条来源流，但必须留下 sourceKind=producer 的 quarantine 痕迹", async () => {
  const extraKeyEvidence = {
    ...await makeV3Evidence(`m_v3_extra_${Date.now().toString(36)}`, 18),
    unexpected: true,
  } as unknown as MatchEvidenceV3;
  const replayMismatch = structuredClone(
    await makeV3Evidence(`m_v3_producer_replay_${Date.now().toString(36)}`, 19),
  );
  replayMismatch.finalState.players[0].hp--;
  validateMatchEvidenceV3(replayMismatch);
  const matchIds = [extraKeyEvidence.matchId, replayMismatch.matchId];

  const before = new Map<string, number>();
  for (const key of MATCH_STREAM_KEYS) before.set(key, await stream(key).xlen(key));
  const quarantineBefore = await stream(K_STREAM_MATCH_QUARANTINE).xlen(K_STREAM_MATCH_QUARANTINE);

  const producerQuarantined = async () => {
    const entries = await stream(K_STREAM_MATCH_QUARANTINE).xrange(
      K_STREAM_MATCH_QUARANTINE, "-", "+",
    ) as [string, string[]][];
    return entries.map(([id, fields]) => ({ id, fields: Object.fromEntries(
      Array.from({ length: fields.length / 2 }, (_, index) => fields.slice(index * 2, index * 2 + 2)),
    ) })).filter((entry) => matchIds.includes(String(entry.fields.matchId)));
  };

  const originalError = console.error;
  console.error = () => undefined;
  try {
    const extraKeyResult = await emitMatchEvidence(extraKeyEvidence);
    assert.equal(extraKeyResult.ok, false, "extra key must fail exact-shape validation");
    assert.equal(extraKeyResult.ok === false && extraKeyResult.kind, "self-check",
      "exact-shape 失败必须归类为 self-check 而不是 transport");
    assert.match(extraKeyResult.ok === false ? extraKeyResult.reason : "", /^V3_PAYLOAD_/u,
      "自检失败的码必须落在与消费侧共用的 V3_PAYLOAD_* 码空间");

    const replayResult = await emitMatchEvidence(replayMismatch);
    assert.equal(replayResult.ok, false, "changed final state must fail deterministic replay");
    assert.equal(replayResult.ok === false && replayResult.kind, "self-check",
      "replay 失败必须归类为 self-check");
    assert.equal(replayResult.ok === false && replayResult.reason, "V3_REPLAY_MISMATCH",
      "replay 失败必须与 shape 失败使用不同的码——两类事故不得再不可区分");

    // ⛔ 三条来源流一条都不许动：自检在 XADD 到来源流之前就拦住了。
    for (const key of MATCH_STREAM_KEYS) {
      assert.equal(await stream(key).xlen(key), before.get(key),
        `${key} must not change after rejected evidence`);
    }
    // 但 quarantine **必须**多两条——这是「自检失败留下持久痕迹」的唯一可回归证据。
    assert.equal(
      await stream(K_STREAM_MATCH_QUARANTINE).xlen(K_STREAM_MATCH_QUARANTINE),
      quarantineBefore + 2,
      "两次自检失败必须各写一条 quarantine——⛔ 删掉那段 XADD 时本断言必须转红",
    );

    const quarantined = await producerQuarantined();
    assert.equal(quarantined.length, 2, "两条痕迹必须都能按 matchId 找回");
    const byMatchId = new Map(quarantined.map((entry) => [String(entry.fields.matchId), entry.fields]));

    const shapeFields = byMatchId.get(extraKeyEvidence.matchId)!;
    assert.equal(shapeFields.sourceKind, "producer",
      "⛔ 必须与消费侧的 legacy/v2/v3 隔离条目区分开：这条是生产侧自检产生的");
    assert.equal(shapeFields.sourceStream, "", "producer 自检没有来源流");
    assert.equal(shapeFields.sourceId, "", "producer 自检没有来源条目 id");
    assert.match(String(shapeFields.reason), /^V3_PAYLOAD_/u);
    // ⚠ 时间戳字段必须与消费侧 Lua 路径同名，否则按字段名扫隔离流的工具要走两套代码
    assert.match(String(shapeFields.quarantinedAtMs), /^(?:0|[1-9]\d*)$/u);
    assert.equal(shapeFields.at, undefined, "⛔ 不得再用旧的 at 字段名");
    // producer 条目没有 PEL，故不带 sourceGroup / sourceIdentity——这是与消费侧的刻意差异
    assert.equal(shapeFields.sourceGroup, undefined);
    assert.equal(shapeFields.sourceIdentity, undefined);
    // rawFields 必须保留可供人工核查的原始 payload，⛔ 不能只留一个码
    assert.equal(JSON.parse(String(shapeFields.rawFields)).matchId, extraKeyEvidence.matchId);

    const replayFields = byMatchId.get(replayMismatch.matchId)!;
    assert.equal(replayFields.sourceKind, "producer");
    assert.equal(replayFields.reason, "V3_REPLAY_MISMATCH",
      "两类自检失败在 quarantine 里也必须是不同的码");
  } finally {
    console.error = originalError;
    // quarantine 不属于自动 XTRIM 范围，用例必须自己清理，⛔ 否则每跑一次就永久泄漏两条。
    const leftover = await producerQuarantined();
    if (leftover.length > 0) {
      await stream(K_STREAM_MATCH_QUARANTINE).xdel(
        K_STREAM_MATCH_QUARANTINE, ...leftover.map((entry) => entry.id),
      );
    }
  }
});

/**
 * 自检③（payload 超预算，matchConsumer.ts 的 `MATCH_V3_MAX_PAYLOAD_BYTES` 守卫）是**防御性兜底**：
 * validate 的逐字段上界把任何合法证据钉死在 ~13.6MiB（下面实测），够不到 24MiB 预算——今天不存在
 * 能自然触发它的诚实数据。但守卫一旦删掉、将来任一上界放宽都会静默失守，所以本用例用
 * `Buffer.byteLength` 的**定点桩**（只对这条证据的 canonical payload 谎报尺寸）驱动分支。
 * 变异锚点：删掉守卫的 `if` 本用例必红（证据会正常 XADD 成功）；删掉 quarantine XADD 同样必红。
 */
test("v3 producer 自检③：payload 超预算 → self-check + producer quarantine，三条来源流不动", async () => {
  const matchId = `m_v3_producer_oversized_${Date.now().toString(36)}`;
  const evidence = await makeV3Evidence(matchId, 26);
  // 逆序顶层键：validate 对键序不敏感，但 rawFields（JSON.stringify(原始输入)）因此与
  // canonical payload 不同串——定点桩按内容精确匹配后者，绝不会误伤 quarantine XADD 的
  // ioredis 参数编码（它也走 Buffer.byteLength，误匹配会把 RESP 帧写坏）。
  const reversed = Object.fromEntries(Object.entries(evidence).reverse()) as unknown as MatchEvidenceV3;
  const expectedPayload = JSON.stringify(validateMatchEvidenceV3(evidence));
  assert.notEqual(JSON.stringify(reversed), expectedPayload, "rawFields 必须与 canonical payload 可区分");

  // 夹具有效性①：同一条（逆序键）证据不插桩必须 XADD 成功——下面的失败只能是超预算守卫造成的。
  const control = await emitMatchEvidence(reversed);
  assert.ok(control.ok, "对照：未插桩的同一条证据必须 XADD 成功");
  await stream(K_STREAM_MATCH_V3).xdel(K_STREAM_MATCH_V3, control.entryId);

  // 夹具有效性②：实测「能通过 validate 的最胖证据」确实够不到预算（这就是必须插桩的原因）。
  // 上界若被放宽到天然可达，本断言先红——届时应改写为不插桩的真实超预算用例。
  const esc = (n: number) => "\u0001".repeat(n); // 每 UTF-16 unit 序列化成 \uXXXX 六字节，制造最大转义
  const maxTick = Number.MAX_SAFE_INTEGER;
  const maxName = esc(128);
  const maxSidA = esc(64);
  const maxSidB = `${esc(63)}\u0002`;
  const maxRoster = [
    { sessionId: maxSidA, userId: esc(128), name: maxName },
    { sessionId: maxSidB, userId: null, name: maxName },
  ];
  const maxClocks = (tick: number) =>
    Array.from({ length: 256 }, (_, index) => ({ skillId: index + 1, atTick: tick }));
  const maxPlayer = (sessionId: string, tick: number) => ({
    sessionId, name: maxName, x: 1, y: 1, hp: 1, maxHp: 1, alive: true,
    dirX: -0.111_111_111_111_111_11, dirY: 0.111_111_111_111_111_11,
    lastCastTick: maxClocks(tick), level: 1000,
    motionAnchorX: 1, motionAnchorY: 1, motionAnchorTick: tick,
  });
  const maxEvents: MatchEvidenceV3["events"] = Array.from(
    { length: MATCH_EVIDENCE_MAX_ACCEPTED_INPUTS },
    (): MatchEvidenceV3["events"][number] => ({
      type: "castSkill", sessionId: maxSidA, skillId: 65_535, targetId: esc(64), acceptedTick: maxTick,
    }),
  );
  maxEvents.push({ type: "leave", sessionId: maxSidB, acceptedTick: maxTick });
  const maxMatchId = `m_${"z".repeat(37)}`;
  const maximal = validateMatchEvidenceV3({
    schemaVersion: 3, matchId: maxMatchId, sId: 65_535, mode: 0,
    ruleset: { id: BALL_MOVE_RULESET_ID, version: BALL_MOVE_RULESET_VERSION },
    seed: 0xffff_ffff, fixedStepMs: 5, mapIndex: 0, loadout: null,
    initialRoster: maxRoster,
    initialState: {
      tick: 0, phase: GamePhase.Playing, matchId: maxMatchId,
      players: [maxPlayer(maxSidA, 0), maxPlayer(maxSidB, 0)],
    },
    events: maxEvents,
    finalTick: maxTick,
    elapsedMs: maxTick * 5,
    finalState: {
      tick: maxTick, phase: GamePhase.Settle, matchId: maxMatchId,
      players: [maxPlayer(maxSidA, maxTick), maxPlayer(maxSidB, maxTick)],
    },
    participants: [
      { sessionId: maxSidA, userId: esc(128), name: maxName, place: 1, round: 0, elapsedMs: maxTick * 5, survived: true },
      { sessionId: maxSidB, userId: null, name: maxName, place: 2, round: 0, elapsedMs: maxTick * 5, survived: false },
    ],
  });
  const maxBytes = Buffer.byteLength(JSON.stringify(maximal), "utf8");
  assert.ok(
    maxBytes < MATCH_V3_MAX_PAYLOAD_BYTES,
    `合法证据尺寸上界 ${maxBytes}B 必须仍低于预算 ${MATCH_V3_MAX_PAYLOAD_BYTES}B——否则自检③应改为不插桩直测`,
  );

  const before = new Map<string, number>();
  for (const key of MATCH_STREAM_KEYS) before.set(key, await stream(key).xlen(key));
  const quarantineBefore = await stream(K_STREAM_MATCH_QUARANTINE).xlen(K_STREAM_MATCH_QUARANTINE);
  const producerEntry = async () => {
    const entries = await stream(K_STREAM_MATCH_QUARANTINE).xrange(
      K_STREAM_MATCH_QUARANTINE, "-", "+",
    ) as [string, string[]][];
    return entries.map(([id, fields]) => ({ id, fields: Object.fromEntries(
      Array.from({ length: fields.length / 2 }, (_, index) => fields.slice(index * 2, index * 2 + 2)),
    ) })).filter((entry) => entry.fields.matchId === matchId);
  };

  const errors: string[] = [];
  const originalError = console.error;
  const originalByteLength = Buffer.byteLength;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
  // 桩只对「守卫那一调用」生效：生产代码是 Buffer.byteLength(payload, "utf8") 双参调用，
  // 而 ioredis 的参数编码全部是单参调用（Command.js）——桩永不向 RESP 编码撒谎。即使守卫
  // 被删（变异推演），XADD 也会正常成功，用例以断言失败转红，而不是连接挂起。
  Buffer.byteLength = ((value: unknown, ...rest: unknown[]) =>
    value === expectedPayload && rest[0] === "utf8"
      ? MATCH_V3_MAX_PAYLOAD_BYTES + 1
      : (originalByteLength as (...args: unknown[]) => number)(value, ...rest)) as typeof Buffer.byteLength;
  try {
    const result = await emitMatchEvidence(reversed);
    assert.deepEqual(
      result,
      { ok: false, kind: "self-check", reason: "V3_PAYLOAD_PAYLOAD_SIZE" },
      "超预算必须归类 self-check；码 = V3_PAYLOAD_ 前缀 + PAYLOAD_SIZE（与消费侧裸 V3_PAYLOAD_SIZE 同码族）",
    );
  } finally {
    Buffer.byteLength = originalByteLength;
    console.error = originalError;
  }

  try {
    assert.ok(
      errors.some((line) => line.includes("producer 自检失败") && line.includes("V3_PAYLOAD_PAYLOAD_SIZE")),
      "自检③失败必须留下带码的 console.error 痕迹（⛔ 不得整个吞掉日志）",
    );
    for (const key of MATCH_STREAM_KEYS) {
      assert.equal(await stream(key).xlen(key), before.get(key), `${key} 不得因自检③失败而变动`);
    }
    assert.equal(
      await stream(K_STREAM_MATCH_QUARANTINE).xlen(K_STREAM_MATCH_QUARANTINE),
      quarantineBefore + 1,
      "自检③失败必须写一条 producer quarantine——删掉那段 XADD 时本断言转红",
    );
    const mine = await producerEntry();
    assert.equal(mine.length, 1, "quarantine 痕迹必须能按 matchId 找回");
    assert.equal(mine[0].fields.sourceKind, "producer");
    assert.equal(mine[0].fields.reason, "V3_PAYLOAD_PAYLOAD_SIZE");
    assert.equal(JSON.parse(String(mine[0].fields.rawFields)).matchId, matchId,
      "rawFields 必须保全可供人工核查的原始证据");
  } finally {
    // quarantine 永不自动裁剪，本用例自己清理，⛔ 不得泄漏条目。
    const leftover = await producerEntry();
    if (leftover.length > 0) {
      await stream(K_STREAM_MATCH_QUARANTINE).xdel(
        K_STREAM_MATCH_QUARANTINE, ...leftover.map((entry) => entry.id),
      );
    }
  }
});

/**
 * XADD 真实失败（transport）注入：同一 Redis 实例、同一条证据，只把 `stream:match:v3` 一个 key 的
 * xadd 打成拒绝。断言三点：① emitMatchEvidence 归 `transport/V3_XADD_FAILED`；② 真实 GameRoom
 * 调用方（settle 的 `.then`，默认 evidenceEmitter 即 emitMatchEvidence）**不告警**——只有
 * self-check 才告警；③ quarantine 零新增（transport 不是内部一致性缺陷，⛔ 不得留 producer 条目）。
 */
test("v3 XADD 失败：归 transport、真实调用方不告警、quarantine 零新增", async () => {
  const directMatchId = `m_v3_xadd_direct_${Date.now().toString(36)}`;
  const roomMatchId = `m_v3_xadd_room_${Date.now().toString(36)}`;
  const evidence = await makeV3Evidence(directMatchId, 27);

  // 夹具有效性：同一 Redis、同一条证据，未注入故障时必须 XADD 成功。
  const control = await emitMatchEvidence(evidence);
  assert.ok(control.ok, "对照：未注入故障时 XADD 必须成功");
  await stream(K_STREAM_MATCH_V3).xdel(K_STREAM_MATCH_V3, control.entryId);

  const before = new Map<string, number>();
  for (const key of MATCH_STREAM_KEYS) before.set(key, await stream(key).xlen(key));
  const quarantineBefore = await stream(K_STREAM_MATCH_QUARANTINE).xlen(K_STREAM_MATCH_QUARANTINE);

  const client = clientForKey(K_STREAM_MATCH_V3);
  const injected = new Error("injected XADD outage");
  const ownDescriptor = Object.getOwnPropertyDescriptor(client, "xadd");
  const originalXadd = client.xadd;
  const errors: string[] = [];
  const originalError = console.error;
  let room: GameRoom | null = null;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
  (client as unknown as { xadd: unknown }).xadd = (...args: unknown[]) =>
    args[0] === K_STREAM_MATCH_V3
      ? Promise.reject(injected)
      : (originalXadd as (...a: unknown[]) => unknown).apply(client, args);
  try {
    // ① 直调：真实 validate+replay 通过、XADD 被拒 ⇒ transport，⛔ 不是 self-check。
    const result = await emitMatchEvidence(evidence);
    assert.deepEqual(
      result,
      { ok: false, kind: "transport", reason: "V3_XADD_FAILED" },
      "XADD 失败必须归类 transport——它是 Redis 可用性事故，不是 GameRoom 内部一致性缺陷",
    );

    // ② 走真实调用方：默认 evidenceEmitter 的 GameRoom 完整收局。
    room = new GameRoom({ seed: 0xabcd_ef01, matchId: () => roomMatchId, mode: createBallMoveGameMode() });
    (room as unknown as { sId: number }).sId = 33;
    (room as unknown as { lock: () => Promise<void> }).lock = async () => undefined;
    const roomClient = (sessionId: string, userId: string) => ({
      sessionId,
      auth: { userId, sId: 33, mode: GameplayModeId.BallMove, profile: "default" },
      send() {},
    });
    const first = roomClient("sA", "u_xadd_a");
    const second = roomClient("sB", "u_xadd_b");
    await room.onJoin(first as never, {});
    await room.onJoin(second as never, {});
    await room.onLeave(second as never, 4000);
    assert.equal(room.state.phase, GamePhase.Settle, "构造前提：本用例必须真的走到收局");
    await sleep(50); // 等 emitMatchEvidence 的 promise 链落地
  } finally {
    if (ownDescriptor) { Object.defineProperty(client, "xadd", ownDescriptor); }
    else { delete (client as unknown as Record<string, unknown>).xadd; }
    console.error = originalError;
    if (room) { await room.onDispose(); }
  }

  assert.ok(
    errors.some((line) => line.includes("v3 证据链 XADD 失败") && line.includes(roomMatchId)),
    "调用方路径必须真的发生了 XADD 失败（带 matchId 的 transport 日志）",
  );
  assert.ok(
    !errors.some((line) => line.includes("收局证据自检失败")),
    "⛔ transport 不得触发 GameRoom 的自检告警——只有 self-check 才告警（GameRoom settle 的 `.then`）",
  );
  for (const key of MATCH_STREAM_KEYS) {
    assert.equal(await stream(key).xlen(key), before.get(key), `${key} 不得有残留条目`);
  }
  assert.equal(
    await stream(K_STREAM_MATCH_QUARANTINE).xlen(K_STREAM_MATCH_QUARANTINE),
    quarantineBefore,
    "transport 失败不得写 quarantine——它不是内部一致性缺陷",
  );
});

test("historical raw v2 fixture preserves the frozen v2 payload contract", async () => {
  const m = newMatchId();
  usedMatchIds.push(m);
  // matchId 形制（09·K4/05）：m_ + 时间戳36 + 随机hex，纯 ascii ≤ 40
  assert.match(m, /^m_[0-9a-z]+[0-9a-f]{16}$/);
  assert.ok(m.length <= 40, `matchId 长度 ${m.length} ≤ 40`);

  const ev = makeEvidence(m);
  ev.participants[0].userId = "u".repeat(128);
  const legacyLenBefore = await stream(K_STREAM_MATCH).xlen(K_STREAM_MATCH);
  const sid = await emitV2Evidence(ev);
  assert.ok(sid, "XADD 成功返回条目 id");
  rememberStreamEntry(K_STREAM_MATCH_V2, sid!);
  assert.equal(await stream(K_STREAM_MATCH).xlen(K_STREAM_MATCH), legacyLenBefore);
  const entries = await stream().xrange(K_STREAM_MATCH_V2, sid!, sid!);
  assert.equal(entries.length, 1, "消息只存在 v2 key");
  const fields = Object.fromEntries(
    Array.from({ length: entries[0][1].length / 2 }, (_, i) => entries[0][1].slice(i * 2, i * 2 + 2)),
  );
  assert.equal(fields.schemaVersion, String(MATCH_STREAM_V2_SCHEMA_VERSION), "v2 顶层版本字段精确为 2");

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

  const entryId = await emitV2Evidence(evidence);
  assert.ok(entryId, "ranked evidence 必须进入 v2 stream");
  rememberStreamEntry(K_STREAM_MATCH_V2, entryId!);
  const entries = await stream().xrange(K_STREAM_MATCH_V2, entryId!, entryId!);
  const fields = Object.fromEntries(
    Array.from({ length: entries[0][1].length / 2 }, (_, index) =>
      entries[0][1].slice(index * 2, index * 2 + 2)),
  );
  assert.equal(fields.schemaVersion, String(MATCH_STREAM_V2_SCHEMA_VERSION), "兼容 ranked payload 仍属于 schema v2");

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
  const id1 = await emitV2Evidence(ev);
  const id2 = await emitV2Evidence(ev);
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
    const sid = await emitV2Evidence(makeEvidence(m));
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
      token: owner.token, v: GAME_ROOM_PROTOCOL_VERSION, sId: 1, mode: GameplayModeId.BallMove, modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion, profile: "default",
    });
    colyseus.sdk.auth.token = intruder.token;
    await assert.rejects(
      colyseus.sdk.joinById(roomS1.roomId, {
        token: intruder.token, v: GAME_ROOM_PROTOCOL_VERSION, sId: 2, mode: GameplayModeId.BallMove, modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion, profile: "default",
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
      v: GAME_ROOM_PROTOCOL_VERSION,
      sId: 7,
      mode: GameplayModeId.BallMove,
      modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
      profile: "default",
    });
    // ⚠ 带 v：GAME_ROOM_PROTOCOL_VERSION 自 M12e 起为 2，`connectTo` 的 options 会走 GameRoom.onAuth 的版本闸
    colyseus.sdk.auth.token = a.token;
    const c1 = await colyseus.connectTo(room, {
      token: a.token, v: GAME_ROOM_PROTOCOL_VERSION, sId: 7, mode: GameplayModeId.BallMove, modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion, profile: "default",
    });
    assert.equal(room.state.matchId, "", "等人期尚无 matchId");
    colyseus.sdk.auth.token = b.token;
    const c2 = await colyseus.connectTo(room, {
      token: b.token, v: GAME_ROOM_PROTOCOL_VERSION, sId: 7, mode: GameplayModeId.BallMove, modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion, profile: "default",
    });
    c1.onMessage("*", () => { });
    c2.onMessage("*", () => { });

    // 两人到齐即开局
    for (let i = 0; i < 80 && room.state.phase !== GamePhase.Playing; i++) { await room.waitForNextPatch(); }
    assert.equal(room.state.phase, GamePhase.Playing, "开赛");
    const matchId = room.state.matchId as string;
    usedMatchIds.push(matchId);
    assert.match(matchId, /^m_[0-9a-z]+[0-9a-f]{16}$/, "开局即生成 matchId 写进 state（09·K4）");

    // 主动离开是完整、可重放的权威事件；不得直接篡改服务端 HP 制造不可重放终态。
    await c2.leave();
    for (let i = 0; i < 80 && room.state.phase !== GamePhase.Settle; i++) { await room.waitForNextPatch(); }
    assert.equal(room.state.phase, GamePhase.Settle, "收局");

    // 证据是 fire-and-forget XADD：轮询等它到流里（同一 matchId）
    let entryId: string | undefined;
    for (let i = 0; i < 40 && !entryId; i++) {
      const entries = (await stream(K_STREAM_MATCH_V3).xrange(
        K_STREAM_MATCH_V3, "-", "+",
      )) as [string, string[]][];
      for (const [id, fields] of entries) {
        const idx = fields.indexOf("matchId");
        if (idx >= 0 && fields[idx + 1] === matchId) { entryId = id; break; }
      }
      if (!entryId) { await sleep(50); }
    }
    assert.ok(entryId, "收局后 stream:match:v3 出现本局证据");
    rememberStreamEntry(K_STREAM_MATCH_V3, entryId!);

    // 消费落库：payload 里两名参与者、userId 齐全、名次正确
    await consumeOnce();
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT mode, server_id, payload FROM match_results WHERE match_id = ?", [matchId]);
    assert.equal(rows.length, 1, "端到端一局一行");
    assert.equal(rows[0].mode, MATCH_MODE_CASUAL, "休闲局 mode=0");
    // ⚠ 端到端钉住区：建房 options.sId=7 → onCreate 存房级 sId → 收局证据带出 → 落库 server_id
    assert.equal(Number(rows[0].server_id), 7, "⛔ 建房时的 sId 必须一路带到 match_results.server_id");
    const payload = rows[0].payload as MatchEvidenceV3;
    replayMatchEvidenceV3(validateMatchEvidenceV3(payload));
    assert.equal(payload.participants.length, 2);
    const winner = payload.participants.find((p) => p.place === 1);
    const loser = payload.participants.find((p) => p.place === 2);
    assert.equal(winner?.userId, a.uid, "幸存者第一");
    assert.equal(winner?.survived, true);
    assert.equal(loser?.userId, b.uid, "阵亡者第二");
    assert.equal(loser?.survived, false);
    assert.ok(typeof payload.seed === "number" && payload.mapIndex === 0, "seed/mapIndex 入证据");
    assert.equal(payload.loadout, null, "休闲局无归一化 loadout（BYO）");
    assert.equal(payload.events.at(-1)?.type, "leave", "Playing leave 必须在 settle 前进入 v3 event log");
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
  const entryId = await emitV2Evidence(makeEvidence(mid, 107));
  assert.ok(entryId);
  rememberStreamEntry(K_STREAM_MATCH_V2, entryId!);
  await consumeOnce();

  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT server_id FROM match_results WHERE match_id = ?", [mid]);
  assert.equal(rows.length, 1, "证据已落库");
  assert.equal(Number(rows[0].server_id), 107, "⛔ server_id 必须是证据里的区，不能恒 0");
});

/**
 * legacy 分支此前是唯一不校验「顶层列 ↔ payload」的通道，实测能落出 `match_id` 列与
 * `payload.matchId` 完全不同的行——连顶层两列都不能当可信索引。v2 有 V2_PAYLOAD_BINDING、
 * v3 有 V3_PAYLOAD_BINDING，这里补上 legacy 的对应闸。
 *
 * 同时钉住**不能过度收紧**：真正的 c8 旧消息 payload 里根本没有 matchId/mode，若改成无条件
 * 要求存在会把全部合法历史消息隔离掉，所以下面第三段用「payload 不带这两个字段」的条目
 * 断言它照常落库。
 */
test("legacy 顶层列与 payload 发散必须隔离，但不带这两个字段的真旧消息照常落库", async () => {
  const nonce = `${process.pid}_${Date.now().toString(36)}`;
  const divergentMid = `m_lgbind_${nonce}`;
  const bareMid = `m_lgbare_${nonce}`;
  usedMatchIds.push(divergentMid, bareMid);

  // ① payload.matchId 与顶层完全不同 → 必须隔离，不得落库
  const divergent = makeEvidence(divergentMid, 31);
  divergent.matchId = "COMPLETELY_DIFFERENT";
  const divergentId = await stream(K_STREAM_MATCH).xadd(
    K_STREAM_MATCH, "*",
    "matchId", divergentMid, "mode", String(divergent.mode), "sId", "31",
    "payload", JSON.stringify(divergent),
  );
  assert.ok(divergentId);
  rememberStreamEntry(K_STREAM_MATCH, divergentId!);

  // ② payload.mode 与顶层不同 → 同样隔离（mode 列是运营口径的分组键）
  const modeMid = `m_lgmode_${nonce}`;
  usedMatchIds.push(modeMid);
  const modeDivergent = makeEvidence(modeMid, 32);
  modeDivergent.mode = 99;
  const modeId = await stream(K_STREAM_MATCH).xadd(
    K_STREAM_MATCH, "*",
    "matchId", modeMid, "mode", "1", "sId", "32", "payload", JSON.stringify(modeDivergent),
  );
  assert.ok(modeId);
  rememberStreamEntry(K_STREAM_MATCH, modeId!);

  // ③ 真 c8 形态：payload 里既没有 matchId 也没有 mode → 必须照常落库
  const bareId = await stream(K_STREAM_MATCH).xadd(
    K_STREAM_MATCH, "*",
    "matchId", bareMid, "mode", "1", "sId", "33",
    "payload", JSON.stringify({ source: "c8", detail: { rounds: 3 } }),
  );
  assert.ok(bareId);
  rememberStreamEntry(K_STREAM_MATCH, bareId!);

  const quarantinedFor = async (sourceIds: string[]) => {
    const entries = await stream(K_STREAM_MATCH_QUARANTINE).xrange(
      K_STREAM_MATCH_QUARANTINE, "-", "+",
    ) as [string, string[]][];
    return entries.map(([id, fields]) => ({ id, fields: Object.fromEntries(
      Array.from({ length: fields.length / 2 }, (_, index) => fields.slice(index * 2, index * 2 + 2)),
    ) })).filter((entry) => sourceIds.includes(String(entry.fields.sourceId)));
  };

  try {
    assert.ok(await consumeOnce({ count: 16 }) >= 3);
    assert.equal(await countRows("match_results", divergentMid), 0, "matchId 发散的 legacy 行不得落库");
    assert.equal(await countRows("match_results", modeMid), 0, "mode 发散的 legacy 行不得落库");

    const quarantined = await quarantinedFor([divergentId!, modeId!]);
    assert.equal(quarantined.length, 2, "两条发散条目各自产生一条隔离副本");
    const reasonById = new Map(quarantined.map((e) => [String(e.fields.sourceId), String(e.fields.reason)]));
    assert.equal(reasonById.get(divergentId!), "LEGACY_MATCH_ID_MISMATCH");
    assert.equal(reasonById.get(modeId!), "LEGACY_MODE_MISMATCH");

    const [bareRows] = await getPool().query<RowDataPacket[]>(
      "SELECT mode, server_id, schema_version, payload FROM match_results WHERE match_id = ?",
      [bareMid],
    );
    assert.equal(bareRows.length, 1, "⛔ 不带 matchId/mode 的真 c8 旧消息必须照常落库，不能被新闸误伤");
    assert.equal(Number(bareRows[0].mode), 1);
    assert.equal(Number(bareRows[0].server_id), 33);
    assert.equal(Number(bareRows[0].schema_version), 0);
  } finally {
    const leftover = await quarantinedFor([divergentId!, modeId!]);
    if (leftover.length > 0) {
      await stream(K_STREAM_MATCH_QUARANTINE).xdel(
        K_STREAM_MATCH_QUARANTINE, ...leftover.map((entry) => entry.id),
      );
    }
    await stream(K_STREAM_MATCH).xdel(K_STREAM_MATCH, divergentId!, modeId!, bareId!);
  }
});

test("单轮三读：legacy/v2/v3 同时落库，三条独立 PEL 各自 ACK", async () => {
  const legacyMid = `m_f91_${Date.now().toString(36)}`;
  const v2Mid = `m_v2_${Date.now().toString(36)}`;
  const v3Mid = `m_v3_${Date.now().toString(36)}`;
  usedMatchIds.push(legacyMid, v2Mid, v3Mid);
  const legacyEv = makeEvidence(legacyMid, 107);
  const legacyId = await stream(K_STREAM_MATCH).xadd(
    K_STREAM_MATCH, "*",
    "matchId", legacyMid, "mode", String(legacyEv.mode), "sId", "107", "payload", JSON.stringify(legacyEv),
  );
  assert.ok(legacyId);
  rememberStreamEntry(K_STREAM_MATCH, legacyId!);
  const v2Id = await emitV2Evidence(makeEvidence(v2Mid, 8));
  assert.ok(v2Id);
  rememberStreamEntry(K_STREAM_MATCH_V2, v2Id!);
  const v3Emitted = await emitMatchEvidence(await makeV3Evidence(v3Mid, 9));
  assert.ok(v3Emitted.ok);
  const v3Id = v3Emitted.entryId;
  assert.ok(v3Id);
  rememberStreamEntry(K_STREAM_MATCH_V3, v3Id!);

  assert.ok(await consumeOnce() >= 3, "同一轮同时读取 legacy、v2 与 v3");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT match_id, server_id, schema_version, payload FROM match_results WHERE match_id IN (?, ?, ?)",
    [legacyMid, v2Mid, v3Mid],
  );
  const byMid = new Map(rows.map((row) => [String(row.match_id), row]));
  // 三种形状在同一张表里共存，读取方唯一能依据的判别就是这一列。⛔ 不要用 mode 列反推：
  // v3 的 mode 恒 0，而 legacy/v2 的 mode 是玩法值，两者取值域重叠。
  assert.equal(Number(byMid.get(legacyMid)?.schema_version), 0, "legacy 形状标 0（未知/无 shape 校验）");
  assert.equal(Number(byMid.get(v2Mid)?.schema_version), 2, "v2 形状标 2（冻结的 8 键）");
  assert.equal(Number(byMid.get(v3Mid)?.schema_version), 3, "v3 形状标 3（可重放的 16 键）");
  assert.equal(Number(byMid.get(legacyMid)?.server_id), 107, "f91 legacy 顶层非零 sId 保留");
  assert.equal(Number(byMid.get(legacyMid)?.payload.sId), 107, "legacy DB JSON 同步为权威顶层 sId");
  assert.equal(Number(byMid.get(v2Mid)?.server_id), 8, "v2 sId 正常落库");
  assert.equal(Number(byMid.get(v3Mid)?.server_id), 9, "v3 sId 正常落库");
  replayMatchEvidenceV3(validateMatchEvidenceV3(byMid.get(v3Mid)?.payload));
  for (const key of MATCH_STREAM_KEYS) {
    const pending = await stream(key).xpending(key, GROUP) as [number, ...unknown[]];
    assert.equal(Number(pending[0]), 0, `${key} 的 ACK 必须落回各自来源流`);
  }
});

test("XAUTOCLAIM takes stale PEL entries from legacy, v2, and v3", async () => {
  const nonce = Date.now().toString(36);
  const legacyMid = `m_claim_legacy_${nonce}`;
  const v2Mid = `m_claim_v2_${nonce}`;
  const v3Mid = `m_claim_v3_${nonce}`;
  usedMatchIds.push(legacyMid, v2Mid, v3Mid);
  const legacyEvidence = makeEvidence(legacyMid, 31);
  const legacyId = await stream(K_STREAM_MATCH).xadd(
    K_STREAM_MATCH, "*",
    "matchId", legacyMid, "mode", String(legacyEvidence.mode), "sId", "31",
    "payload", JSON.stringify(legacyEvidence),
  );
  const v2Id = await emitV2Evidence(makeEvidence(v2Mid, 32));
  const v3Emitted = await emitMatchEvidence(await makeV3Evidence(v3Mid, 33));
  assert.ok(v3Emitted.ok);
  const v3Id = v3Emitted.entryId;
  assert.ok(legacyId && v2Id && v3Id);
  const entries = [
    { key: K_STREAM_MATCH, id: legacyId! },
    { key: K_STREAM_MATCH_V2, id: v2Id! },
    { key: K_STREAM_MATCH_V3, id: v3Id! },
  ] as const;
  for (const entry of entries) rememberStreamEntry(entry.key, entry.id);
  const deadConsumer = `dead_claim_${process.pid}_${nonce}`;

  try {
    for (const { key, id } of entries) {
      const delivered = await stream(key).call(
        "XREADGROUP", "GROUP", GROUP, deadConsumer, "COUNT", "1", "STREAMS", key, ">",
      ) as [string, [string, string[]][]][] | null;
      assert.equal(delivered?.[0]?.[1]?.[0]?.[0], id);
      await stream(key).call("XCLAIM", key, GROUP, deadConsumer, "0", id, "IDLE", "61000");
    }
    assert.ok(await consumeOnce({ count: 64 }) >= entries.length);
    for (const { key } of entries) {
      const pending = await stream(key).xpending(key, GROUP) as [number, ...unknown[]];
      assert.equal(Number(pending[0]), 0, `${key} stale PEL must be claimed, stored, and ACKed`);
    }
    for (const matchId of [legacyMid, v2Mid, v3Mid]) {
      assert.equal(await countRows("match_results", matchId), 1);
    }
  } finally {
    for (const { key } of entries) {
      await stream(key).xgroup("DELCONSUMER", key, GROUP, deadConsumer);
    }
  }
});

test("safe-point trim advances independently on legacy, v2, and v3", async () => {
  const nonce = Date.now().toString(36);
  const mids = {
    legacy: `m_trim_legacy_${nonce}`,
    v2: `m_trim_v2_${nonce}`,
    v3: `m_trim_v3_${nonce}`,
  };
  usedMatchIds.push(mids.legacy, mids.v2, mids.v3);
  const legacy = makeEvidence(mids.legacy, 51);
  const v2 = makeEvidence(mids.v2, 52);
  const v3 = await makeV3Evidence(mids.v3, 53);
  const fixtures = [
    {
      key: K_STREAM_MATCH,
      fields: ["matchId", mids.legacy, "mode", "0", "sId", "51", "payload", JSON.stringify(legacy)],
    },
    {
      key: K_STREAM_MATCH_V2,
      fields: [
        "schemaVersion", String(MATCH_STREAM_V2_SCHEMA_VERSION),
        "matchId", mids.v2, "mode", "0", "sId", "52", "payload", JSON.stringify(v2),
      ],
    },
    {
      key: K_STREAM_MATCH_V3,
      fields: [
        "schemaVersion", String(MATCH_STREAM_V3_SCHEMA_VERSION),
        "matchId", mids.v3, "mode", "0", "sId", "53", "payload", JSON.stringify(v3),
      ],
    },
  ] as const;
  const firstIds = new Map<string, string>();
  const batchSize = 140;
  for (const fixture of fixtures) {
    const pipeline = stream(fixture.key).pipeline();
    for (let index = 0; index < batchSize; index++) {
      pipeline.xadd(fixture.key, "*", ...fixture.fields);
    }
    const results = await pipeline.exec();
    assert.ok(results && results.every(([error, id]) => !error && typeof id === "string"));
    const ids = results!.map(([, id]) => String(id));
    firstIds.set(fixture.key, ids[0]);
    for (const id of ids) rememberStreamEntry(fixture.key, id);
  }
  const heldV2Id = firstIds.get(K_STREAM_MATCH_V2)!;
  const holder = `trim_holder_${process.pid}_${nonce}`;
  const held = await stream(K_STREAM_MATCH_V2).call(
    "XREADGROUP", "GROUP", GROUP, holder, "COUNT", "1", "STREAMS", K_STREAM_MATCH_V2, ">",
  ) as [string, [string, string[]][]][] | null;
  assert.equal(held?.[0]?.[1]?.[0]?.[0], heldV2Id);

  try {
    let consumed = 0;
    for (let round = 0; round < 10; round++) {
      const count = await consumeOnce({ count: 256 });
      consumed += count;
      if (count === 0) break;
    }
    assert.ok(consumed >= batchSize * fixtures.length - 1);
    await trimToSafePoint();
    for (const key of [K_STREAM_MATCH, K_STREAM_MATCH_V3]) {
      const pending = await stream(key).xpending(key, GROUP) as [number, ...unknown[]];
      assert.equal(Number(pending[0]), 0);
      const firstId = firstIds.get(key)!;
      assert.equal(
        (await stream(key).xrange(key, firstId, firstId)).length,
        0,
        `${key} must trim even while v2 has an independent PEL`,
      );
    }
    const v2Pending = await stream(K_STREAM_MATCH_V2).xpending(
      K_STREAM_MATCH_V2, GROUP,
    ) as [number, ...unknown[]];
    assert.equal(Number(v2Pending[0]), 1);
    assert.equal(
      (await stream(K_STREAM_MATCH_V2).xrange(K_STREAM_MATCH_V2, heldV2Id, heldV2Id)).length,
      1,
      "v2 pending must block only the v2 trim",
    );
    await stream(K_STREAM_MATCH_V2).call(
      "XCLAIM", K_STREAM_MATCH_V2, GROUP, MATCH_STREAM_CONSUMER, "0", heldV2Id,
    );
    assert.ok(await consumeOnce({ count: 8 }) >= 1, "claimed v2 PEL must take the normal DB + ACK path");
    await trimToSafePoint();
    assert.equal(
      (await stream(K_STREAM_MATCH_V2).xrange(K_STREAM_MATCH_V2, heldV2Id, heldV2Id)).length,
      0,
      "v2 advances after its own PEL is ACKed",
    );
  } finally {
    await stream(K_STREAM_MATCH_V2).xgroup("DELCONSUMER", K_STREAM_MATCH_V2, GROUP, holder);
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

test("legacy 损坏条目从 own PEL 重放后完整隔离并 ACK 来源", async () => {
  const mid = `m_legacy_bad_sid_${Date.now().toString(36)}`;
  usedMatchIds.push(mid);
  const evidence = makeEvidence(mid, 1);
  const sourceId = await stream(K_STREAM_MATCH).xadd(
    K_STREAM_MATCH, "*",
    "matchId", mid,
    "mode", String(evidence.mode),
    "sId", "01",
    "payload", JSON.stringify(evidence),
  );
  assert.ok(sourceId);
  rememberStreamEntry(K_STREAM_MATCH, sourceId!);
  const source = await stream(K_STREAM_MATCH).xrange(
    K_STREAM_MATCH, sourceId!, sourceId!,
  ) as [string, string[]][];
  assert.equal(source.length, 1);
  const delivered = await stream(K_STREAM_MATCH).call(
    "XREADGROUP", "GROUP", GROUP, MATCH_STREAM_CONSUMER,
    "COUNT", "1", "STREAMS", K_STREAM_MATCH, ">",
  ) as [string, [string, string[]][]][] | null;
  assert.equal(delivered?.[0]?.[1]?.[0]?.[0], sourceId, "损坏 legacy 必须先进入正式 consumer 的 PEL");

  const quarantinedForSource = async () => {
    const entries = await stream(K_STREAM_MATCH_QUARANTINE).xrange(
      K_STREAM_MATCH_QUARANTINE, "-", "+",
    ) as [string, string[]][];
    return entries.map(([id, fields]) => ({ id, fields: Object.fromEntries(
      Array.from({ length: fields.length / 2 }, (_, index) => fields.slice(index * 2, index * 2 + 2)),
    ) })).filter((entry) => entry.fields.sourceId === sourceId);
  };

  try {
    assert.ok(await consumeOnce({ count: 8 }) >= 1, "own PEL 中的 legacy 损坏条目必须被重放处置");
    assert.equal(await countRows("match_index", mid), 0);
    assert.equal(await countRows("match_results", mid), 0);
    const pending = await stream(K_STREAM_MATCH).call(
      "XPENDING", K_STREAM_MATCH, GROUP, sourceId!, sourceId!, "1",
    ) as [string, ...unknown[]][];
    assert.equal(pending.length, 0, "quarantine 持久化后必须 ACK legacy 来源 PEL");

    const quarantined = await quarantinedForSource();
    assert.equal(quarantined.length, 1, "同一 legacy 来源只产生一条精确隔离副本");
    const fields = quarantined[0].fields;
    assert.equal(fields.sourceStream, K_STREAM_MATCH);
    assert.equal(fields.sourceKind, "legacy");
    assert.equal(fields.sourceGroup, GROUP);
    assert.equal(fields.sourceIdentity, `${K_STREAM_MATCH}\n${GROUP}\n${sourceId}`);
    assert.deepEqual(JSON.parse(fields.rawFields), source[0][1]);
    assert.equal(fields.reason, "LEGACY_SERVER_ID");
  } finally {
    const quarantined = await quarantinedForSource();
    if (quarantined.length > 0) {
      await stream(K_STREAM_MATCH_QUARANTINE).xdel(
        K_STREAM_MATCH_QUARANTINE, ...quarantined.map((entry) => entry.id),
      );
    }
    await stream(K_STREAM_MATCH).xdel(K_STREAM_MATCH, sourceId!);
  }
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
    "schemaVersion", "2",
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

/**
 * c6043f0 收紧的 v2 接受域没有 producer 可以复现（v3 上线后 v2 只剩历史输入），
 * 因此只能直接 XADD 原始 payload：JSON 里写 `-0` 才能造出 `JSON.parse` 产出的负零。
 * ⛔ 这三条一旦放行：`-0 !== 0` 为 false 会让 binding 检查静默通过，随后被 JSON.stringify
 * 重写成 0 落库，审计记录与 Redis 原始字节从此对不上。
 */
test("v2 接受域：payload 负零与 casual/ranked loadout 违规一律隔离且不落库", async () => {
  const nonce = Date.now().toString(36);
  const negZeroSIdMid = `m_v2_negzero_sid_${nonce}`;
  const casualLoadoutMid = `m_v2_casual_loadout_${nonce}`;
  const rankedNegZeroMid = `m_v2_ranked_negzero_${nonce}`;
  const rankedControlMid = `m_v2_ranked_control_${nonce}`;
  usedMatchIds.push(negZeroSIdMid, casualLoadoutMid, rankedNegZeroMid, rankedControlMid);

  /** JSON.stringify 永远把 -0 写成 0，负零只能靠替换原始字节注入。 */
  const injectNegativeZero = (json: string, needle: string): string => {
    assert.equal(json.split(needle).length, 2, `${needle} 必须在 payload 中精确出现一次`);
    return json.replace(needle, `${needle.slice(0, -1)}-0`);
  };

  // ① 顶层 sId 负零：binding 检查（-0 !== 0 为 false）放行，只能由 evidenceInt 的 Object.is 闸住。
  const negZeroSIdPayload = injectNegativeZero(
    JSON.stringify(makeEvidence(negZeroSIdMid, 0)), '"sId":0',
  );
  assert.ok(
    Object.is((JSON.parse(negZeroSIdPayload) as { sId: number }).sId, -0),
    "夹具必须真的产出 -0，否则本用例恒真",
  );
  const negZeroSIdId = await stream().xadd(
    K_STREAM_MATCH_V2, "*",
    "schemaVersion", String(MATCH_STREAM_V2_SCHEMA_VERSION),
    "matchId", negZeroSIdMid, "mode", String(MATCH_MODE_CASUAL), "sId", "0",
    "payload", negZeroSIdPayload,
  );

  // ② casual 局的 loadout 必须精确为 null：BYO 局不得夹带任何配装数据。
  const casualLoadoutPayload = JSON.stringify({ ...makeEvidence(casualLoadoutMid, 5), loadout: {} });
  const casualLoadoutId = await stream().xadd(
    K_STREAM_MATCH_V2, "*",
    "schemaVersion", String(MATCH_STREAM_V2_SCHEMA_VERSION),
    "matchId", casualLoadoutMid, "mode", String(MATCH_MODE_CASUAL), "sId", "5",
    "payload", casualLoadoutPayload,
  );

  // ③ ranked 局的 loadout 走 canonical JSON 递归校验：嵌套负零同样不是 canonical。
  const rankedNegZeroPayload = injectNegativeZero(
    JSON.stringify({ ...makeEvidence(rankedNegZeroMid, 6), mode: MATCH_MODE_RANKED, loadout: { roll: 0 } }),
    '"roll":0',
  );
  const rankedNegZeroId = await stream().xadd(
    K_STREAM_MATCH_V2, "*",
    "schemaVersion", String(MATCH_STREAM_V2_SCHEMA_VERSION),
    "matchId", rankedNegZeroMid, "mode", String(MATCH_MODE_RANKED), "sId", "6",
    "payload", rankedNegZeroPayload,
  );

  // ④ 对照组：同一条 ranked 证据把 -0 换成 0 后必须正常落库，证明拒绝理由只可能是负零。
  const rankedControlPayload = JSON.stringify({
    ...makeEvidence(rankedControlMid, 6), mode: MATCH_MODE_RANKED, loadout: { roll: 0 },
  });
  assert.equal(
    rankedControlPayload.replace(rankedControlMid, rankedNegZeroMid),
    rankedNegZeroPayload.replace('"roll":-0', '"roll":0'),
    "对照组必须与负零组逐字节只差一个负号",
  );
  const rankedControlId = await stream().xadd(
    K_STREAM_MATCH_V2, "*",
    "schemaVersion", String(MATCH_STREAM_V2_SCHEMA_VERSION),
    "matchId", rankedControlMid, "mode", String(MATCH_MODE_RANKED), "sId", "6",
    "payload", rankedControlPayload,
  );

  assert.ok(negZeroSIdId && casualLoadoutId && rankedNegZeroId && rankedControlId);
  const rejectedIds = new Map([
    [negZeroSIdId!, negZeroSIdMid],
    [casualLoadoutId!, casualLoadoutMid],
    [rankedNegZeroId!, rankedNegZeroMid],
  ]);
  for (const id of [negZeroSIdId!, casualLoadoutId!, rankedNegZeroId!, rankedControlId!]) {
    rememberStreamEntry(K_STREAM_MATCH_V2, id);
  }
  const quarantinedForSources = async () => {
    const entries = await stream(K_STREAM_MATCH_QUARANTINE).xrange(
      K_STREAM_MATCH_QUARANTINE, "-", "+",
    ) as [string, string[]][];
    return entries.map(([id, fields]) => ({ id, fields: Object.fromEntries(
      Array.from({ length: fields.length / 2 }, (_, i) => fields.slice(i * 2, i * 2 + 2)),
    ) })).filter((entry) => rejectedIds.has(entry.fields.sourceId));
  };

  try {
    assert.ok(await consumeOnce() >= 4, "四条 v2 条目都被读取并处置");
    const quarantined = new Map(
      (await quarantinedForSources()).map((entry) => [entry.fields.sourceId, entry.fields]),
    );
    for (const [sourceId, matchId] of rejectedIds) {
      assert.equal(
        quarantined.get(sourceId)?.reason, "V2_PAYLOAD_SHAPE",
        `${matchId} 必须按 v2 payload 形状隔离`,
      );
      assert.equal(quarantined.get(sourceId)?.sourceKind, "v2");
      assert.equal(await countRows("match_index", matchId), 0, `${matchId} 不得落 match_index`);
      assert.equal(await countRows("match_results", matchId), 0, `${matchId} 不得落 match_results`);
    }
    // 对照组落库：说明三条拒绝都不是因为夹具本身不合法。
    assert.equal(await countRows("match_results", rankedControlMid), 1, "合法 ranked 对照组必须落库");
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT payload FROM match_results WHERE match_id = ?", [rankedControlMid],
    );
    assert.deepEqual((rows[0].payload as MatchEvidence).loadout, { roll: 0 });
  } finally {
    const cleanupEntries = await quarantinedForSources();
    if (cleanupEntries.length > 0) {
      await stream(K_STREAM_MATCH_QUARANTINE).xdel(
        K_STREAM_MATCH_QUARANTINE, ...cleanupEntries.map((entry) => entry.id),
      );
    }
  }
});

test("v3 replay mismatch, one-player evidence, non-canonical JSON, and oversized payload are quarantined", async () => {
  const nonce = Date.now().toString(36);
  const mismatchMid = `m_v3_mismatch_${nonce}`;
  const onePlayerMid = `m_v3_one_${nonce}`;
  const nonCanonicalMid = `m_v3_canonical_${nonce}`;
  const oversizedMid = `m_v3_oversized_${nonce}`;
  const mismatched = structuredClone(await makeV3Evidence(mismatchMid, 41));
  mismatched.finalState.players[0].hp--;
  const onePlayer = structuredClone(await makeV3Evidence(onePlayerMid, 42));
  onePlayer.initialRoster.pop();
  const nonCanonical = await makeV3Evidence(nonCanonicalMid, 43);
  const addRawV3 = (matchId: string, sId: number, payload: string) => stream(K_STREAM_MATCH_V3).xadd(
    K_STREAM_MATCH_V3, "*",
    "schemaVersion", String(MATCH_STREAM_V3_SCHEMA_VERSION),
    "matchId", matchId,
    "mode", String(MATCH_MODE_CASUAL),
    "sId", String(sId),
    "payload", payload,
  );
  const mismatchId = await addRawV3(mismatchMid, 41, JSON.stringify(mismatched));
  const onePlayerId = await addRawV3(onePlayerMid, 42, JSON.stringify(onePlayer));
  const nonCanonicalId = await addRawV3(
    nonCanonicalMid,
    43,
    ` ${JSON.stringify(nonCanonical)}\n`,
  );
  const oversizedId = await addRawV3(
    oversizedMid,
    44,
    "x".repeat(MATCH_V3_MAX_PAYLOAD_BYTES + 1),
  );
  assert.ok(mismatchId && onePlayerId && nonCanonicalId && oversizedId);
  const mismatchSource = await stream(K_STREAM_MATCH_V3).xrange(
    K_STREAM_MATCH_V3, mismatchId!, mismatchId!,
  ) as [string, string[]][];
  const sourceIds = new Set([mismatchId!, onePlayerId!, nonCanonicalId!, oversizedId!]);
  for (const id of sourceIds) rememberStreamEntry(K_STREAM_MATCH_V3, id);

  const quarantined = async () => {
    const entries = await stream(K_STREAM_MATCH_QUARANTINE).xrange(
      K_STREAM_MATCH_QUARANTINE, "-", "+",
    ) as [string, string[]][];
    return entries.map(([id, fields]) => ({ id, fields: Object.fromEntries(
      Array.from({ length: fields.length / 2 }, (_, index) => fields.slice(index * 2, index * 2 + 2)),
    ) })).filter((entry) => sourceIds.has(entry.fields.sourceId));
  };

  try {
    assert.ok(await consumeOnce() >= 4);
    for (const matchId of [mismatchMid, onePlayerMid, nonCanonicalMid, oversizedMid]) {
      assert.equal(await countRows("match_index", matchId), 0);
    }
    const pending = await stream(K_STREAM_MATCH_V3).xpending(K_STREAM_MATCH_V3, GROUP) as [number, ...unknown[]];
    assert.equal(Number(pending[0]), 0);
    const bySource = new Map((await quarantined()).map((entry) => [entry.fields.sourceId, entry.fields]));
    assert.equal(bySource.get(mismatchId!)?.reason, "V3_REPLAY_FINAL_STATE");
    assert.equal(bySource.get(onePlayerId!)?.reason, "V3_PAYLOAD_ARRAY");
    assert.equal(bySource.get(nonCanonicalId!)?.reason, "V3_PAYLOAD_CANONICAL");
    assert.equal(bySource.get(oversizedId!)?.reason, "V3_PAYLOAD_SIZE");
    const mismatchQuarantine = bySource.get(mismatchId!);
    assert.equal(mismatchQuarantine?.sourceStream, K_STREAM_MATCH_V3);
    assert.equal(mismatchQuarantine?.sourceGroup, GROUP);
    assert.equal(mismatchQuarantine?.sourceKind, "v3");
    assert.equal(
      mismatchQuarantine?.sourceIdentity,
      `${K_STREAM_MATCH_V3}\n${GROUP}\n${mismatchId}`,
    );
    assert.deepEqual(JSON.parse(mismatchQuarantine!.rawFields), mismatchSource[0][1]);
  } finally {
    const entries = await quarantined();
    if (entries.length > 0) {
      await stream(K_STREAM_MATCH_QUARANTINE).xdel(
        K_STREAM_MATCH_QUARANTINE, ...entries.map((entry) => entry.id),
      );
    }
  }
});

test("v3 quarantine 写入失败时不得 ACK 损坏来源条目", async () => {
  const mid = `m_v3_quarantine_fail_${Date.now().toString(36)}`;
  const ev = await makeV3Evidence(mid, 1);
  const sourceId = await stream(K_STREAM_MATCH_V3).xadd(
    K_STREAM_MATCH_V3, "*",
    "schemaVersion", "broken",
    "matchId", mid, "mode", String(ev.mode), "sId", "1", "payload", JSON.stringify(ev),
  );
  assert.ok(sourceId);
  rememberStreamEntry(K_STREAM_MATCH_V3, sourceId!);
  const reader = `quarantine_failure_${process.pid}`;
  const read = await stream(K_STREAM_MATCH_V3).call(
    "XREADGROUP", "GROUP", GROUP, reader, "COUNT", "1", "STREAMS", K_STREAM_MATCH_V3, ">",
  ) as [string, [string, string[]][]][] | null;
  const entry = read?.[0]?.[1]?.find(([id]) => id === sourceId);
  assert.ok(entry, "测试条目必须先进入 settle PEL");

  const wrongTypeKey = `${K_STREAM_MATCH_QUARANTINE}:wrongtype:${process.pid}:${Date.now()}`;
  await stream(wrongTypeKey).set(wrongTypeKey, "not-a-stream");
  try {
    await assert.rejects(
      quarantineMalformedMatchEntry(
        stream(K_STREAM_MATCH_V3), K_STREAM_MATCH_V3, "v3", sourceId!, entry![1],
        "V3_SCHEMA_VERSION", wrongTypeKey,
      ),
      /WRONGTYPE/,
    );
    const details = await stream(K_STREAM_MATCH_V3).call(
      "XPENDING", K_STREAM_MATCH_V3, GROUP, sourceId!, sourceId!, "1",
    ) as [string, ...unknown[]][];
    assert.equal(details.length, 1, "XADD quarantine 失败时 Lua 不得继续执行 XACK");
  } finally {
    await stream(K_STREAM_MATCH_V3).xack(K_STREAM_MATCH_V3, GROUP, sourceId!);
    await stream(wrongTypeKey).del(wrongTypeKey);
    await stream(K_STREAM_MATCH_V3).xgroup("DELCONSUMER", K_STREAM_MATCH_V3, GROUP, reader);
  }
});
