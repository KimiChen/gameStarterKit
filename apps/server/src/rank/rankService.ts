/**
 * 排行服务（M7，[03 · 排行榜](../../../../docs/server/03-gateway-data-layer.md#排行榜)）。
 *
 * - 更新分：per (matchId, uid) 去重（09·K2）→ rankUpsert 单条 Lua（09·K1）。
 *   matchId 在 M8 才接线（`startMatch` 生成，09·K4）——M7 用合成 matchId 跑测试。
 * - 取榜：两段式（ZSET 只管排序 + rank_sub 批量 hydrate），避免 N+1；自己未上榜补头部。
 * - 发奖：⏸ 等 M0 rating 拍板 + M6 outbox，本文件只留接口（见文末 TODO）。
 *
 * ⚠ Cluster 风险（待 M0 Sentinel vs Cluster 拍板，Sentinel/单实例形态无碍）：
 *   ① `lb:dedup:{matchId}:{uid}` 与 `rank:{type}:{season}` 分属不同 slot/实例；
 *   ② getRank 的 `HMGET rank_sub` 单 key 无碍，但 rank 与 rank_sub 两 key 不同槽，
 *      rankUpsert Lua 会 CROSSSLOT（见 rankScripts.ts 头注）；
 *   ③ 分片路由（redisRoute 多 durable 实例）下 rank 与 rank_sub 按整 key hash 可能落不同实例——
 *      当前默认单 durable 无此问题，分片前须给两 key 统一 hash-tag（09·S2 expand→contract）。
 */
import { RANK_OLD_GRACE_S, SEASON_BASE, SEASON_LEN_S } from "../infra/config";
import { kLbDedup, kRank, kRankProv, kRankSub } from "../infra/keys";
import { clientForKey } from "../infra/redisRoute";
import { evalshaWithReload } from "../infra/redisScripts";
import { RANK_UPSERT } from "./rankScripts";
import { decodeScore, seasonIndexAt, seasonStartSec } from "./score";

/**
 * 榜类型注册表（key 的 `{type}` 段）。现阶段为段位星数榜（客户端契约 shared/protocol/rank.ts
 * 的 star 分）；省榜是同 type 下的子榜（updateScore/getRank 的 province 参数，非独立 type）。
 * seasonRotation 按此表给旧季**总榜** key 设 TTL（省榜 TTL 写路径自管理，见 provKeyTtlSec）。
 */
export const RANK_TYPES: readonly string[] = ["star"];

/** lb:dedup TTL = 7d（07 key 全表）。⚠ 常量应归 infra/config（09 审查第 6 条），本次任务 infra 冻结，暂置于此。 */
const LB_DEDUP_TTL_MS = 7 * 86_400_000;

/** 省名 → key 段（encodeURIComponent：中文省名转安全 ASCII，无冒号/花括号）。 */
export const encodeProvince = (province: string): string => encodeURIComponent(province);

/**
 * 省榜 key TTL（秒）：当季剩余 + 旧季回收窗（RANK_OLD_GRACE_S）。省份数量不定，
 * seasonRotation 不遍历省榜键，改为写路径逐次 EXPIRE 自管理（幂等刷新，语义同旧季回收）。
 */
export function provKeyTtlSec(nowSec: number): number {
  const seasonEnd = seasonStartSec(seasonIndexAt(nowSec) + 1);
  return Math.max(60, seasonEnd - nowSec) + RANK_OLD_GRACE_S;
}

/** 榜行展示信息（rank_sub 的 JSON value，昵称/头像等，由结算方提供）。 */
export type RankSubInfo = Record<string, unknown>;

/** 取榜返回的一条。rank = -1 表示未上榜（对齐 shared/protocol/rank.ts 的 RANK_UNLISTED）。 */
export interface RankEntry {
  rank: number;
  uid: string;
  /** decodeScore 后的整数分（tie-break 小数不出服务层）。 */
  score: number;
  sub: RankSubInfo;
  /** 补进头部的本人行标记。 */
  self?: boolean;
}

/**
 * 更新分。去重键 `lb:dedup:{matchId}:{uid}` **必须 per (matchId, uid)**（09·K2）：
 * 一局 ≥2 名玩家，只按 matchId 去重会让第二名起全部丢更新。
 *
 * 幂等语义：SET NX **执行前**占位（09·I1 精神）——抢到才写榜，重放返回 'dup'。
 * ⚠ 已知窗口：占位成功后、Lua 执行前进程崩溃 → 该局更新丢失（at-most-once）。
 *   反过来先写后占位是重复累加（更糟）。M8 结算接线后由 stream:match 证据链兜底对账。
 */
