/**
 * 排行榜协议 —— 双端共享的线上排行数据契约 + 段位公式（取自公司标准实现，与 Arthur 项目同源）。
 *
 * 服务端排行走 Redis ZSET（server/src/rank/），真实端点 POST /rank/report、/rank/list
 * （server/src/routes）沿用本契约；客户端视图接入时按 RankListResponse 渲染，
 * 归一（star→段位、avatarId 钳位、省份按 tab 替换、本人行覆盖）应放在客户端纯 presenter。
 */

/** 榜类型：总榜（全国 country） / 省榜（province）。 */
export const RankScope = { Country: "country", Province: "province" } as const;
export type RankScopeValue = (typeof RankScope)[keyof typeof RankScope];

/** `-1` = 未上榜。用作 `ranking`/`selfRanking` 的哨兵。 */
export const RANK_UNLISTED = -1;

/** 一条排行榜行。presenter 负责归一显示。 */
export interface RankEntry {
    userId: string;
    /** 名次位置；`RANK_UNLISTED`(-1) = 未上榜。 */
    ranking: number;
    /** 段位星数；presenter 经 `decodeRank` → 段/级/皇帝。 */
    star: number;
    /** 昵称；空 → presenter 补“无名”。 */
    nick: string;
    /** 头像下标；presenter 钳 1..16、越界/-1 → 1。 */
    avatarId: number;
    /** 省份；空 → presenter 补“未知”；**省榜下被本地玩家省份覆盖**。 */
    province: string;
}

/** 排行榜查询请求（客户端 → 服务端）。 */
export interface RankQuery {
    scope: RankScopeValue;
    userId: string;
    token: string;
    /** 季/榜类型常量（历史语义，原样保留，默认 3）。 */
    type?: number;
}

/** 排行榜响应。 */
export interface RankListResponse {
    /** 榜行（服务端已按 star 降序）。 */
    rankList: RankEntry[];
    /** 本人名次；`RANK_UNLISTED`(-1) = 未上榜。行内容由本地档覆盖（见 presenter self 行）。 */
    selfRanking: number;
}

// ---------------- 好友榜（微信开放数据域托管 KV，回流自 Arthur） ----------------

/** 微信托管 KV 的 key（开放数据域子域按此读 getFriendCloudStorage）。 */
export const FRIEND_RANK_KV_KEY = "game_rank_v1";

/** KV value 的 JSON 结构（≤1KB，微信硬限制；短键省字节）。 */
export interface FriendRankValue {
    /** 榜分（服务端权威 star） */
    s: number;
    /** 段号（decodeRank.rank） */
    r: number;
    /** 段内级 */
    l: number;
    /** 昵称（仅开放数据域内展示） */
    n: string;
    /** 上报时间戳（秒） */
    t: number;
}

/**
 * 服务端签发的托管 KV 载荷（防好友榜刷分的关键）：/rank/report 回包附带，客户端**原样**
 * 写入 wx.setUserCloudStorage，⛔ 不得自行组装分数——分数出自权威榜，客户端无从刷分。
 */
export interface FriendRankKvPayload {
    key: string;
    /** JSON.stringify(FriendRankValue) */
    value: string;
}

/** POST /rank/report 请求（客户端只报胜负，分数由服务端经 advanceCurStar 推导）。 */
export interface RankReportReq {
    token: string;
    /** 对局 id：服务端按 (matchId, uid) 幂等，重试必须复用 */
    matchId: string;
    result: "win" | "lose";
}

/** POST /rank/report 响应。 */
export interface RankReportRes {
    ok: boolean;
    /** 幂等重放命中（分数未变） */
    dup: boolean;
    /** 上报后的权威 star */
    star: number;
    friendKv: FriendRankKvPayload;
}

// ---------------- 段位公式（公司标准，忠实原版阶梯） ----------------

/**
 * 段位阶梯每段等级上限：0-49 段皆 5 星；皇帝 50/51/52/53 段为 25/50/75/100。index=段号。
 */
