/**
 * 幂等 v2（Non-intrusive §6.11/§6.12；升级 SOP 与记录形状登记见 docs/SERVER.md §8）。
 *
 * v1（SET NX 哨兵 + sessionId holder）→ v2 的三点收紧：
 *  - **payload 绑定**：记录持久化 canonical payload hash（`idemPayloadHash`），同 clientReqId
 *    携带不同 payload 是稳定 `conflict`（→ OPERATION_CONFLICT），⛔ 不再静默重放；
 *  - **唯一 lease**：每次成功 acquisition 生成独立 leaseId（⛔ 不再用 sessionId 当 holder），
 *    complete/release 都经单条 Lua CAS 比对完整 pending 记录——旧 handler 不能覆盖新 lease
 *    的完成结果、也不能删除后来者的 pending；
 *  - **acquire 单条原子 Lua**：v1 的「SET NX + GET + retry」在引入 leaseId 后不再等价
 *    （GET 与判断之间的过期窗口会产生两个都写 done 的 lease，§6.12 明令否决），⛔ 不保留。
 *
 * 生存期不变式（继承 v1）：pending 带 PX=IDEM_PENDING_MS；complete 覆写 done 时**重置**
 * TTL 为 IDEM_RESULT_MS（⛔ 不沿用 pending 剩余 TTL、⛔ 不写无 TTL 的 SET）。
 * 结果体超 IDEM_RESULT_MAX_BYTES 改写 done-oversize 墓碑（重放/inspect → OPERATION_RESULT_EXPIRED，
 * 既不重跑 handler 也不伪装 unknown）。每 uid 并发 pending 数超 IDEM_MAX_PENDING_PER_UID → busy。
 *
 * 通用幂等仍只是 30/60s 量级的 UX 快闸，不是 exactly-once 真源——数据层
 * （ledger UNIQUE / applied op_id / claimed_at CAS）继续兜底（09·I1）。
 */
import { createHash, randomBytes } from "node:crypto";
import type Redis from "ioredis";
import { canonicalJsonString } from "@game/shared";
import {
  IDEM_MAX_PENDING_PER_UID, IDEM_PENDING_MS, IDEM_RESULT_MAX_BYTES, IDEM_RESULT_MS,
} from "./infra/config";
import { defineScript, evalshaWithReload } from "./infra/redisScripts";

// ── 记录形状（§6.12 StoredIdem；cjson 在 Lua 内编解码，TS 侧只在 inspect 读侧解析） ──

export type StoredIdem =
  | { v: 2; state: "pending"; hash: string; leaseId: string; contractVersion: number }
  | { v: 2; state: "done"; hash: string; resultJson: string; contractVersion: number }
  | { v: 2; state: "done-oversize"; hash: string; contractVersion: number };

/** acquire 的判定结果（单条 Lua 的原子输出；dispatcher 状态机据此分派）。 */
export type IdemAcquire =
  | { kind: "acquired" }
  | { kind: "in-progress" }
  | { kind: "conflict" }
  | { kind: "busy" }
  | { kind: "done"; result: string }
  | { kind: "done-oversize" }
  | { kind: "version-mismatch"; state: "pending" | "done" }
  | { kind: "corrupt" };

export type IdemCompleteResult = "ok" | "ok-oversize" | "lost";

/** 每次成功 acquisition 的独立租约 id（§6.12：⛔ 不复用 sessionId）。 */
export const newIdemLeaseId = (): string => randomBytes(16).toString("hex");

// ── canonical payload hash（§6.11 固定摘要，算法版本进 preimage） ────────────

/**
 * `sha256("lobby-rpc-idem/v1\0" + routeType + "\0" + canonicalJson(payload 去 clientReqId))` hex。
 *
 * clientReqId 已是 `kIdemUser(route, uid, clientReqId)` 的**末段** key 分量（(route,uid) 固定时
 * 不同 ID 必得不同 key、编码单射），因此可安全从摘要排除；从**副本**排除，⛔ 不改传给
 * handler 的 validated payload。契约版本不进 preimage、不进 key（§6.11 明令）。
 */
