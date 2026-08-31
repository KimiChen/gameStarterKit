/**
 * M8a · 对局结算证据链（10·M8a / 02·P7）：生产（XADD）+ 消费（XREADGROUP → MySQL 落库 → XACK → XTRIM）。
 *
 * 职责：
 *  - `emitMatchEvidence`：对局房（GameRoom）收局时把整局证据（名次 + verifier 重放全部输入，09·K5）
 *    exact validate + replay 后 XADD 进 v3 流。**一局一条**（同局全部玩家在同一 payload），
 *    XADD 失败只告警、⛔ 不阻塞收局。legacy/v2 自本版起只排空、不再接收生产消息。
 *  - `consumeOnce` / `startMatchConsumer`：consumer group `settle` 把证据落 MySQL——
 *    同一连接读取 legacy + v2 + v3（三个 key 同 Redis slot）；v2 强制 `schemaVersion=2`，
 *    legacy 缺 sId 时规范化为 0 后再存，保证 DB JSON 也符合当前 MatchEvidence；
 *    先过 `match_index` 幂等闸（非分区单列 PK，09·DB4/05·Δ2；ODKU 插入=1/重复=0，
 *    09·DB1 ⛔ INSERT IGNORE），重复 matchId 跳过 `match_results` 但仍 XACK；
 *    三条流分别按「已 ACK 且已落库」安全位点 XTRIM MINID（09·K6 ⛔ MAXLEN）。
 *
 * 进程归属（评审收口）：独立 **settle worker**（`npm --workspace @game/server run settle`，
 * 本文件自带进程入口；consumer group 天然支持多实例分工，无需 singleton_lease）。
 * 网关侧只挂**流深度告警**（startStreamDepthAlert——没人消费时流无界增长必须被看见）。
 * 多消费组安全位点（verifier 组接入后）仍归 M10。
 */
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import type { Redis } from "ioredis";

import {
  K_STREAM_MATCH,
  K_STREAM_MATCH_QUARANTINE,
  K_STREAM_MATCH_V2,
  K_STREAM_MATCH_V3,
} from "../infra/keys";
import { withRcTx, type ResultSetHeader } from "../infra/mysql";
import { clientForKey } from "../infra/redisRoute";
import { assertAdmissionOpen, defaultLifecycle } from "../infra/lifecycle";
import { storedInt } from "../infra/numbers";
import { defineScript, evalshaWithReload } from "../infra/redisScripts";
import {
  MATCH_EVIDENCE_SCHEMA_VERSION,
  MatchEvidenceValidationError,
  validateMatchEvidenceV3,
  type MatchEvidenceV3,
} from "./matchEvidence";
import { MatchReplayError, replayMatchEvidenceV3 } from "./matchReplay";

// ── 常量（已登记 docs/SERVER.md §13，⛔ 禁止散落——09 审查流程第 6 条） ──

/** `match_results.mode`（TINYINT，05）：0=休闲局，1=排位局。 */
export const MATCH_MODE_CASUAL = 0;
export const MATCH_MODE_RANKED = 1;
export const MATCH_STREAM_V3_SCHEMA_VERSION = MATCH_EVIDENCE_SCHEMA_VERSION;
export const MATCH_STREAM_V2_SCHEMA_VERSION = 2;
/** Parse budget derived from 16,384 maximally escaped exact-shape events plus state/roster headroom. */
export const MATCH_V3_MAX_PAYLOAD_BYTES = 24 * 1024 * 1024;

/** 三条 match stream 各自使用同名 group `settle` 消费落 `match_results`。 */
const GROUP = "settle";
/** 消费循环空转时 XREADGROUP BLOCK 时长。 */
const CONSUME_BLOCK_MS = 5000;
/** 裁剪节流周期（消费循环内）。 */
const TRIM_INTERVAL_MS = 60_000;

/**
 * consumer 名必须精确到进程。同一主机允许启动多个 settle worker；若只用 hostname，它们会共享
 * PEL owner，并可能同时用起点 "0" 读取同一条目。崩溃进程的 PID 残留由 XAUTOCLAIM 接管。
 */
export const MATCH_STREAM_CONSUMER = `c_${hostname()}_${process.pid}`;

/** 跨消费者 PEL 接管的空闲阈值：条目在别的（死）消费者手里挂 ≥ 此值即认领。 */
const CLAIM_MIN_IDLE_MS = 60_000;

// ── 证据类型（payload JSON 的形状；09·K5 输入完整性） ──

/** 一名参与者的结算证据。userId=null 为游客（同局有绑定账号者时游客也入证据，名次才完整）。 */
export interface EvidenceParticipant {
  sessionId: string;
  userId: string | null;
  name: string;
  place: number;
  round: number;
  elapsedMs: number;
  survived: boolean;
}

/**
 * 服务端下发垃圾波的注入记录（09·K5：verifier 重放输入之一，含 nonce 序列）。
 * `atMs` 是相对开局的服务器毫秒（服务端没有客户端 tick，verifier 重放时按此换算/宽容匹配）。
 */
export interface EvidenceInjectWave {
  nonce: number;
  count: number;
  targetSessionId: string;
  atMs: number;
}

/**
 * 一局一条的完整证据（09·K5：InjectWave 序列 / loadout / mapIndex / seed 全部入链，
 * 否则 verifier 重放轨迹与真实对局不一致 → 误报/漏报，02·P7）。
 */
export interface MatchEvidence {
  matchId: string;
  /**
   * 本局所属**区**（房级常量：filterBy 隔离撮合 + onJoin 鉴权区复核，见 GameRoom）。0 = 大混服。
   * ⚠ 证据 XADD 之后房间即 dispose ⇒ 这是**唯一**能把区带出对局的地方，⛔ 丢了就永久查不回。
   * 发奖（U6）按区记账：`deriveOpId(uid, sId, …)` 把它编进幂等键，拿错区 = 钱记错区且重发也修不回。
   */
  sId: number;
  mode: number; // MATCH_MODE_*
  seed: number;
  mapIndex: number;
  // ranked 下发的固定装备/卡组配置；休闲 BYO = null。本作定义装备协议后收紧类型（Arthur 用 LoadoutSpec）
  loadout: unknown;
  injectWaves: EvidenceInjectWave[];
  participants: EvidenceParticipant[]; // 已按名次排序（place 1 在前）
}

