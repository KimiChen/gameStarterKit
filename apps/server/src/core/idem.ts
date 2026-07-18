/**
 * 幂等占位（[07 · 幂等占位的两个状态](docs/SERVER.md)）。
 *
 * 幂等 = **执行前**原子占位（SET NX PX，pending 短租约 10s）+ **数据层 UNIQUE 兜底**（09·I1）。
 * ⛔ 禁止「成功后 SET」——并发双发会双双执行；⛔ 禁止 pending 用长 TTL（24h 毒丸卡死用户）。
 * pending 租约崩溃后自然失效，可被后续请求安全抢占；数据层（ledger UNIQUE / applied ZSET）
 * 保证抢占后的重复执行也 exactly-once。
 */
import type Redis from "ioredis";
import { IDEM_PENDING_MS, IDEM_RESULT_MS } from "./infra/config";
import { CAS_DEL, evalshaWithReload } from "./infra/redisScripts";

const PENDING_PREFIX = "__PENDING__:";

export type IdemState =
  | { kind: "acquired" }                // 占位成功，执行业务
  | { kind: "pending" }                 // 别人执行中 → IN_PROGRESS，客户端短轮询
  | { kind: "done"; result: string };   // 已完成 → 直接回缓存结果

/** 执行前占位。holderId 用于崩溃后区分「自己的 pending」与「别人的」。 */
export async function idemAcquire(client: Redis, key: string, holderId: string): Promise<IdemState> {
  for (let i = 0; i < 2; i++) { // 有界：SET NX 失败后 GET 到 null 说明恰好过期，重占一次
    const ok = await client.set(key, PENDING_PREFIX + holderId, "PX", IDEM_PENDING_MS, "NX");
    if (ok) { return { kind: "acquired" }; }
    const cur = await client.get(key);
    if (cur === null) { continue; }
    if (cur.startsWith(PENDING_PREFIX)) { return { kind: "pending" }; }
    return { kind: "done", result: cur };
  }
  return { kind: "pending" }; // 两轮都撞过期窗口：按执行中处理，客户端短轮询
}

/**
 * 业务成功后写结果缓存（TTL 60s）。
 * 直接覆写：即使 pending 已过期被人抢占，双方结果一致（数据层幂等保证），后写者胜无害。
 */
export async function idemComplete(client: Redis, key: string, resultJson: string): Promise<void> {
  await client.set(key, resultJson, "PX", IDEM_RESULT_MS);
}

/** 业务失败（干净失败，可重试）→ 释放自己的 pending，让客户端立即重试而不用等 10s。 */
export async function idemRelease(client: Redis, key: string, holderId: string): Promise<void> {
  // CAS：只删自己的 pending，绝不误删别人的占位或已写入的结果
  await evalshaWithReload(client, CAS_DEL, [key], [PENDING_PREFIX + holderId]);
}
