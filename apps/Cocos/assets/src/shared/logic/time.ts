/**
 * 时间/自然日纯函数 —— 双端共享（回流自 Arthur）。
 *
 * 自然日边界显式使用 UTC+offset，而不是宿主本地时区。这样服务端/客户端在不同
 * TZ、容器和小游戏 JSCore 中仍得到同一结果；权威判定一律以服务端为准。
 */

/**
 * 返回指定业务时区的自然日序号。`offsetMinutes` 是 UTC 偏移（例如中国标准时间
 * 为 `480`），不得依赖进程 `TZ`。输入时间戳按毫秒解释。
 */
export function naturalDayIndex(ms: number, offsetMinutes = 0): number {
    if (!Number.isFinite(ms) || !Number.isFinite(offsetMinutes)
        || !Number.isInteger(offsetMinutes) || offsetMinutes < -24 * 60 || offsetMinutes > 24 * 60) {
        throw new RangeError("invalid natural-day timestamp or UTC offset");
    }
    return Math.floor((ms + offsetMinutes * 60_000) / 86_400_000);
}

/** 两时间戳是否跨了指定 UTC 偏移的自然日。lastMs<=0（首次）不算跨日。 */
export function isNewNaturalDay(lastMs: number, nowMs: number, offsetMinutes = 0): boolean {
    if (lastMs <= 0) return false;
    return naturalDayIndex(nowMs, offsetMinutes) > naturalDayIndex(lastMs, offsetMinutes);
}
