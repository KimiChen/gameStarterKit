/**
 * 排行榜协议 —— 双端共享的线上排行数据契约 + 段位公式（取自公司标准实现，与 Arthur 项目同源）。
 *
 * 服务端排行走 Redis ZSET（server/src/rank/），HTTP/RPC 端点自建时沿用本契约；
 * 客户端 FairyGUI 排行榜示例（game/ui/rankRows + fgui/RankView）当前用假数据
 * （rankFakeData）喂同一份 RankListResponse，接真数据时 UI/presenter 不动。
 * 归一（star→段位、avatarId 钳位、省份按 tab 替换、本人行覆盖）全在客户端纯 presenter。
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
