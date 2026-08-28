/**
 * M8a · 对局结算证据链（10·M8a / 02·P7）：生产（XADD）+ 消费（XREADGROUP → MySQL 落库 → XACK → XTRIM）。
 *
 * 职责：
 *  - `emitMatchEvidence`：对局房（GameRoom）收局时把整局证据（名次 + verifier 重放全部输入，09·K5）
 *    XADD 进 v2 流。**一局一条**（同局全部玩家在同一 payload），XADD 失败只告警
 *    ⛔ 不阻塞收局（内部吞错）。legacy `stream:match` 自本版起只排空、不再接收新消息。
 *  - `consumeOnce` / `startMatchConsumer`：consumer group `settle` 把证据落 MySQL——
 *    同一连接双读 legacy + v2（两 key 同 Redis slot）；v2 强制 `schemaVersion=2`，
 *    legacy 缺 sId 时规范化为 0 后再存，保证 DB JSON 也符合当前 MatchEvidence；
 *    先过 `match_index` 幂等闸（非分区单列 PK，09·DB4/05·Δ2；ODKU 插入=1/重复=0，
 *    09·DB1 ⛔ INSERT IGNORE），重复 matchId 跳过 `match_results` 但仍 XACK；
 *    两条流分别按「已 ACK 且已落库」安全位点 XTRIM MINID（09·K6 ⛔ MAXLEN）。
 *
 * 进程归属（评审收口）：独立 **settle worker**（`npm --workspace @game/server run settle`，
 * 本文件自带进程入口；consumer group 天然支持多实例分工，无需 singleton_lease）。
 * 网关侧只挂**流深度告警**（startStreamDepthAlert——没人消费时流无界增长必须被看见）。
 * 多消费组安全位点（verifier 组接入后）仍归 M10。
 */
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import type { Redis } from "ioredis";

import { K_STREAM_MATCH, K_STREAM_MATCH_V2 } from "../infra/keys";
import { withRcTx, type ResultSetHeader } from "../infra/mysql";
import { clientForKey } from "../infra/redisRoute";
import { assertAdmissionOpen, defaultLifecycle } from "../infra/lifecycle";
import { storedInt } from "../infra/numbers";

// ── 常量（已登记 docs/SERVER.md §13，⛔ 禁止散落——09 审查流程第 6 条） ──

/** `match_results.mode`（TINYINT，05）：0=休闲局，1=排位局。 */
export const MATCH_MODE_CASUAL = 0;
export const MATCH_MODE_RANKED = 1;
/** v2 stream 顶层 schemaVersion；legacy 流无此字段。 */
export const MATCH_STREAM_SCHEMA_VERSION = 2;

/** 两条 match stream 各自使用同名 group `settle` 消费落 `match_results`。 */
const GROUP = "settle";
/** 消费循环空转时 XREADGROUP BLOCK 时长。 */
const CONSUME_BLOCK_MS = 5000;
/** 裁剪节流周期（消费循环内）。 */
const TRIM_INTERVAL_MS = 60_000;

/** consumer 名 per **主机**（⛔ 不含 PID，评审修正）：进程崩溃重启后复用同名，
 *  consumeOnce 的 "0" 起点直接接回自己的 PEL 残留；含 PID 会让旧 PEL 变成孤儿，
 *  只能靠 XAUTOCLAIM 兜（跨机死进程仍由 claimStale 接管）。 */
const CONSUMER = `c_${hostname()}`;

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
 * 收局时 XADD 一条证据。**吞错**：XADD 失败只 console.error 告警、返回 null，
 * ⛔ 不阻塞对局结束（对局结果已广播/已写档，证据丢失属可对账事故，不能拖死房间）。
 * @returns stream 条目 id；失败 null。
 */
export async function emitMatchEvidence(ev: MatchEvidence): Promise<string | null> {
  try {
    return await clientForKey(K_STREAM_MATCH_V2).xadd(
      K_STREAM_MATCH_V2, "*",
      // v2 key 与显式版本必须一起升级：旧 worker 根本看不到该 key，新 worker 才按 v2 契约解码。
      "schemaVersion", String(MATCH_STREAM_SCHEMA_VERSION),
      "matchId", ev.matchId,
      "mode", String(ev.mode),
      // ⚠ 提升成**顶层字段**（同 matchId/mode）：消费侧据此落 `match_results.server_id`，
      // 并与 payload 交叉校验，防列值与审计 JSON 分叉。
      "sId", String(ev.sId),
      "payload", JSON.stringify(ev),
    );
  } catch (e) {
    console.error(`[matchConsumer] v2 证据链 XADD 失败（matchId=${ev.matchId}），收局不受阻、证据待对账:`, e);
    return null;
  }
}

