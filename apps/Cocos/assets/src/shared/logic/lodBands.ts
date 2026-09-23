/**
 * 投影无关的 LOD 分档：value 越大越精细，0 为最细档。
 * thresholds 是有限正数的严格升序表，N 个阈值划分 0..N 共 N+1 档；空表只有 0 档。
 * value 必须为有限正数；阈值与滞回比例由消费方持有，本模块不修改输入。
 */
function validateInputs(value: number, thresholds: readonly number[]): void {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError("LOD value must be positive and finite");
    let previous = 0;
    for (const threshold of thresholds) {
        if (!Number.isFinite(threshold) || threshold <= previous) {
            throw new RangeError("LOD thresholds must be positive, finite and strictly increasing");
        }
        previous = threshold;
    }
}

/** 无状态分档；value 等于阈值时取更细档。 */
export function lodForValue(value: number, thresholds: readonly number[]): number {
    validateInputs(value, thresholds);
    for (let i = 0; i < thresholds.length; i += 1) {
        if (value < thresholds[i]) return thresholds.length - i;
    }
    return 0;
}

/**
 * 以上一档为基准：达到更细档下界 × (1+r) 才升细，严格低于当前档下界 × (1−r) 才降粗。
 * r 必须在 [0,1) 内；r=0 等价于无状态分档。一次调用可跨任意多档，无需逐帧追赶。
 */
export function lodForValueStable(
    prev: number, value: number, thresholds: readonly number[], hysteresisRatio: number,
): number {
    if (!Number.isInteger(prev) || prev < 0 || prev > thresholds.length) throw new RangeError("prev LOD invalid");
    validateInputs(value, thresholds);
    if (!Number.isFinite(hysteresisRatio) || hysteresisRatio < 0 || hysteresisRatio >= 1) {
        throw new RangeError("LOD hysteresisRatio must be in [0, 1)");
    }
    let lod = prev;
    while (lod > 0 && value >= thresholds[thresholds.length - lod] * (1 + hysteresisRatio)) lod -= 1;
    while (lod < thresholds.length && value < thresholds[thresholds.length - 1 - lod] * (1 - hysteresisRatio)) lod += 1;
    return lod;
}
