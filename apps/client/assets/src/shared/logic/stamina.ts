/**
 * 体力系统纯函数 —— 双端共享（回流自 Arthur，核心算法原样；包装改按字段档模型）。
 *
 * 档字段（user:{uid}，见 docs/server/07）：
 *   stamina             当前体力（建号即满，wxLogin 初始化）
 *   lastStaminaRecoverAt 恢复计时起点（ms）；0 = 满体力/未开始恢复
 *
 * 客户端用同一份函数做本地展示与倒计时，服务端为唯一真源；
 * nowMs 一律传服务端权威时间（房间内用服务端时钟，HTTP 侧配 GET /clock/now 对时）。
 */
import { STAMINA_COST, STAMINA_MAX, STAMINA_REGEN_MS } from "../constants/game";

/** 体力两字段（对应 user 档同名字段）。 */
export interface IStaminaFields {
    stamina: number;
    lastStaminaRecoverAt: number;
}

/**
 * 按经过时间恢复体力（每 regenMs 回 1，上限 max；进位保留余数）。
 * 满则计时器归 now。返回新的 {stamina, lastRecoverAt}，不改入参。
 */
export function recomputeStamina(
    stamina: number,
    lastRecoverAt: number,
    nowMs: number,
    max = STAMINA_MAX,
    regenMs = STAMINA_REGEN_MS,
): { stamina: number; lastRecoverAt: number } {
    if (stamina >= max) return { stamina: max, lastRecoverAt: nowMs }; // 满：计时器重置到 now
    const base = lastRecoverAt > 0 ? lastRecoverAt : nowMs;
    const gained = Math.max(0, Math.floor((nowMs - base) / regenMs));
    const next = Math.min(max, stamina + gained);
    if (next >= max) return { stamina: max, lastRecoverAt: nowMs };
    return { stamina: next, lastRecoverAt: base + gained * regenMs }; // 未满：进位保留恢复余数
}

/**
 * 消耗体力开局（先恢复再扣）。不足则 ok=false 不扣（仍返回恢复后的字段供回写）。
 */
export function spendStamina(
    fields: IStaminaFields,
    nowMs: number,
    max = STAMINA_MAX,
    regenMs = STAMINA_REGEN_MS,
    cost = STAMINA_COST,
): { fields: IStaminaFields; ok: boolean } {
    const r = recomputeStamina(fields.stamina, fields.lastStaminaRecoverAt, nowMs, max, regenMs);
    const recovered: IStaminaFields = { stamina: r.stamina, lastStaminaRecoverAt: r.lastRecoverAt };
    if (r.stamina < cost) return { fields: recovered, ok: false };
    const wasFull = r.stamina >= max;
    return {
        fields: {
            stamina: r.stamina - cost,
            // 从满体力扣下来的那一刻起表（否则沿用原恢复计时，余数不丢）
            lastStaminaRecoverAt: wasFull ? nowMs : r.lastRecoverAt,
        },
        ok: true,
    };
}

/** 展示信息：{stamina, max, msToNext(到下一点毫秒，满=0)}。UI 显示 X/max + 倒计时。 */
export function staminaInfo(
    fields: IStaminaFields,
    nowMs: number,
    max = STAMINA_MAX,
    regenMs = STAMINA_REGEN_MS,
): { stamina: number; max: number; msToNext: number } {
    const r = recomputeStamina(fields.stamina, fields.lastStaminaRecoverAt, nowMs, max, regenMs);
    if (r.stamina >= max) return { stamina: max, max, msToNext: 0 };
    return { stamina: r.stamina, max, msToNext: Math.max(0, regenMs - (nowMs - r.lastRecoverAt)) };
}
