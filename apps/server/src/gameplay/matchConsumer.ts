/**
 * M8a · 对局结算证据链（10·M8a / 02·P7）：生产（XADD）+ 消费（XREADGROUP → MySQL 落库 → XACK → XTRIM）。
 *
 * 职责：
 *  - `emitMatchEvidence`：对局房（GameRoom）收局时把整局证据（名次 + verifier 重放全部输入，09·K5）
 *    XADD 进 `stream:match`。**一局一条**（同局全部玩家在同一 payload），XADD 失败只告警
 *    ⛔ 不阻塞收局（内部吞错）。
 *  - `consumeOnce` / `startMatchConsumer`：consumer group `settle` 把证据落 MySQL——
 *    先过 `match_index` 幂等闸（非分区单列 PK，09·DB4/05·Δ2；ODKU 插入=1/重复=0，
 *    09·DB1 ⛔ INSERT IGNORE），重复 matchId 跳过 `match_results` 但仍 XACK；
 *    周期性按「已 ACK 且已落库」安全位点 XTRIM MINID（09·K6 ⛔ MAXLEN）。
 *
 * 进程归属：当前只 export 启停函数，由网关进程**可选**启动（不强行接线 app.ts）；
 * 生产归属待 M10 收口（独立 settle worker vs 网关常驻，连同 pending 深度告警、
 * 多消费组安全位点一起定）。
 */
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import type { Redis } from "ioredis";

import { K_STREAM_MATCH } from "../infra/keys";
import { withRcTx, type ResultSetHeader } from "../infra/mysql";
import { clientForKey } from "../infra/redisRoute";

// ── 常量（⚠ 07 常量表待补条目，先集中在此，⛔ 禁止散落——09 审查流程第 6 条） ──

/** `match_results.mode`（TINYINT，05）：0=休闲局，1=排位局。 */
export const MATCH_MODE_CASUAL = 0;
export const MATCH_MODE_RANKED = 1;

/** consumer group 名（07 全表 `stream:match` 条目：group `settle` 消费落 `match_results`）。 */
const GROUP = "settle";
/** 消费循环空转时 XREADGROUP BLOCK 时长。 */
const CONSUME_BLOCK_MS = 5000;
/** 裁剪节流周期（消费循环内）。 */
const TRIM_INTERVAL_MS = 60_000;