const MATCH_EVIDENCE_KEYS = [
  "matchId", "sId", "mode", "seed", "mapIndex", "loadout", "injectWaves", "participants",
] as const;
const EVIDENCE_PARTICIPANT_KEYS = [
  "sessionId", "userId", "name", "place", "round", "elapsedMs", "survived",
] as const;
const EVIDENCE_INJECT_WAVE_KEYS = ["nonce", "count", "targetSessionId", "atMs"] as const;
const MAX_EVIDENCE_PARTICIPANTS = 256;
const MAX_EVIDENCE_INJECT_WAVES = 16_384;

function exactJsonKeys(value: JsonObject, expected: readonly string[]): boolean {
  const keys = Object.getOwnPropertyNames(value);
  return Object.getOwnPropertySymbols(value).length === 0
    && keys.length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function evidenceInt(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && value >= min
    && value <= max;
}

function evidenceString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

interface JsonValidationState {
  remaining: number;
  readonly seen: Set<object>;
}

/**
 * Keep opaque loadout data JSON-stable until its ranked business schema exists.
 *
 * ⚠ defense-in-depth：唯一调用点（`isMatchEvidenceV2Payload` 的 `payload.loadout`）只处理
 * `JSON.parse` 产物，而 `JSON.parse` 只会生成 enumerable 数据属性，因此下面数组/对象两个分支里
 * 的 accessor descriptor 拒绝（`!descriptor?.enumerable` / `!("value" in descriptor)`）当前**不可达**，
 * 没有能失败的用例。⛔ 仍然保留、且⛔ 不得改写成 `value[index]` 直取：descriptor 读法是本校验器
 * 「不触发 getter」的唯一保证，一旦接入非 JSON.parse 的调用方（对局内构造的 loadout、外部 SDK 对象），
 * 直取写法会在审计校验中执行任意用户代码。两个分支同源同理，删只删一半只会造成不一致。
 */
function isCanonicalJsonValue(
  value: unknown,
  depth = 0,
  state: JsonValidationState = { remaining: 4096, seen: new Set<object>() },
): boolean {
  if (--state.remaining < 0 || depth > 16) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value !== "object" || state.seen.has(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null && proto !== Array.prototype) return false;
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 4096 || Object.getOwnPropertySymbols(value).length > 0) return false;
      const names = Object.getOwnPropertyNames(value);
      if (names.length !== value.length + 1 || names[names.length - 1] !== "length") return false;
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (names[index] !== String(index)
            || !descriptor?.enumerable
            || !("value" in descriptor)
            || !isCanonicalJsonValue(descriptor.value, depth + 1, state)) return false;
      }
      return true;
    }
    const names = Object.getOwnPropertyNames(value);
    if (names.length > 256 || Object.getOwnPropertySymbols(value).length > 0) return false;
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (!descriptor?.enumerable || !("value" in descriptor)
          || !isCanonicalJsonValue(descriptor.value, depth + 1, state)) return false;
    }
    return true;
  } finally {
    state.seen.delete(value);
  }
}

/** v2 payload is an audit record, so every field with a declared domain is exact and runtime checked. */
function isMatchEvidenceV2Payload(payload: JsonObject): payload is JsonObject & MatchEvidence {
  if (!exactJsonKeys(payload, MATCH_EVIDENCE_KEYS)
      || !evidenceString(payload.matchId, 1, 40)
      || !evidenceInt(payload.sId, 0, 65_535)
      || (payload.mode !== MATCH_MODE_CASUAL && payload.mode !== MATCH_MODE_RANKED)
      || !evidenceInt(payload.seed, 0, 0xffff_ffff)
      || !evidenceInt(payload.mapIndex, 0, 65_535)
      || (payload.mode === MATCH_MODE_CASUAL
        ? payload.loadout !== null
        : !isCanonicalJsonValue(payload.loadout))
      || !Array.isArray(payload.injectWaves)
      || payload.injectWaves.length > MAX_EVIDENCE_INJECT_WAVES
      || !Array.isArray(payload.participants)
      || payload.participants.length < 1
      || payload.participants.length > MAX_EVIDENCE_PARTICIPANTS) {
    return false;
  }

  const participantIds = new Set<string>();
  for (let index = 0; index < payload.participants.length; index++) {
    const value: unknown = payload.participants[index];
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const participant = value as JsonObject;
    if (!exactJsonKeys(participant, EVIDENCE_PARTICIPANT_KEYS)
        || !evidenceString(participant.sessionId, 1, 64)
        || !(participant.userId === null || evidenceString(participant.userId, 1, 128))
        || !evidenceString(participant.name, 0, 128)
        || participant.place !== index + 1
        || !evidenceInt(participant.round, 0)
        || !evidenceInt(participant.elapsedMs, 0)
        || typeof participant.survived !== "boolean"
        || participantIds.has(participant.sessionId)) {
      return false;
    }
    participantIds.add(participant.sessionId);
  }

  const nonces = new Set<number>();
  for (const value of payload.injectWaves) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const wave = value as JsonObject;
    if (!exactJsonKeys(wave, EVIDENCE_INJECT_WAVE_KEYS)
        || !evidenceInt(wave.nonce, 0)
        || !evidenceInt(wave.count, 1)
        || !evidenceString(wave.targetSessionId, 1, 64)
        || !participantIds.has(wave.targetSessionId)
        || !evidenceInt(wave.atMs, 0)
        || nonces.has(wave.nonce)) {
      return false;
    }
    nonces.add(wave.nonce);
  }
  return true;
}

// ── matchId ──

/**
 * 生成 matchId：`m_` + 毫秒时间戳 36 进制 + 8 字节随机 hex ≈ 26 字符，
 * 纯 ascii ≤ VARCHAR(40)（05 `match_index.match_id`）。09·K4：startMatch 生成一次写进
 * state，结算/证据链/去重复用同一 id——⛔ 重跑不得生成新 id（否则战绩重复计数）。
 */