// ── 消费侧 ──

type StreamEntry = [id: string, fields: string[]];
type XReadGroupReply = [key: string, entries: StreamEntry[]][] | null;

type MatchStreamKind = "legacy" | "v2";
interface MatchStreamState {
  readonly key: string;
  readonly kind: MatchStreamKind;
  readonly label: string;
  groupEnsured: boolean;
  /** XAUTOCLAIM 下一页游标；到 "0-0" 后下轮从头开启新一轮扫描。 */
  claimCursor: string;
  /** 两条流独立节流，避免一条流的 trim 时间戳压住另一条。 */
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
const MATCH_STREAMS: readonly MatchStreamState[] = [LEGACY_STREAM, V2_STREAM];
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
  /** 已按当前 MatchEvidence 规范化后的 JSON（legacy 至少补齐 number sId）。 */
  payload: string;
}

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
function normalizeEntry(stream: MatchStreamState, fields: string[]): NormalizedEntry | null {
  if (stream.kind === "v2") {
    const allowed = new Set(["schemaVersion", "matchId", "mode", "sId", "payload"]);
    const seen = new Set<string>();
    if (fields.length !== allowed.size * 2) { return null; }
    for (let i = 0; i < fields.length; i += 2) {
      const name = fields[i];
      if (!allowed.has(name) || seen.has(name)) { return null; }
      seen.add(name);
    }
  }
  const f = fieldMap(fields);
  const matchId = f.matchId ?? "";
  const mode = parseUInt(f.mode, 255);
  const payload = parsePayload(f.payload);
  if (!matchId || matchId.length > 40 || mode === null || !payload) { return null; }

  if (stream.kind === "v2") {
    const sId = parseUInt(f.sId, 65535);
    if (f.schemaVersion !== String(MATCH_STREAM_SCHEMA_VERSION) || sId === null
        || payload.matchId !== matchId || payload.mode !== mode || payload.sId !== sId) {
      return null;
    }
    return { matchId, mode, sId, payload: JSON.stringify(payload) };
  }

  // f91 legacy 同时有顶层 + payload sId：顶层是落库契约，必须保留；真实 c8 两处都没有则补 0。
  const topLevelSId = f.sId === undefined ? null : parseUInt(f.sId, 65535);
  if (f.sId !== undefined && topLevelSId === null) { return null; }
  const embeddedSId = payload.sId === undefined ? null : payloadSId(payload.sId);
  if (payload.sId !== undefined && embeddedSId === null) { return null; }
  if (topLevelSId !== null && embeddedSId !== null && topLevelSId !== embeddedSId) { return null; }
  const sId = topLevelSId ?? embeddedSId ?? 0;
  payload.sId = sId;
  return { matchId, mode, sId, payload: JSON.stringify(payload) };
}

/**
 * 落一条证据：`match_index` 幂等闸 →（首见才）`match_results` → XACK。
 * - 幂等闸（09·DB4/05·Δ2）：`match_results` 是分区表、PK 被迫含 created_at，单列唯一性
 *   靠非分区 `match_index` 补回。ODKU 写法（09·DB1：⛔ INSERT IGNORE 静默吞截断/NOT NULL）；
 *   池已 `-FOUND_ROWS`，affectedRows 插入=1/重复=0 可信（09·DB2）。
 * - 重复 matchId（重复投递/重复消费）：跳过 results 但**仍 XACK**——重复条目已无信息量。
 * - 结构损坏条目：生产者是我们自己，损坏=bug → 告警后 ACK 丢弃（不 ACK 会永久卡死 PEL）。
 * - DB 故障：**不 ACK** 直接抛——条目留在 PEL，下次 consumeOnce 的 "0" 起点重放，幂等闸兜底。
 */