export async function updateScore(
  type: string, season: string, uid: string,
  delta: number, matchId: string, subInfo: RankSubInfo,
  province?: string,
): Promise<"ok" | "dup"> {
  const dedupKey = kLbDedup(matchId, uid);
  // dedup key 与 rank key 分属不同 slot（Cluster 形态待 M0 拍板；sentinel/单实例下无碍）
  const got = await clientForKey(dedupKey).set(dedupKey, "1", "PX", LB_DEDUP_TTL_MS, "NX");
  if (!got) { return "dup"; }

  const rankKey = kRank(type, season);
  const argv = [uid, String(delta), String(SEASON_BASE), String(SEASON_LEN_S), JSON.stringify(subInfo)];
  await evalshaWithReload(
    clientForKey(rankKey), RANK_UPSERT,
    [rankKey, kRankSub(type, season)],
    argv,
  );

  // 省榜双写（07 key 全表 `rank:{type}:prov:*`）：同一 Lua、同一 rank_sub（HSET 幂等重写无害）。
  // 总榜与省榜两次 upsert 非原子——中间崩溃省榜少一次更新，下局自愈，可接受（榜是派生数据）。
  if (province) {
    const provKey = kRankProv(type, encodeProvince(province), season);
    const provClient = clientForKey(provKey);
    await evalshaWithReload(provClient, RANK_UPSERT, [provKey, kRankSub(type, season)], argv);
    const [sec] = await provClient.time(); // 与 rankUpsert 同源的权威时钟（09·R7）
    await provClient.expire(provKey, provKeyTtlSec(Number(sec)));
  }
  return "ok";
}

/**
 * 两段式取榜（03）：① ZREVRANGE WITHSCORES 拿名次页 ② HMGET rank_sub 批量 hydrate。
 * ⚠ ioredis 的 hmget 返回与请求字段**顺序对齐的数组**（缺失为 null），不是对象——自己 zip（09·R9）。
 * 自己未上榜（ZREVRANK 为 null）→ 补 selfEntry 放头部。
 * ⚠ Cluster 下多 uid hydrate 的 CROSSSLOT 风险不在这里（rank_sub 是单 key HMGET），
 *   在 rank 与 rank_sub 两 key 异槽——见文件头注，待 M0 拍板。
 */
export async function getRank(
  type: string, season: string, uid: string, start: number, len: number,
  province?: string,
): Promise<RankEntry[]> {
  if (len <= 0) { return []; }
  const rankKey = province ? kRankProv(type, encodeProvince(province), season) : kRank(type, season);
  const subKey = kRankSub(type, season);
  const client = clientForKey(rankKey);

  const raw = await client.zrevrange(rankKey, start, start + len - 1, "WITHSCORES");
  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    ids.push(raw[i]);
    scores.push(Number(raw[i + 1]));
  }
  const subs = ids.length ? await client.hmget(subKey, ...ids) : [];

  const list: RankEntry[] = ids.map((id, i) => ({
    rank: start + i + 1,
    uid: id,
    score: decodeScore(scores[i]),
    sub: JSON.parse(subs[i] ?? "{}") as RankSubInfo,
    ...(id === uid ? { self: true } : {}),
  }));

  // 自己未上榜 → 单独补一条放头部（03；上榜但不在本页不补，客户端按需另查 selfEntry）
  const myRank = await client.zrevrank(rankKey, uid);
  if (myRank === null) { list.unshift(await selfEntry(type, season, uid, province)); }
  return list;
}

/** 本人行（07 契约）。未上榜 rank = -1、score = 0（对齐 shared 的 RANK_UNLISTED 哨兵）。 */
export async function selfEntry(type: string, season: string, uid: string, province?: string): Promise<RankEntry> {
  const rankKey = province ? kRankProv(type, encodeProvince(province), season) : kRank(type, season);
  const client = clientForKey(rankKey);
  const [myRank, myScore, mySub] = await Promise.all([
    client.zrevrank(rankKey, uid),
    client.zscore(rankKey, uid),
    client.hget(kRankSub(type, season), uid),
  ]);
  return {
    rank: myRank === null ? -1 : myRank + 1,
    uid,
    score: myScore === null ? 0 : decodeScore(Number(myScore)),
    sub: JSON.parse(mySub ?? "{}") as RankSubInfo,
    self: true,
  };
}

// ───────────────────────── 发奖（⏸ 仅接口，10 裁剪表允许顺延） ─────────────────────────

/**
 * 赛季发奖接口。⏸ 实现挂起：依赖 M0 rating 算法拍板（Elo vs Glicko-2 → rank_award/rank_snapshot
 * 表结构）+ M6 outbox 发放通道。顺延即接受「ranked 只打不发奖」的降级形态（10 裁剪表）。
 *
 * TODO(M7-发奖，实现时逐条对照)：
 * - 发奖状态落 MySQL `rank_award UNIQUE(season, uid)`，⛔ 不只存 Redis（09·K3）；
 * - ranked 延迟到无头重放校验通过（pending → commit），发奖类结算强制 100% 校验（09·K3）；
 * - 发放走 outbox（deriveOpId 新 op_id）；`verdict=suspect` 走 clawback（反向 op_id，负数下溢守卫 09·X8）；
 * - 榜是派生数据：发奖前 top-N 快照进 `rank_snapshot`（防 Redis 丢导致榜和领奖状态一起没）。
 */
export interface RankAwardService {
  /** 结算指定赛季的 top-N 奖励（幂等：rank_award UNIQUE 兜底）。 */
  grantSeasonAwards(type: string, season: string): Promise<void>;
}