export function idemPayloadHash(routeType: string, payload: unknown): string {
  let scrubbed: unknown = payload;
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(payload as Record<string, unknown>)) {
      if (key === "clientReqId") { continue; }
      copy[key] = (payload as Record<string, unknown>)[key];
    }
    scrubbed = copy;
  }
  return createHash("sha256")
    .update(`lobby-rpc-idem/v1\0${routeType}\0${canonicalJsonString(scrubbed)}`, "utf8")
    .digest("hex");
}

// ── 三条单条原子 Lua（defineScript + evalshaWithReload 范式，09·R7） ─────────
// KEYS[1] = kIdemUser 记录键；KEYS[2] = kIdemPending 计数键（同 {uid} 槽）。
// 计数器只是上限护栏非真源：腐坏值就地重置（DEL 后重 INCR），避免 Lua 中途 abort 留半写。

export const IDEM_V2_ACQUIRE = defineScript("idemV2Acquire", `
-- ARGV = [hash, leaseId, contractVersion, pendingMs, maxPendingPerUid]
local cur = redis.call('GET', KEYS[1])
if cur == false then
  local rawCount = redis.call('GET', KEYS[2])
  local count = 0
  if rawCount ~= false then
    count = tonumber(rawCount)
    if count == nil or count ~= math.floor(count) or count < 0 then
      redis.call('DEL', KEYS[2])
      count = 0
    end
  end
  if count >= tonumber(ARGV[5]) then return { 'busy' } end
  local rec = cjson.encode({ v = 2, state = 'pending', hash = ARGV[1], leaseId = ARGV[2], contractVersion = tonumber(ARGV[3]) })
  redis.call('SET', KEYS[1], rec, 'PX', ARGV[4])
  redis.call('INCR', KEYS[2])
  redis.call('PEXPIRE', KEYS[2], ARGV[4])
  return { 'acquired' }
end
local ok, rec = pcall(cjson.decode, cur)
if not ok or type(rec) ~= 'table' or rec.v ~= 2 then return { 'corrupt' } end
if rec.state == 'pending' then
  -- 版本比对先于 hash 比对：contractVersion 不进 preimage，升级期同 ID 的重规范化 payload
  -- 可能合法地异 hash——报 conflict 比 fail-closed 更糟（§6.11）
  if rec.contractVersion ~= tonumber(ARGV[3]) then return { 'version-mismatch', 'pending' } end
  if rec.hash ~= ARGV[1] then return { 'conflict' } end
  return { 'in-progress' }
end
if rec.state == 'done' or rec.state == 'done-oversize' then
  if rec.contractVersion ~= tonumber(ARGV[3]) then return { 'version-mismatch', 'done' } end
  if rec.hash ~= ARGV[1] then return { 'conflict' } end
  if rec.state == 'done-oversize' then return { 'done-oversize' } end
  if type(rec.resultJson) ~= 'string' then return { 'corrupt' } end
  return { 'done', rec.resultJson }
end
return { 'corrupt' }
`);

export const IDEM_V2_COMPLETE = defineScript("idemV2Complete", `
-- ARGV = [leaseId, resultJson, oversizeFlag('0'|'1'), resultMs]
local cur = redis.call('GET', KEYS[1])
if cur == false then return 'lost' end
local ok, rec = pcall(cjson.decode, cur)
if not ok or type(rec) ~= 'table' or rec.v ~= 2 or rec.state ~= 'pending' or rec.leaseId ~= ARGV[1] then
  return 'lost'
end
local out
if ARGV[3] == '1' then
  out = cjson.encode({ v = 2, state = 'done-oversize', hash = rec.hash, contractVersion = rec.contractVersion })
else
  out = cjson.encode({ v = 2, state = 'done', hash = rec.hash, resultJson = ARGV[2], contractVersion = rec.contractVersion })
end
-- 重置为 result TTL（⛔ 不 KEEPTTL 沿用 pending 剩余、⛔ 不写无 TTL SET）
redis.call('SET', KEYS[1], out, 'PX', ARGV[4])
local count = tonumber(redis.call('GET', KEYS[2]))
if count ~= nil and count == math.floor(count) and count > 0 then
  redis.call('DECR', KEYS[2])
else
  redis.call('DEL', KEYS[2])
end
return 'ok'
`);