/** consumer 名 per 进程（同组多进程各自领活；重启复用同名可接回自己的 PEL 残留）。 */
const CONSUMER = `c_${hostname()}_${process.pid}`;

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
    return await clientForKey(K_STREAM_MATCH).xadd(
      K_STREAM_MATCH, "*",
      "matchId", ev.matchId,
      "mode", String(ev.mode),
      "payload", JSON.stringify(ev),
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[matchConsumer] 证据链 XADD 失败（matchId=${ev.matchId}），收局不受阻、证据待对账:`, e);
    return null;
  }
}

// ── 消费侧 ──

type StreamEntry = [id: string, fields: string[]];
type XReadGroupReply = [key: string, entries: StreamEntry[]][] | null;

let groupEnsured = false;
/** 本消费者最近一次「落库成功且已 XACK」的 stream id——XTRIM 安全位点（09·K6）。 */
let lastPersistedId: string | null = null;
let lastTrimMs = 0;

/** group 不存在则建（幂等）。起点 "0"：消费者可能晚于生产者上线，组建立前的证据也要落库。 */
async function ensureGroup(client: Redis): Promise<void> {
  if (groupEnsured) { return; }
  try {
    await client.xgroup("CREATE", K_STREAM_MATCH, GROUP, "0", "MKSTREAM");
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("BUSYGROUP")) { throw e; }
  }
  groupEnsured = true;
}

/** [k1,v1,k2,v2,…] → 对象。 */
function fieldMap(fields: string[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) { m[fields[i]] = fields[i + 1]; }
  return m;
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
async function settleEntry(client: Redis, id: string, fields: string[]): Promise<void> {
  const f = fieldMap(fields);
  const matchId = f.matchId ?? "";
  const mode = Number(f.mode);
  const payload = f.payload ?? "";
  if (!matchId || matchId.length > 40 || !Number.isInteger(mode) || mode < 0 || mode > 255 || !payload) {
    // eslint-disable-next-line no-console
    console.error(`[matchConsumer] 证据条目结构损坏，ACK 丢弃：id=${id} matchId=${matchId || "?"}`);
    await client.xack(K_STREAM_MATCH, GROUP, id);
    return;
  }
  await withRcTx(async (conn) => {
    const [r] = await conn.execute<ResultSetHeader>(
      "INSERT INTO match_index (match_id, created_at) VALUES (?, NOW(3)) ON DUPLICATE KEY UPDATE match_id = match_id",
      [matchId],
    );
    if (r.affectedRows === 1) {
      // 分区表（RANGE COLUMNS(created_at)，05）；重复已被闸住，此处必然首插
      await conn.execute(
        "INSERT INTO match_results (match_id, created_at, mode, payload) VALUES (?, NOW(3), ?, ?)",
        [matchId, mode, payload],
      );
    }
  });
  // 落库（或判重）成功才 ACK；XACK 前崩溃 → PEL 残留 → 重放，幂等闸挡重复
  await client.xack(K_STREAM_MATCH, GROUP, id);
  lastPersistedId = id;
}

export interface ConsumeOptions {
  /** 单次两趟各最多取多少条。缺省 64。 */
  count?: number;
  /** 新条目等待时长（仅作用于 ">" 趟）。⚠ BLOCK 占住整条连接，必须配独占 client。 */
  blockMs?: number;
  /** 缺省 `clientForKey(K_STREAM_MATCH)`（测试直调够用）；消费循环传 duplicate 独占连接。 */
  client?: Redis;
}

/**
 * 消费一轮（可单测）：先重放本 consumer 的 PEL 残留（上次落库失败/崩溃未 ACK；
 * XREADGROUP 指定起点 id 只回 PEL、不阻塞），再取新条目（">"）。
 * ⚠ 跨消费者的 PEL 接管（XAUTOCLAIM 死进程遗留）归 M10 收口，此处先不做。
 * @returns 本轮处理条数（含判重跳过与损坏丢弃）。
 */
export async function consumeOnce(opts: ConsumeOptions = {}): Promise<number> {
  const client = opts.client ?? clientForKey(K_STREAM_MATCH);
  const count = opts.count ?? 64;
  await ensureGroup(client);
  let n = 0;
  n += await readBatch(client, "0", count);
  n += await readBatch(client, ">", count, opts.blockMs);
  return n;
}

async function readBatch(client: Redis, startId: string, count: number, blockMs?: number): Promise<number> {
  const args: (string | number)[] = ["GROUP", GROUP, CONSUMER, "COUNT", count];
  if (blockMs !== undefined && startId === ">") { args.push("BLOCK", blockMs); }
  args.push("STREAMS", K_STREAM_MATCH, startId);
  const res = (await client.call("XREADGROUP", ...args.map(String))) as XReadGroupReply;
  const entries = res?.[0]?.[1] ?? [];
  for (const [id, fields] of entries) { await settleEntry(client, id, fields); }
  return entries.length;
}

/**
 * 按「已 ACK 且已落库」安全位点裁剪（09·K6/02·P3：⛔ MAXLEN 按长度无条件删最老条目、
 * 完全不看 PEL/ACK，worker 积压时正好删掉未落库数据）。裁剪 owner = 证据链消费者（07）。
 *
 * 安全论证：`lastPersistedId` 是本消费者最近一次落库成功并 XACK 的 id。当组 PEL 为空时，
 * 组内**已投递**的条目全部已 ACK（经幂等闸落库）；**尚未投递**的条目 id 必然 > 组
 * last-delivered ≥ lastPersistedId——故裁掉 < lastPersistedId 的条目碰不到任何未落库数据。
 * PEL 非空（本组任一消费者还挂着未 ACK 条目）则整轮跳过——宁可流长一点也不冒险（保守；
 * pending 深度告警归 M10）。`~` 近似裁剪只按 rax 节点整块删，只会少裁不会多裁。
 *
 * ⚠ 前提：`settle` 是本流唯一消费组（当前如此）；未来 verifier 组接入后安全位点须取各组
 * 位点的 min（M10 收口）。「7 天前 MINID 兜底」刻意**不做**：证据链是审计数据，积压 7 天
 * 属运维事故，宁可告警人工介入，也不做任何可能删掉未落库条目的无条件裁剪。
 * @returns 实际用作 MINID 的位点；本轮不满足安全条件则 null。
 */
export async function trimToSafePoint(client?: Redis): Promise<string | null> {
  const c = client ?? clientForKey(K_STREAM_MATCH);
  if (!lastPersistedId) { return null; }
  const pending = (await c.xpending(K_STREAM_MATCH, GROUP)) as [number, ...unknown[]];
  if (Number(pending?.[0] ?? 1) !== 0) { return null; }
  const minId = lastPersistedId;
  await c.xtrim(K_STREAM_MATCH, "MINID", "~", minId);
  return minId;
}

// ── 常驻消费循环（进程归属待 M10 收口；现由网关进程可选启动） ──

let running = false;
let loopDone: Promise<void> | null = null;
let loopClient: Redis | null = null;

/** 启动常驻消费循环（幂等）。XREADGROUP BLOCK 占连接 → duplicate 独占，⛔ 不占共享 client。 */
export function startMatchConsumer(): void {
  if (running) { return; }
  running = true;
  loopClient = clientForKey(K_STREAM_MATCH).duplicate();
  loopDone = (async () => {
    while (running) {
      try {
        await consumeOnce({ client: loopClient!, blockMs: CONSUME_BLOCK_MS });
        if (Date.now() - lastTrimMs >= TRIM_INTERVAL_MS) {
          lastTrimMs = Date.now();
          await trimToSafePoint(loopClient!);
        }
      } catch (e) {
        if (!running) { break; }
        // eslint-disable-next-line no-console
        console.error("[matchConsumer] 消费循环异常，1s 后重试:", e);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })();
}

/** 停止消费循环并释放独占连接（disconnect 打断阻塞中的 XREADGROUP）。 */
export async function stopMatchConsumer(): Promise<void> {
  running = false;
  loopClient?.disconnect();
  await loopDone?.catch(() => { /* 循环收尾异常无需上抛 */ });
  loopClient = null;
  loopDone = null;
}
