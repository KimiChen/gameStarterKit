/**
 * 赛季轮换任务（M7）——**独立进程**入口（同 relayer/freezeWorker 一族，10 建议结构）。
 *
 * 单例纪律（09·X7）：`singleton_lease` 的 `season_rotation` 行（schema 已预置）抢占领导权，
 * 续租守卫走 withLeaseTx（守卫是事务第一句，0 行 = 被顶替 → LeaseLostError → 进程自杀）。
 * ⚠ 本任务的业务写是 Redis EXPIRE（无 MySQL 业务批写可同事务），僵尸窗口内的重复 EXPIRE
 *   幂等无害——这是「轮换本身幂等」兜住的，不依赖续租原子性。
 *
 * 轮换语义（03 · 赛季轮换）：key 内嵌 seasonId（`rank:{type}:s{n}`），换季 = 新 key 自然从零写，
 * ⛔ 不搬数据；给上季 rank / rank_sub 设 TTL 自然回收（EXPIRE 即惰性 UNLINK 语义，无同步大删，
 * 09·R6 满足）。EXPIRE 重复设置无害 → rotateIfNeeded 可无脑周期调用。
 *
 * 时钟：主循环用 Redis `TIME` 取 nowSec（09·R7 单一权威时钟精神，与 rankUpsert Lua 同源）；
 * rotateIfNeeded(nowSec) 收显式参数，纯逻辑可被测试直接调用。
 */
import { pathToFileURL } from "node:url";
import { LEASE_TTL_S, RANK_OLD_GRACE_S } from "../infra/config";
import { kRank, kRankSub } from "../infra/keys";
import { LeaseLostError, makeHolderId, tryAcquireLease, withLeaseTx } from "../infra/lease";
import type { SingletonLease } from "../infra/lease";
import { closeMysql } from "../infra/mysql";
import { clientForKey, closeRedis } from "../infra/redisRoute";
import { RANK_TYPES } from "./rankService";
import { seasonIdAt, seasonIndexAt } from "./score";

/** 旧季榜保留窗常量已归位 infra/config（07 常量表）：RANK_OLD_GRACE_S。 */
const RANK_OLD_TTL_S = RANK_OLD_GRACE_S;
/** 主循环周期：续租 + 轮换判定。须 < LEASE_TTL_S，取 1/3。 */
const ROTATION_POLL_MS = (LEASE_TTL_S * 1000) / 3;

export interface RotateResult {
  /** nowSec 所属赛季 id（新 key 由打分路径自然创建，轮换不预建）。 */
  seasonId: string;
  /** 本次实际设上 TTL 的旧季 key（EXPIRE 返回 1；不存在/已过期的 key 不计）。 */
  expired: string[];
}

/**
 * 轮换判定（幂等，可重复调用）：给上一季（s{n-1}）的 rank / rank_sub 设 TTL。
 * - 每次调用都重设 TTL（无害）：旧 key 实际在「当季结束后 ~30d」回收，满足「30d 后回收」语义。
 * - 更早的赛季在它们各自作为 s{n-1} 时已设过 TTL，无需回扫。
 * - s0 进行中（n=0）无上一季，no-op。
 */
export async function rotateIfNeeded(nowSec: number, types: readonly string[] = RANK_TYPES): Promise<RotateResult> {
  const n = seasonIndexAt(nowSec);
  const result: RotateResult = { seasonId: seasonIdAt(nowSec), expired: [] };
  if (n < 1) { return result; }

  const prev = `s${n - 1}`;
  for (const type of types) {
    for (const key of [kRank(type, prev), kRankSub(type, prev)]) {
      // 跨用户 key 按整 key 路由（09·R3）；EXPIRE 是 O(1)，不碰成员，无大 key 阻塞
      const set = await clientForKey(key).expire(key, RANK_OLD_TTL_S);
      if (set === 1) { result.expired.push(key); }
    }
  }
  return result;
}

// ───────────────────────── 独立进程入口 ─────────────────────────

/** Redis TIME 取权威秒（与 rankUpsert 的 tie-break 时钟同源）。 */
async function redisNowSec(): Promise<number> {
  const [sec] = await clientForKey(kRank(RANK_TYPES[0], "s0")).time();
  return Number(sec);
}

async function main(): Promise<void> {
  const holder = makeHolderId();
  let lease: SingletonLease | null = null;
  console.log(`[seasonRotation] 启动 holder=${holder}`);

  for (;;) {
    if (!lease) {
      lease = await tryAcquireLease("season_rotation", holder);
      if (!lease) { // 未过期 = 另一实例在任，standby 等待
        await sleep(ROTATION_POLL_MS);
        continue;
      }
      console.log(`[seasonRotation] 抢到租约 fence_token=${lease.fenceToken}`);
    }
    try {
      // 续租守卫（09·X7：守卫第一句，0 行即 LeaseLostError 自杀）。轮换的 Redis 写在事务外，
      // 靠 EXPIRE 幂等兜僵尸窗口（见文件头注）。
      await withLeaseTx(lease, async () => { /* 纯续租，无 MySQL 业务写 */ });
      const r = await rotateIfNeeded(await redisNowSec());
      if (r.expired.length > 0) {
        console.log(`[seasonRotation] 当季=${r.seasonId} 旧季设 TTL: ${r.expired.join(", ")}`);
      }
    } catch (e) {
      if (e instanceof LeaseLostError) {
        console.error("[seasonRotation] 租约被顶替，自杀（09·X7）");
        await Promise.allSettled([closeRedis(), closeMysql()]);
        process.exit(1);
      }
      console.error("[seasonRotation] 轮换失败（下轮重试）:", e);
    }
    await sleep(ROTATION_POLL_MS);
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// main 判定：直接 `tsx src/core/rank/seasonRotation.ts` 运行时才进主循环，被 import 时只导出纯函数
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("[seasonRotation] 致命错误:", e);
    process.exit(1);
  });
}