export const IDEM_V2_RELEASE = defineScript("idemV2Release", `
-- ARGV = [leaseId]；只删自己的 pending（旧 lease 不得删除后来者的占位/结果）
local cur = redis.call('GET', KEYS[1])
if cur == false then return 'noop' end
local ok, rec = pcall(cjson.decode, cur)
if not ok or type(rec) ~= 'table' or rec.v ~= 2 or rec.state ~= 'pending' or rec.leaseId ~= ARGV[1] then
  return 'noop'
end
redis.call('DEL', KEYS[1])
local count = tonumber(redis.call('GET', KEYS[2]))
if count ~= nil and count == math.floor(count) and count > 0 then
  redis.call('DECR', KEYS[2])
else
  redis.call('DEL', KEYS[2])
end
return 'ok'
`);

// ── TS 包装 ─────────────────────────────────────────────────────────────────

export interface IdemAcquireArgs {
  readonly hash: string;
  readonly leaseId: string;
  readonly contractVersion: number;
  /** 测试覆写窗口用；生产一律缺省 IDEM_PENDING_MS。 */
  readonly pendingMs?: number;
  readonly maxPendingPerUid?: number;
}

/** 执行前原子占位/判定（单条 Lua，⛔ 无 SET NX + GET 过期窗口）。 */
export async function idemAcquire(
  client: Redis,
  key: string,
  counterKey: string,
  args: IdemAcquireArgs,
): Promise<IdemAcquire> {
  const reply = await evalshaWithReload(client, IDEM_V2_ACQUIRE, [key, counterKey], [
    args.hash,
    args.leaseId,
    args.contractVersion,
    args.pendingMs ?? IDEM_PENDING_MS,
    args.maxPendingPerUid ?? IDEM_MAX_PENDING_PER_UID,
  ]);
  if (!Array.isArray(reply) || typeof reply[0] !== "string") {
    throw new Error(`idemAcquire 回包形状非法: ${JSON.stringify(reply)}`);
  }
  switch (reply[0]) {
    case "acquired": return { kind: "acquired" };
    case "in-progress": return { kind: "in-progress" };
    case "conflict": return { kind: "conflict" };
    case "busy": return { kind: "busy" };
    case "done-oversize": return { kind: "done-oversize" };
    case "corrupt": return { kind: "corrupt" };
    case "done":
      if (typeof reply[1] !== "string") { throw new Error("idemAcquire done 缺 resultJson"); }
      return { kind: "done", result: reply[1] };
    case "version-mismatch":
      if (reply[1] !== "pending" && reply[1] !== "done") {
        throw new Error("idemAcquire version-mismatch 缺状态位");
      }
      return { kind: "version-mismatch", state: reply[1] };
    default:
      throw new Error(`idemAcquire 未知判定: ${reply[0]}`);
  }
}

/**
 * 业务成功后 CAS 提升 pending → done（仅当仍持有自己的 lease）。
 * 结果体超 IDEM_RESULT_MAX_BYTES → 改写 done-oversize 墓碑并返回 "ok-oversize"；
 * lease 已旁落（过期被抢/被释放）→ "lost"：⛔ 不回滚业务、不覆盖新持有者，调用方打孤儿指标。
 */
export async function idemComplete(
  client: Redis,
  key: string,
  counterKey: string,
  leaseId: string,
  resultJson: string,
  opts?: { readonly resultMs?: number; readonly maxResultBytes?: number },
): Promise<IdemCompleteResult> {
  const oversize = Buffer.byteLength(resultJson, "utf8") > (opts?.maxResultBytes ?? IDEM_RESULT_MAX_BYTES);
  const reply = await evalshaWithReload(client, IDEM_V2_COMPLETE, [key, counterKey], [
    leaseId,
    oversize ? "" : resultJson,
    oversize ? "1" : "0",
    opts?.resultMs ?? IDEM_RESULT_MS,
  ]);
  if (reply === "lost") { return "lost"; }
  if (reply !== "ok") { throw new Error(`idemComplete 回包非法: ${JSON.stringify(reply)}`); }
  return oversize ? "ok-oversize" : "ok";
}

/** 干净失败释放：只删自己的 pending（CAS 比对 leaseId），让客户端立即重试而不用等 30s。 */
export async function idemRelease(
  client: Redis,
  key: string,
  counterKey: string,
  leaseId: string,
): Promise<void> {
  await evalshaWithReload(client, IDEM_V2_RELEASE, [key, counterKey], [leaseId]);
}
