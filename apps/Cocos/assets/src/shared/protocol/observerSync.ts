/**
 * 观察者同步（MMO MF5a，docs/MMO.md §4.3 / §5.4 MF5a）的双端共用原语——零依赖（铁律 4）。
 *
 * - `wireChecksum`：canonical 键序 + FNV-1a 32 位；baseline / delta 用它发现缺块 / 乱序 / 错误投影，
 *   ⛔ 不承担密码学身份。算法与 snake 的 `snakeWireChecksum` 逐字相同（snake 是已安装插件，⛔ 不改它来复用）。
 * - `OBSERVER_SYNC_LIMITS`：框架侧有界原语的缺省上限（rooms/core/{InterestSet,OutboundQueue,Baseline}），
 *   mode 的 wire validator 也按它钉 chunk 上限；数字登记在 MMO.md §11.2（MF5a 候选值，MK1 实测后只许收紧）。
 */

/** Canonical key ordering + FNV-1a 32-bit；8 位十六进制。 */
export function wireChecksum(value: unknown): string {
    const canonical = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map(canonical);
        if (input !== null && typeof input === "object") {
            const record = input as Record<string, unknown>;
            const result: Record<string, unknown> = {};
            for (const key of Object.keys(record).sort()) result[key] = canonical(record[key]);
            return result;
        }
        return input;
    };
    const text = JSON.stringify(canonical(value));
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 观察者同步的框架缺省上限（MMO.md §11.2；构造期可注入更小的值，⛔ 不得放大）。 */
export const OBSERVER_SYNC_LIMITS = Object.freeze({
    /** 一次 baseline 每块最多条目（snake `snapshotChunkItems` 同值先例）。 */
    baselineChunkItems: 128,
    /** 一个会话的兴趣集最多实体数；超过 = mode 的网格 / 视距没有收敛，fail-closed。 */
    interestMaxEntities: 512,
    /** 一个会话出站队列最多积压消息数；超限丢弃可合并类并标记重同步，不可丢类照留。 */
    outboundQueueMaxMessages: 256,
});

/** 单 seq 流信封：同一会话的 enter / update / leave / baseline 共用一条单调递增的 seq。 */
export interface IObserverEnvelope {
    /** 会话内单调递增（从 1 起）；重连 / 重同步后由 baseline 的 seq 续接。 */
    readonly seq: number;
    /** 生成该消息时的房间 tick。 */
    readonly tick: number;
}