async function settleEntry(
  client: Redis, stream: MatchStreamState, id: string, fields: string[],
): Promise<void> {
  const normalized = normalizeEntry(stream, fields);
  if (!normalized) {
    const matchId = fieldMap(fields).matchId || "?";
    console.error(`[matchConsumer] ${stream.label} 证据条目结构/版本损坏，ACK 丢弃：id=${id} matchId=${matchId}`);
    await client.xack(stream.key, GROUP, id);
    return;
  }
  const { matchId, mode, sId, payload } = normalized;
  await withRcTx(async (conn) => {
    const [r] = await conn.execute<ResultSetHeader>(
      "INSERT INTO match_index (match_id, created_at) VALUES (?, NOW(3)) ON DUPLICATE KEY UPDATE match_id = match_id",
      [matchId],
    );
    if (r.affectedRows === 1) {
      // 分区表（RANGE COLUMNS(created_at)，05）；重复已被闸住，此处必然首插
      await conn.execute(
        "INSERT INTO match_results (match_id, created_at, server_id, mode, payload) VALUES (?, NOW(3), ?, ?, ?)",
        [matchId, sId, mode, payload],
      );
    }
  });
  // 落库（或判重）成功才 ACK；XACK 前崩溃 → PEL 残留 → 重放，幂等闸挡重复
  await client.xack(stream.key, GROUP, id);
}

export interface ConsumeOptions {
  /** 每条流、每个阶段最多取多少条。缺省 64。 */
  count?: number;
  /** 新条目等待时长（双流共用一次 ">" XREADGROUP）。⚠ BLOCK 占住整条连接，必须配独占 client。 */
  blockMs?: number;
  /** 缺省 v2/legacy 同槽 client（测试直调够用）；消费循环传 duplicate 独占连接。 */
  client?: Redis;
}

/**
 * 消费一轮（可单测）：对 legacy/v2 **逐流**重放本 consumer 的 PEL 残留（上次落库失败/崩溃未 ACK；
 * XREADGROUP 指定起点 id 只回 PEL、不阻塞），再逐流 XAUTOCLAIM 接管**别的死消费者**
 * 挂 ≥ CLAIM_MIN_IDLE_MS 的 PEL，最后用一次同槽 XREADGROUP 双读两流的新条目（">"）。
 * @returns 本轮处理条数（含判重跳过与损坏丢弃）。
 */
export async function consumeOnce(opts: ConsumeOptions = {}): Promise<number> {
  const client = opts.client ?? clientForKey(K_STREAM_MATCH_V2);
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
    // NOGROUP 不一定携带具体 key；保守重置两流，下轮分别 MKSTREAM 自愈。
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
    "XAUTOCLAIM", stream.key, GROUP, CONSUMER, String(CLAIM_MIN_IDLE_MS), stream.claimCursor,
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
  const args: (string | number)[] = ["GROUP", GROUP, CONSUMER, "COUNT", count];
  args.push("STREAMS", stream.key, startId);
  const res = (await client.call("XREADGROUP", ...args.map(String))) as XReadGroupReply;
  const entries = res?.[0]?.[1] ?? [];
  for (const [id, fields] of entries) { await settleEntry(client, stream, id, fields); }
  return entries.length;
}

/** 两 key 的 hash 输入相同，故可在一次 BLOCK XREADGROUP 中等待任一流，避免顺序阻塞饿死 v2。 */
async function readNewBatches(client: Redis, count: number, blockMs?: number): Promise<number> {
  const args: (string | number)[] = ["GROUP", GROUP, CONSUMER, "COUNT", count];
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
 * @returns 兼容旧 API：本轮最后一个成功裁剪的 MINID；两流都不满足安全条件则 null。
 */
export async function trimToSafePoint(client?: Redis): Promise<string | null> {
  const c = client ?? clientForKey(K_STREAM_MATCH_V2);
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

// ── 常驻消费循环（进程归属待 M10 收口；现由网关进程可选启动） ──

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
  const client = clientForKey(K_STREAM_MATCH_V2).duplicate();
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

/** 网关启动时挂上：两条流分别检查未处理深度，任一超阈值都告警。 */
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
    const check: Promise<void> = Promise.all(MATCH_STREAMS.map(async (stream) => {
      const { backlog, xlen } = await streamBacklog(clientForKey(stream.key), stream);
      if (backlog > STREAM_DEPTH_ALERT) {
        console.error(`[matchConsumer] ⚠⚠ ${stream.label} 未处理深度 ${backlog}（XLEN=${xlen}）超阈值 ${STREAM_DEPTH_ALERT}——settle worker 未运行或积压（npm --workspace @game/server run settle）`);
      }
    })).then(() => undefined).catch(() => { /* Redis 抖动不告警——连接级问题由 infra 监控负责 */ });
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
  console.log(`[settle] 启动（consumer=${CONSUMER}，group=${GROUP}，streams=legacy+v2）`);
  startMatchConsumer();
  const shutdown = () => {
    void stopMatchConsumer().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