export function newMatchId(): string {
  return `m_${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
}

// ── 生产侧 ──

/**
 * producer 侧自检失败（validate / replay / 超预算）与外部 XADD 故障是**两类事故**：
 * 前者是 GameRoom 内部一致性缺陷，后者是 Redis 可用性问题。此前它们共用一个 catch、
 * 一律返回 null，调用方与运维都无法区分。
 *
 * 方向：自检失败应当 **fail-closed**——消费侧对**同一组**校验走的就是 fail-closed
 * （写 quarantine 保全原始 payload 再 ACK 并由深度探针告警）；生产侧对自己造的数据反而
 * fail-open 直接丢弃，是两侧姿态不一致。但 fail-closed **不等于阻塞收局**（对局结果已广播），
 * 正确落点是「必须留下不可忽略的持久痕迹」——即把自检失败也写进同一个 quarantine 流，
 * 让已有的 `runMatchStreamDepthCheck` 告警看得见，不新增任何 observability 基建。
 */
export type EmitEvidenceResult =
  | { readonly ok: true; readonly entryId: string }
  | { readonly ok: false; readonly kind: "self-check"; readonly reason: string }
  | { readonly ok: false; readonly kind: "transport"; readonly reason: string };

/** 自检失败的证据没有来源条目，只 XADD quarantine、不 XACK（来源 PEL 里本就没有它）。 */
async function quarantineProducerSelfCheck(
  matchId: string,
  reason: string,
  payload: string,
): Promise<boolean> {
  try {
    await clientForKey(K_STREAM_MATCH_QUARANTINE).xadd(
      K_STREAM_MATCH_QUARANTINE, "*",
      "sourceStream", "",
      "sourceKind", "producer",
      "sourceId", "",
      "reason", reason,
      "matchId", matchId,
      "rawFields", payload,
      "at", String(Date.now()),
    );
    return true;
  } catch (e) {
    console.error(`[matchConsumer] producer 自检失败的 quarantine 落盘也失败 matchId=${matchId}:`, e);
    return false;
  }
}

/** 未经校验的尽力取值：只在 quarantine 的索引字段上使用，⛔ 不得用于任何判定。 */
function bestEffortMatchId(input: unknown): string {
  const value = (input as { matchId?: unknown } | null | undefined)?.matchId;
  return typeof value === "string" && value.length > 0 && value.length <= 40 ? value : "?";
}

/**
 * 收局时 XADD 一条证据。⛔ 无论哪类失败都**不阻塞对局结束**（对局结果已广播/已写档）。
 * 错误码与消费侧 `decodeFailure` **复用同一套码空间**，运维只需要一套码表。
 */
export async function emitMatchEvidence(input: MatchEvidenceV3): Promise<EmitEvidenceResult> {
  // ⚠ 尽力先取一次 matchId：validate 失败时 quarantine 条目仍必须带上身份，否则运维拿到的是一条
  // matchId="?" 的痕迹，只能靠翻 rawFields 才知道是哪一局——而 quarantine 的全部意义就是可追查。
  // ⛔ 这里不做任何校验，取到什么算什么；真正的形状判定仍由下面的 validate 负责。
  let matchId = bestEffortMatchId(input);
  let payload = "";
  // ── 自检段：失败属 GameRoom 内部一致性缺陷 ──
  try {
    const ev = validateMatchEvidenceV3(input);
    matchId = ev.matchId;
    replayMatchEvidenceV3(ev);
    payload = JSON.stringify(ev);
    if (Buffer.byteLength(payload, "utf8") > MATCH_V3_MAX_PAYLOAD_BYTES) {
      throw new MatchEvidenceValidationError("PAYLOAD_SIZE", "evidence");
    }
  } catch (e) {
    const reason = e instanceof MatchEvidenceValidationError
      ? `V3_PAYLOAD_${e.code}`
      : "V3_REPLAY_MISMATCH";
    console.error(
      `[matchConsumer] ⚠⚠ producer 自检失败 matchId=${matchId} reason=${reason}`
      + `——属 GameRoom 内部一致性缺陷，⛔ 不是 Redis 故障:`, e,
    );
    const persisted = await quarantineProducerSelfCheck(matchId, reason, safeRawPayload(input));
    // quarantine 也写不进去时降级为 transport：此时无法留下持久痕迹，性质变成外部不可用。
    return persisted
      ? { ok: false, kind: "self-check", reason }
      : { ok: false, kind: "transport", reason: "V3_QUARANTINE_UNAVAILABLE" };
  }
  // ── 传输段：失败属 Redis 可用性问题 ──
  try {
    const entryId = await clientForKey(K_STREAM_MATCH_V3).xadd(
      K_STREAM_MATCH_V3, "*",
      "schemaVersion", String(MATCH_STREAM_V3_SCHEMA_VERSION),
      "matchId", matchId,
      "mode", String(input.mode),
      "sId", String(input.sId),
      "payload", payload,
    );
    return { ok: true, entryId: String(entryId) };
  } catch (e) {
    console.error(`[matchConsumer] v3 证据链 XADD 失败（matchId=${matchId}），收局不受阻、证据待对账:`, e);
    return { ok: false, kind: "transport", reason: "V3_XADD_FAILED" };
  }
}

/** 自检失败时原始输入未必可序列化，保全尽可能多的信息而不再抛。 */
function safeRawPayload(input: MatchEvidenceV3): string {
  try { return JSON.stringify(input); } catch { return "<unserializable>"; }
}

// ── 消费侧 ──

type StreamEntry = [id: string, fields: string[]];
type XReadGroupReply = [key: string, entries: StreamEntry[]][] | null;

type MatchStreamKind = "legacy" | "v2" | "v3";
interface MatchStreamState {
  readonly key: string;
  readonly kind: MatchStreamKind;
  readonly label: string;
  groupEnsured: boolean;
  /** XAUTOCLAIM 下一页游标；到 "0-0" 后下轮从头开启新一轮扫描。 */
  claimCursor: string;
  /** 三条流独立节流，避免一条流的 trim 时间戳压住其它流。 */
  lastTrimMs: number;
}

const LEGACY_STREAM: MatchStreamState = {
  key: K_STREAM_MATCH,
  kind: "legacy",
  label: "stream:match(legacy)",
  groupEnsured: false,
  claimCursor: "0-0",
  lastTrimMs: 0,
};
const V2_STREAM: MatchStreamState = {
  key: K_STREAM_MATCH_V2,
  kind: "v2",
  label: "stream:match:v2",
  groupEnsured: false,
  claimCursor: "0-0",
  lastTrimMs: 0,
};
const V3_STREAM: MatchStreamState = {
  key: K_STREAM_MATCH_V3,
  kind: "v3",
  label: "stream:match:v3",
  groupEnsured: false,
  claimCursor: "0-0",
  lastTrimMs: 0,
};
const MATCH_STREAMS: readonly MatchStreamState[] = [LEGACY_STREAM, V2_STREAM, V3_STREAM];
const MATCH_STREAM_BY_KEY = new Map(MATCH_STREAMS.map((s) => [s.key, s]));

/** 单流 group 不存在则建（幂等）。起点 "0"：组建立前的历史证据也必须落库。 */
async function ensureGroup(client: Redis, stream: MatchStreamState): Promise<void> {
  if (stream.groupEnsured) { return; }
  try {
    await client.xgroup("CREATE", stream.key, GROUP, "0", "MKSTREAM");
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("BUSYGROUP")) { throw e; }
  }
  stream.groupEnsured = true;
}

async function ensureGroups(client: Redis): Promise<void> {
  for (const stream of MATCH_STREAMS) { await ensureGroup(client, stream); }
}

/** [k1,v1,k2,v2,…] → 对象。 */
function fieldMap(fields: string[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) { m[fields[i]] = fields[i + 1]; }
  return m;
}

type JsonObject = Record<string, unknown>;
interface NormalizedEntry {
  matchId: string;
  mode: number;
  sId: number;
  /**
   * 落 `match_results.schema_version` 的 payload 形状版本。⚠ 它标的是 **payload 长什么样**，
   * 不是来源流：`0` 意味着「顶层列与 payload 都不保证互相一致，也没有 shape 校验」，读取方
   * 必须先看这一列再决定拿哪套 verifier。⛔ 不要用来源流名字反推——quarantine 修复流程允许把
   * 条目 XADD 回任意来源流。
   */
  schemaVersion: MatchPayloadSchemaVersion;
  /** 已按当前 MatchEvidence 规范化后的 JSON（legacy 至少补齐 number sId）。 */
  payload: string;
}

/** `match_results.schema_version` 的取值域；与 sql/schema.sql 的列注释同义。 */
export type MatchPayloadSchemaVersion = 0 | 2 | 3;

type EntryDecodeResult =
  | { readonly ok: true; readonly entry: NormalizedEntry }
  | { readonly ok: false; readonly reason: string };

const decodeFailure = (reason: string): EntryDecodeResult => ({ ok: false, reason });

/** Redis 顶层无符号十进制：拒绝空白、指数、负零等非 canonical 形态。 */
function parseUInt(raw: string | undefined, max: number): number | null {
  if (raw === undefined || !/^(?:0|[1-9]\d*)$/.test(raw)) { return null; }
  const n = Number(raw);
  return Number.isSafeInteger(n) && n <= max ? n : null;
}

function parsePayload(raw: string | undefined): JsonObject | null {
  if (!raw) { return null; }
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as JsonObject
      : null;
  } catch {
    return null;
  }
}

function payloadSId(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535
    ? value
    : null;
}

/**
 * 按来源流解码：
 * - v2：schemaVersion 必须精确为 "2"，顶层与 payload 的 matchId/mode/sId 必须一致；
 * - legacy：无顶层 sId 的真旧消息从 payload 取合法值，否则缺失回退 0；f91 顶层 sId 为权威并回填 payload。
 */
function normalizeEntry(stream: MatchStreamState, fields: string[]): EntryDecodeResult {
  if (fields.length % 2 !== 0) { return decodeFailure("FIELD_PAIRS"); }
  if (stream.kind === "v2" || stream.kind === "v3") {
    const allowed = new Set(["schemaVersion", "matchId", "mode", "sId", "payload"]);
    const seen = new Set<string>();
    const fieldReason = stream.kind === "v2" ? "V2_FIELD_SET" : "V3_FIELD_SET";
    if (fields.length !== allowed.size * 2) { return decodeFailure(fieldReason); }
    for (let i = 0; i < fields.length; i += 2) {
      const name = fields[i];
      if (!allowed.has(name) || seen.has(name)) { return decodeFailure(fieldReason); }
      seen.add(name);
    }
  }
  const f = fieldMap(fields);
  const matchId = f.matchId ?? "";
  const mode = parseUInt(f.mode, 255);
  if (stream.kind === "v3"
      && (f.payload === undefined || Buffer.byteLength(f.payload, "utf8") > MATCH_V3_MAX_PAYLOAD_BYTES)) {
    return decodeFailure("V3_PAYLOAD_SIZE");
  }
  const payload = parsePayload(f.payload);
  if (!matchId || matchId.length > 40) { return decodeFailure("MATCH_ID"); }
  if (mode === null) { return decodeFailure("MODE"); }
  if (!payload) { return decodeFailure("PAYLOAD_JSON"); }

  if (stream.kind === "v2") {
    const sId = parseUInt(f.sId, 65535);
    if (f.schemaVersion !== String(MATCH_STREAM_V2_SCHEMA_VERSION)) {
      return decodeFailure("V2_SCHEMA_VERSION");
    }
    if (sId === null) { return decodeFailure("V2_SERVER_ID"); }
    if (payload.matchId !== matchId || payload.mode !== mode || payload.sId !== sId) {
      return decodeFailure("V2_PAYLOAD_BINDING");
    }
    if (!isMatchEvidenceV2Payload(payload)) { return decodeFailure("V2_PAYLOAD_SHAPE"); }
    return { ok: true, entry: { matchId, mode, sId, schemaVersion: 2, payload: JSON.stringify(payload) } };
  }

  if (stream.kind === "v3") {
    const sId = parseUInt(f.sId, 65535);
    if (f.schemaVersion !== String(MATCH_STREAM_V3_SCHEMA_VERSION)) {
      return decodeFailure("V3_SCHEMA_VERSION");
    }
    if (sId === null) { return decodeFailure("V3_SERVER_ID"); }
    let evidence: MatchEvidenceV3;
    try {
      evidence = validateMatchEvidenceV3(payload);
    } catch (error) {
      const code = error instanceof MatchEvidenceValidationError ? error.code : "MALFORMED";
      return decodeFailure(`V3_PAYLOAD_${code}`);
    }
    if (evidence.matchId !== matchId || evidence.mode !== mode || evidence.sId !== sId) {
      return decodeFailure("V3_PAYLOAD_BINDING");
    }
    const canonicalPayload = JSON.stringify(evidence);
    if (f.payload !== canonicalPayload) {
      return decodeFailure("V3_PAYLOAD_CANONICAL");
    }
    try {
      replayMatchEvidenceV3(evidence);
    } catch (error) {
      const code = error instanceof MatchReplayError ? error.code : "MALFORMED";
      return decodeFailure(`V3_REPLAY_${code}`);
    }
    return { ok: true, entry: { matchId, mode, sId, schemaVersion: 3, payload: canonicalPayload } };
  }

  // f91 legacy 同时有顶层 + payload sId：顶层是落库契约，必须保留；真实 c8 两处都没有则补 0。
  const topLevelSId = f.sId === undefined ? null : parseUInt(f.sId, 65535);
  if (f.sId !== undefined && topLevelSId === null) { return decodeFailure("LEGACY_SERVER_ID"); }
  const embeddedSId = payload.sId === undefined ? null : payloadSId(payload.sId);
  if (payload.sId !== undefined && embeddedSId === null) {
    return decodeFailure("LEGACY_PAYLOAD_SERVER_ID");
  }
  if (topLevelSId !== null && embeddedSId !== null && topLevelSId !== embeddedSId) {
    return decodeFailure("LEGACY_SERVER_ID_MISMATCH");
  }
  // v2（V2_PAYLOAD_BINDING）与 v3（V3_PAYLOAD_BINDING）都挡住了「顶层列与 payload 各说各话」，
  // 只有 legacy 没挡——实测可以落出 match_id 列与 payload.matchId 完全不同的行，导致连顶层两列
  // 都不能当可信索引。这里只在 payload **确实带了**对应字段时要求一致：真正的 c8 旧消息两者
  // 都不带，⛔ 不能改成无条件要求存在，那会把合法历史消息全部隔离。
  if (payload.matchId !== undefined && payload.matchId !== matchId) {
    return decodeFailure("LEGACY_MATCH_ID_MISMATCH");
  }
  if (payload.mode !== undefined && payload.mode !== mode) {
    return decodeFailure("LEGACY_MODE_MISMATCH");
  }
  const sId = topLevelSId ?? embeddedSId ?? 0;
  payload.sId = sId;
  return { ok: true, entry: { matchId, mode, sId, schemaVersion: 0, payload: JSON.stringify(payload) } };
}

/**
 * XADD quarantine 必须先于 XACK。Lua 保证两条命令之间没有别的客户端插入；更关键的是，若 XADD
 * 因 WRONGTYPE/OOM 等失败，脚本会在执行 XACK 前终止，原条目仍留在 PEL。quarantine 保留精确的
 * fields 数组，修复工具无需信任已经失败的顶层字段。
 */
export const QUARANTINE_MATCH_ENTRY = defineScript("quarantineMatchEntry", `
local quarantineId = redis.call(
  "XADD", KEYS[2], "*",
  "sourceStream", KEYS[1],
  "sourceId", ARGV[2],
  "sourceGroup", ARGV[1],
  "sourceKind", ARGV[3],
  "sourceIdentity", KEYS[1] .. "\\n" .. ARGV[1] .. "\\n" .. ARGV[2],
  "reason", ARGV[4],
  "rawFields", ARGV[5],
  "quarantinedAtMs", ARGV[6]
)
local acked = redis.call("XACK", KEYS[1], ARGV[1], ARGV[2])
return {quarantineId, acked}
`);

export async function quarantineMalformedMatchEntry(
  client: Redis,
  sourceStream: string,
  sourceKind: MatchStreamKind,
  id: string,
  fields: string[],
  reason: string,
  quarantineKey = K_STREAM_MATCH_QUARANTINE,
): Promise<string> {
  const result = await evalshaWithReload(
    client,
    QUARANTINE_MATCH_ENTRY,
    [sourceStream, quarantineKey],
    [GROUP, id, sourceKind, reason, JSON.stringify(fields), String(Date.now())],
  );
  if (!Array.isArray(result) || result.length !== 2
      || typeof result[0] !== "string" || !/^\d+-\d+$/.test(result[0])
      || (result[1] !== 0 && result[1] !== 1)) {
    throw new Error(`[matchConsumer] quarantine 返回非法 id=${String(result)}`);
  }
  if (result[1] === 0) {
    console.error(
      `[matchConsumer] quarantine 已持久化但来源 PEL 已被其它 owner ACK：`
      + `source=${sourceStream} id=${id} quarantineId=${result[0]}`,
    );
  }
  return result[0];
}

/**
 * 落一条证据：`match_index` 幂等闸 →（首见才）`match_results` → XACK。
 * - 幂等闸（09·DB4/05·Δ2）：`match_results` 是分区表、PK 被迫含 created_at，单列唯一性
 *   靠非分区 `match_index` 补回。ODKU 写法（09·DB1：⛔ INSERT IGNORE 静默吞截断/NOT NULL）；
 *   池已 `-FOUND_ROWS`，affectedRows 插入=1/重复=0 可信（09·DB2）。
 * - 重复 matchId（重复投递/重复消费）：跳过 results 但**仍 XACK**——重复条目已无信息量。
 * - 结构损坏条目：先原子写入 quarantine（完整原始 fields），成功后才 ACK；人工修复重投。
 * - DB 故障：**不 ACK** 直接抛——条目留在 PEL，下次 consumeOnce 的 "0" 起点重放，幂等闸兜底。
 */
async function settleEntry(
  client: Redis, stream: MatchStreamState, id: string, fields: string[],
): Promise<void> {
  const decoded = normalizeEntry(stream, fields);
  if (!decoded.ok) {
    const matchId = fieldMap(fields).matchId || "?";
    const quarantineId = await quarantineMalformedMatchEntry(
      client, stream.key, stream.kind, id, fields, decoded.reason,
    );
    console.error(
      `[matchConsumer] ${stream.label} 证据条目结构/版本损坏，已隔离：`
      + `id=${id} matchId=${matchId} reason=${decoded.reason} quarantineId=${quarantineId}`,
    );
    return;
  }
  const { matchId, mode, sId, schemaVersion, payload } = decoded.entry;
  await withRcTx(async (conn) => {
    const [r] = await conn.execute<ResultSetHeader>(
      "INSERT INTO match_index (match_id, created_at) VALUES (?, NOW(3)) ON DUPLICATE KEY UPDATE match_id = match_id",
      [matchId],
    );
    if (r.affectedRows === 1) {
      // 分区表（RANGE COLUMNS(created_at)，05）；重复已被闸住，此处必然首插
      await conn.execute(
        "INSERT INTO match_results (match_id, created_at, server_id, mode, schema_version, payload)"
        + " VALUES (?, NOW(3), ?, ?, ?, ?)",
        [matchId, sId, mode, schemaVersion, payload],
      );
    }
  });
  // 落库（或判重）成功才 ACK；XACK 前崩溃 → PEL 残留 → 重放，幂等闸挡重复
  await client.xack(stream.key, GROUP, id);
}

export interface ConsumeOptions {
  /** 每条流、每个阶段最多取多少条。缺省 64。 */
  count?: number;
  /** 新条目等待时长（三流共用一次 ">" XREADGROUP）。⚠ BLOCK 占住整条连接，必须配独占 client。 */
  blockMs?: number;
  /** 缺省 v3/v2/legacy 同槽 client（测试直调够用）；消费循环传 duplicate 独占连接。 */
  client?: Redis;
}

/**
 * 消费一轮（可单测）：对 legacy/v2/v3 **逐流**重放本 consumer 的 PEL 残留（上次落库失败/崩溃未 ACK；
 * XREADGROUP 指定起点 id 只回 PEL、不阻塞），再逐流 XAUTOCLAIM 接管**别的死消费者**
 * 挂 ≥ CLAIM_MIN_IDLE_MS 的 PEL，最后用一次同槽 XREADGROUP 读取三流的新条目（">"）。
 * @returns 本轮处理条数（含判重跳过与损坏隔离）。
 */
export async function consumeOnce(opts: ConsumeOptions = {}): Promise<number> {
  const client = opts.client ?? clientForKey(K_STREAM_MATCH_V3);
  const count = opts.count ?? 64;
  await ensureGroups(client);
  let n = 0;
  try {
    for (const stream of MATCH_STREAMS) {
      n += await readBatch(client, stream, "0", count);
      n += await claimStale(client, stream, count);
    }
    n += await readNewBatches(client, count, opts.blockMs);
  } catch (e) {
    // NOGROUP 不一定携带具体 key；保守重置三流，下轮分别 MKSTREAM 自愈。
    if (e instanceof Error && e.message.includes("NOGROUP")) {
      for (const stream of MATCH_STREAMS) {
        stream.groupEnsured = false;
        stream.claimCursor = "0-0";
      }
    }
    throw e;
  }
  return n;
}

/** XAUTOCLAIM 接管死消费者的 PEL（幂等闸保证重复处理无害）。认领即成为 owner，随后走同一落库+ACK 路径。 */
async function claimStale(client: Redis, stream: MatchStreamState, count: number): Promise<number> {
  const res = (await client.call(
    "XAUTOCLAIM", stream.key, GROUP, MATCH_STREAM_CONSUMER, String(CLAIM_MIN_IDLE_MS), stream.claimCursor,
    "COUNT", String(count),
  )) as [string, [string, string[] | null][]];
  const nextCursor = String(res?.[0] ?? "");
  if (!/^\d+-\d+$/.test(nextCursor)) {
    throw new Error(`[matchConsumer] ${stream.label} XAUTOCLAIM 返回非法 cursor=${nextCursor || "?"}`);
  }
  stream.claimCursor = nextCursor;
  const entries = res?.[1] ?? [];
  let n = 0;
  for (const [id, fields] of entries) {
    // fields=null：条目已被 XTRIM 裁掉只剩 PEL 影子——ACK 清影子即可
    if (!fields) { await client.xack(stream.key, GROUP, id); continue; }
    await settleEntry(client, stream, id, fields);
    n++;
  }
  return n;
}

async function readBatch(
  client: Redis, stream: MatchStreamState, startId: string, count: number,
): Promise<number> {
  const args: (string | number)[] = ["GROUP", GROUP, MATCH_STREAM_CONSUMER, "COUNT", count];
  args.push("STREAMS", stream.key, startId);
  const res = (await client.call("XREADGROUP", ...args.map(String))) as XReadGroupReply;
  const entries = res?.[0]?.[1] ?? [];
  for (const [id, fields] of entries) { await settleEntry(client, stream, id, fields); }
  return entries.length;
}

/** 三个 key 的 hash 输入相同，故可在一次 BLOCK XREADGROUP 中等待任一流，避免顺序阻塞饿死新流。 */
async function readNewBatches(client: Redis, count: number, blockMs?: number): Promise<number> {
  const args: (string | number)[] = ["GROUP", GROUP, MATCH_STREAM_CONSUMER, "COUNT", count];
  if (blockMs !== undefined) { args.push("BLOCK", blockMs); }
  args.push(
    "STREAMS",
    ...MATCH_STREAMS.map((stream) => stream.key),
    ...MATCH_STREAMS.map(() => ">"),
  );
  const res = (await client.call("XREADGROUP", ...args.map(String))) as XReadGroupReply;
  let n = 0;
  for (const [key, entries] of res ?? []) {
    const stream = MATCH_STREAM_BY_KEY.get(key);
    if (!stream) { throw new Error(`[matchConsumer] XREADGROUP 返回未知 stream key=${key}`); }
    for (const [id, fields] of entries) {
      await settleEntry(client, stream, id, fields);
      n++;
    }
  }
  return n;
}

interface GroupProgress {
  pending: number;
  /** Redis 7 可返回 null（无法计算）或省略；仅用于深度告警，不参与 trim 安全性。 */
  lag: number | null;
  lastDeliveredId: string;
}

/** 逐流读取 settle group 状态；无组返回 null。 */
async function readGroupProgress(client: Redis, stream: MatchStreamState): Promise<GroupProgress | null> {
  const raw = await client.call("XINFO", "GROUPS", stream.key) as unknown;
  if (!Array.isArray(raw)) { return null; }
  for (const item of raw) {
    if (!Array.isArray(item)) { continue; }
    const row = item as unknown[];
    const get = (name: string): unknown => {
      for (let i = 0; i + 1 < row.length; i += 2) {
        if (String(row[i]) === name) { return row[i + 1]; }
      }
      return undefined;
    };
    if (String(get("name") ?? "") !== GROUP) { continue; }
    const pending = (() => {
      try { return storedInt(get("pending"), "match XINFO pending", { min: 0 }); }
      catch { throw new Error(`[matchConsumer] ${stream.label} XINFO GROUPS pending 非法`); }
    })();
    const lastDeliveredId = String(get("last-delivered-id") ?? "");
    const rawLag = get("lag");
    const lag = rawLag === null || rawLag === undefined ? null : (() => {
      try { return storedInt(rawLag, "match XINFO lag", { min: 0 }); }
      catch { throw new Error(`[matchConsumer] ${stream.label} XINFO GROUPS lag 非法`); }
    })();
    if (!/^\d+-\d+$/.test(lastDeliveredId)) {
      throw new Error(`[matchConsumer] ${stream.label} XINFO GROUPS 返回非法 settle 状态`);
    }
    return { pending, lag, lastDeliveredId };
  }
  return null;
}

/**
 * 按「已 ACK 且已落库」安全位点裁剪（09·K6/02·P3：⛔ MAXLEN 按长度无条件删最老条目、
 * 完全不看 PEL/ACK，worker 积压时正好删掉未落库数据）。裁剪 owner = 证据链消费者（07）。
 *
 * 安全论证：逐流读取 `XINFO GROUPS` 的 `settle.last-delivered-id`，且仅在该流 group PEL=0 时裁剪。
 * 此时组内**已投递**的条目全部已 ACK（经幂等闸落库或已判损坏）；**尚未投递**的条目 id 必然
 * > last-delivered——故裁掉 < last-delivered 的条目碰不到任何未落库数据。安全位点来自 Redis，
 * 不依赖进程内缓存：worker 重启后，即使 legacy 已没有新消息，也仍能继续收敛旧流。
 * PEL 非空（本组任一消费者还挂着未 ACK 条目）则整轮跳过——宁可流长一点也不冒险（保守；
 * pending 深度告警归 M10）。`~` 近似裁剪只按 rax 节点整块删，只会少裁不会多裁。
 *
 * ⚠ 前提：`settle` 是本流唯一消费组（当前如此）；未来 verifier 组接入后安全位点须取各组
 * 位点的 min（M10 收口）。「7 天前 MINID 兜底」刻意**不做**：证据链是审计数据，积压 7 天
 * 属运维事故，宁可告警人工介入，也不做任何可能删掉未落库条目的无条件裁剪。
 * @returns 兼容旧 API：本轮最后一个成功裁剪的 MINID；三流都不满足安全条件则 null。
 */
export async function trimToSafePoint(client?: Redis): Promise<string | null> {
  const c = client ?? clientForKey(K_STREAM_MATCH_V3);
  let lastTrimmed: string | null = null;
  for (const stream of MATCH_STREAMS) {
    const minId = await trimStreamToSafePoint(c, stream);
    if (minId) { lastTrimmed = minId; }
  }
  return lastTrimmed;
}

async function trimStreamToSafePoint(client: Redis, stream: MatchStreamState): Promise<string | null> {
  const progress = await readGroupProgress(client, stream);
  if (!progress || progress.pending !== 0 || progress.lastDeliveredId === "0-0") { return null; }
  const minId = progress.lastDeliveredId;
  await client.xtrim(stream.key, "MINID", "~", minId);
  return minId;
}

// ── 独立 settle worker 常驻消费循环 ──

interface MatchConsumerState {
  readonly generation: number;
  readonly client: Redis;
  running: boolean;
  done: Promise<void>;
  stopPromise: Promise<void> | null;
}

let consumerGeneration = 0;
let activeConsumer: MatchConsumerState | null = null;

/** 启动常驻消费循环（幂等）。XREADGROUP BLOCK 占连接 → duplicate 独占，⛔ 不占共享 client。 */
export function startMatchConsumer(): void {
  if (activeConsumer?.running) { return; }
  assertAdmissionOpen();
  const client = clientForKey(K_STREAM_MATCH_V3).duplicate();
  const state = {
    generation: ++consumerGeneration,
    client,
    running: true,
    done: undefined as unknown as Promise<void>,
    stopPromise: null,
  } satisfies MatchConsumerState;
  activeConsumer = state;
  state.done = (async () => {
    while (state.running) {
      try {
        await consumeOnce({ client: state.client, blockMs: CONSUME_BLOCK_MS });
        const now = Date.now();
        for (const stream of MATCH_STREAMS) {
          if (now - stream.lastTrimMs < TRIM_INTERVAL_MS) { continue; }
          stream.lastTrimMs = now;
          await trimStreamToSafePoint(state.client, stream);
        }
      } catch (e) {
        if (!state.running) { break; }
        console.error(`[matchConsumer] 消费循环异常（generation=${state.generation}），1s 后重试:`, e);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })();
  // A loop failure must be observed even when no stop caller is waiting.
  void state.done.catch((error) => {
    console.error(`[matchConsumer] 消费循环终止（generation=${state.generation}）`, error);
  });
}

async function stopMatchConsumerState(state: MatchConsumerState): Promise<void> {
  if (state.stopPromise) { return state.stopPromise; }
  state.running = false;
  try {
    // disconnect 打断阻塞中的 XREADGROUP；旧 generation 只触碰自己的连接。
    state.client.disconnect();
  } catch {
    // The loop's catch/finally still observes adapter failures; stop remains
    // idempotent and must not clear a newer generation's state.
  }
  if (activeConsumer === state) { activeConsumer = null; }
  state.stopPromise = (async () => {
    await state.done.catch(() => { /* 循环收尾异常无需上抛 */ });
  })();
  return state.stopPromise;
}

/** 停止消费循环并释放独占连接（disconnect 打断阻塞中的 XREADGROUP）。 */
export async function stopMatchConsumer(): Promise<void> {
  const state = activeConsumer;
  if (!state) { return; }
  await stopMatchConsumerState(state);
}

// ── 网关侧流深度告警（没人消费时流无界增长必须被看见——⛔ 禁 MAXLEN 兜底，09·K6） ──

/** 深度阈值（⚠ 07 常量表待补条目）：超过即告警（约 = 高峰每分对局数 × 可容忍积压分钟数）。 */
const STREAM_DEPTH_ALERT = 1000;
const STREAM_DEPTH_CHECK_MS = 60_000;
interface StreamDepthState {
  readonly generation: number;
  timer: NodeJS.Timeout | null;
  checks: Set<Promise<void>>;
  unregister: (() => void) | null;
  active: boolean;
  stopPromise: Promise<void> | null;
}
let streamDepthGeneration = 0;
let activeStreamDepth: StreamDepthState | null = null;

/** 未建 group 时用 XLEN；已有 group 时用 lag+pending，避免已 ACK 但尚未 trim 的历史制造假积压。 */
async function streamBacklog(client: Redis, stream: MatchStreamState): Promise<{ backlog: number; xlen: number }> {
  const xlen = await client.xlen(stream.key);
  if (xlen === 0) { return { backlog: 0, xlen: 0 }; }
  const progress = await readGroupProgress(client, stream);
  return {
    backlog: !progress || progress.lag === null ? xlen : progress.lag + progress.pending,
    xlen,
  };
}

export interface MatchStreamDepthProbe {
  readonly sourceBacklog: (streamKey: string) => Promise<{ backlog: number; xlen: number }>;
  readonly quarantineDepth: () => Promise<number>;
  readonly report: (message: string) => void;
}

const defaultMatchStreamDepthProbe: MatchStreamDepthProbe = {
  sourceBacklog: async (streamKey) => {
    const stream = MATCH_STREAM_BY_KEY.get(streamKey);
    if (!stream) throw new Error(`未知 match stream key=${streamKey}`);
    return streamBacklog(clientForKey(stream.key), stream);
  },
  quarantineDepth: () => clientForKey(K_STREAM_MATCH_QUARANTINE).xlen(K_STREAM_MATCH_QUARANTINE),
  report: (message) => console.error(message),
};

function probeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** 单次健康探针。每个 key 独立收口错误，quarantine WRONGTYPE/ACL 不能被其它成功读掩盖。 */
export async function runMatchStreamDepthCheck(
  probe: MatchStreamDepthProbe = defaultMatchStreamDepthProbe,
): Promise<void> {
  await Promise.all([
    ...MATCH_STREAMS.map(async (stream) => {
      try {
        const { backlog, xlen } = await probe.sourceBacklog(stream.key);
        if (backlog > STREAM_DEPTH_ALERT) {
          probe.report(
            `[matchConsumer] ⚠⚠ ${stream.label} 未处理深度 ${backlog}（XLEN=${xlen}）`
            + `超阈值 ${STREAM_DEPTH_ALERT}——settle worker 未运行或积压`
            + `（npm --workspace @game/server run settle）`,
          );
        }
      } catch (error) {
        probe.report(`[matchConsumer] ⚠ ${stream.label} 深度探针失败：${probeError(error)}`);
      }
    }),
    (async () => {
      try {
        const depth = await probe.quarantineDepth();
        if (!Number.isSafeInteger(depth) || depth < 0) {
          throw new Error(`XLEN 返回非法深度 ${String(depth)}`);
        }
        if (depth > 0) {
          probe.report(`[matchConsumer] ⚠⚠ match quarantine 有 ${depth} 条待人工修复；禁止自动裁剪`);
        }
      } catch (error) {
        probe.report(`[matchConsumer] ⚠ match quarantine 深度探针失败：${probeError(error)}`);
      }
    })(),
  ]);
}

/** 网关启动时挂上：三条流分别检查未处理深度，任一超阈值都告警。 */
export function startStreamDepthAlert(): void {
  if (activeStreamDepth?.active) { return; }
  assertAdmissionOpen();
  if (defaultLifecycle.isClosed) { defaultLifecycle.reset(); }
  const state: StreamDepthState = {
    generation: ++streamDepthGeneration,
    timer: null,
    checks: new Set(),
    unregister: null,
    active: true,
    stopPromise: null,
  };
  activeStreamDepth = state;
  state.timer = setInterval(() => {
    if (!state.active || activeStreamDepth !== state) { return; }
    const check = runMatchStreamDepthCheck().catch((error) => {
      console.error("[matchConsumer] stream depth probe runner failed", error);
    });
    state.checks.add(check);
    void check.then(
      () => { state.checks.delete(check); },
      () => { state.checks.delete(check); },
    );
  }, STREAM_DEPTH_CHECK_MS);
  state.timer.unref();
  state.unregister = defaultLifecycle.register(
    `stream-depth-alert:${state.generation}`,
    () => stopStreamDepthState(state),
  );
}

async function stopStreamDepthState(state: StreamDepthState): Promise<void> {
  if (state.stopPromise) { return state.stopPromise; }
  state.active = false;
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (activeStreamDepth === state) { activeStreamDepth = null; }
  const checks = [...state.checks];
  const unregister = state.unregister;
  state.stopPromise = (async () => {
    await Promise.all(checks);
    state.checks.clear();
    // Capture this generation's unregister handle. A restart can register a
    // newer state while these Redis reads are still pending.
    unregister?.();
    state.unregister = null;
  })();
  return state.stopPromise;
}

/** 停止深度告警并等待已经发出的回读完成。 */
export async function stopStreamDepthAlert(): Promise<void> {
  const state = activeStreamDepth;
  if (!state) { return; }
  await stopStreamDepthState(state);
}

// ── 独立 settle worker 进程入口（consumer group 多实例天然分工，无需 singleton_lease） ──

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const isMain = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  console.log(`[settle] 启动（consumer=${MATCH_STREAM_CONSUMER}，group=${GROUP}，streams=legacy+v2+v3）`);
  startMatchConsumer();
  const shutdown = () => {
    void stopMatchConsumer().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
