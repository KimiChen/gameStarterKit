/**
 * 兑换存储：每用户「已兑换码集合」+「本 feature 钱包余额」两把 feature 键（kFeatureUser，
 * 与该 uid 的框架键同槽，09·R3），一条 Lua 原子完成「未兑换则记账并加余额」。
 * ⛔ 不碰经济系统主钱包/账本——插件只能消费框架 API，不能改框架写路径（PLUGIN.md §3）。
 */
import type { Redis } from "ioredis";
import { kFeatureUser } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { defineScript, evalshaWithReload } from "../infra/redisScripts";

export type RedeemClaimOutcome = { readonly kind: "ok"; readonly balance: number } | { readonly kind: "used" };

export interface RedeemStore {
  /** 原子：code 未被该用户兑换过 → 记入集合并把 amount 加到余额；否则 used。 */
  claim(uid: string, code: string, amount: number): Promise<RedeemClaimOutcome>;
}

const FEATURE_ID = "redeem";
const SCOPE = { zone: "per-zone" } as const;

export const kRedeemClaimed = (uid: string): string => kFeatureUser(FEATURE_ID, "claimed", uid, SCOPE);
export const kRedeemWallet = (uid: string): string => kFeatureUser(FEATURE_ID, "wallet", uid, SCOPE);

/** KEYS[1]=claimed set，KEYS[2]=wallet；ARGV=[code, amount]。同 {uid} 槽，集群安全。 */
export const REDEEM_CLAIM = defineScript("redeemClaim", `
if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return { 'used' } end
local balance = redis.call('INCRBY', KEYS[2], ARGV[2])
return { 'ok', balance }
`);

function parseOutcome(raw: unknown): RedeemClaimOutcome {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`redeemClaim: Lua 返回形状异常 ${JSON.stringify(raw)}`);
  if (raw[0] === "used") return { kind: "used" };
  const balance = Number(raw[1]);
  if (raw[0] !== "ok" || !Number.isSafeInteger(balance) || balance < 0) {
    throw new Error(`redeemClaim: Lua 返回形状异常 ${JSON.stringify(raw)}`);
  }
  return { kind: "ok", balance };
}

/** Redis 实现（生产口径）。`resolveClient` 可注入以便无网测试；缺省按 uid 路由。 */
export function createRedisRedeemStore(resolveClient: (uid: string) => Redis = clientFor): RedeemStore {
  return {
    async claim(uid, code, amount) {
      const raw = await evalshaWithReload(resolveClient(uid), REDEEM_CLAIM, [kRedeemClaimed(uid), kRedeemWallet(uid)], [code, amount]);
      return parseOutcome(raw);
    },
  };
}

/** 内存实现（单测用；语义与 Lua 一致：先判已兑换，再加余额）。 */
export function createMemoryRedeemStore(): RedeemStore & { readonly balances: Map<string, number> } {
  const claimed = new Map<string, Set<string>>();
  const balances = new Map<string, number>();
  return {
    balances,
    async claim(uid, code, amount) {
      const set = claimed.get(uid) ?? new Set<string>();
      claimed.set(uid, set);
      if (set.has(code)) return { kind: "used" };
      set.add(code);
      const balance = (balances.get(uid) ?? 0) + amount;
      balances.set(uid, balance);
      return { kind: "ok", balance };
    },
  };
}