export const RANK_LEVEL_CAPS: readonly number[] = [
    ...Array<number>(50).fill(5), 25, 50, 75, 100,
];

/** star 理论上界（段 53 × cap 100 之上）= 250 + 100。 */
export const MAX_CUR_STAR = 250 + RANK_LEVEL_CAPS[53];

/** star → {段, 级}。 */
export function decodeRank(curStar: number): { rank: number; level: number } {
    if (curStar <= 250) {
        let e = Math.floor(curStar / 5);
        let d = curStar - 5 * e;
        if (d === 0) {
            if (curStar === 0) return { rank: 0, level: 1 };
            e -= 1;
            d = 5;
        }
        return { rank: Math.min(49, Math.max(0, e)), level: d };
    }
    const p = Math.max(1, curStar - 250);
    if (p <= RANK_LEVEL_CAPS[50]) return { rank: 50, level: p };
    if (p <= RANK_LEVEL_CAPS[51]) return { rank: 51, level: p };
    if (p <= RANK_LEVEL_CAPS[52]) return { rank: 52, level: p };
    return { rank: 53, level: p };
}

/** {段, 级} → star。 */
export function encodeRank(rank: number, level: number): number {
    return rank <= 49 ? 5 * rank + level : 250 + Math.max(1, level);
}

/**
 * 段位星数推进（公司标准 54 段阶梯，与上方 decode/encode 同源；含皇帝 50-53 段处理）。
 * 解码 curStar → 级±1 → 按段位上限处理升/降段 → 重编码。
 * 全域等价于 curStar±1，两处例外：未定级 curStar=0 时胜→2/负→1（源实现语义）；
 * 负向在 curStar=1 处钳住（star 0 与 1 同为「段0 1星」，1 是地板，负不到 0）。
 * 服务端 /rank/report 用它由「胜负」推导分数（⛔ 客户端不许直接报分数）。
 * 注意：皇帝段（50-53）的 level 是跨段累计值（对应 decodeRank 的 p），升段时不重置。
 */
export function advanceCurStar(curStar: number, isWin: boolean): number {
    const { rank, level } = decodeRank(curStar);
    let m = rank;
    let k = level + (isWin ? 1 : -1);
    if (isWin) {
        if (k > RANK_LEVEL_CAPS[m] && m !== 53) { m += 1; if (m <= 50) { k = 1; } }
    } else if (m > 50) {
        if (k <= RANK_LEVEL_CAPS[m - 1]) { k = RANK_LEVEL_CAPS[m - 1]; m -= 1; }
    } else if (m > 0) {
        if (k <= 0) { m -= 1; if (m >= 0) { k = RANK_LEVEL_CAPS[m]; } }
    } else if (k <= 0) {
        k = 1; // 段 0 且降到 0 级：钳回 1 级
    }
    return Math.min(MAX_CUR_STAR, encodeRank(m, k));
}

/**
 * 载入后段位校正：把越界/非法 curStar 夹回 [0, MAX_CUR_STAR]。
 * 服务端为唯一真源时仅做防御性钳位；引入本地缓存/多端时再按局数取大合并。
 */
export function finalizeCurStar(curStar: number): number {
    if (!Number.isFinite(curStar) || curStar < 0) return 0;
    return Math.min(MAX_CUR_STAR, Math.floor(curStar));
}

/** 当前段位的周期领奖金额。rewardTable = 配置表各段 reward（表驱动，游戏自定数值）。 */
export function rankRewardFor(curStar: number, rewardTable: readonly number[]): number {
    const { rank } = decodeRank(curStar);
    return rewardTable[rank] ?? 0;
}

/** 段位/军衔展示标签。rankNames = 配置表各段名；返回 {军衔名, 星级, 显示串}。 */
export function rankLabel(curStar: number, rankNames: readonly string[]): { name: string; level: number; text: string } {
    const { rank, level } = decodeRank(curStar);
    const name = rankNames[rank] ?? `段位${rank}`;
    return { name, level, text: `${name} ${level}★` };
}
