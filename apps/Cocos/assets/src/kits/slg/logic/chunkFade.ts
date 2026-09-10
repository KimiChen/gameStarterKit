/** chunk 建销淡入淡出驱动：纯状态机，渲染器按 advance 的 changed 集合做顶点 alpha 重建。 */
export const SLG_CHUNK_FADE_MS = 240;
/** 同屏并发淡出上限；超限的新淡出退化为硬销（整档切换/刷新等批量场景不淡）。 */
export const SLG_CHUNK_FADE_MAX_CONCURRENT = 12;

export interface SlgFadeChange { readonly key: number; readonly alpha: number }

/**
 * 每个 key 一条 { direction, alpha }：淡入从 0 升到 1、淡出从当前值降到 0；
 * 反向操作在半途直接掉头（不跳变）。finishedOut 的 key 由渲染器销毁。
 */
export class ChunkFadeTracker {
    private readonly entries = new Map<number, { direction: 1 | -1; alpha: number }>();

    get size(): number { return this.entries.size; }

    beginIn(key: number): void {
        const entry = this.entries.get(key);
        if (entry) { entry.direction = 1; return; }
        this.entries.set(key, { direction: 1, alpha: 0 });
    }

    /** false = 并发淡出超限，调用方应硬销而不再入队。 */
    beginOut(key: number): boolean {
        const entry = this.entries.get(key);
        if (entry) { entry.direction = -1; return true; }
        if (this.entries.size >= SLG_CHUNK_FADE_MAX_CONCURRENT) return false;
        this.entries.set(key, { direction: -1, alpha: 1 });
        return true;
    }

    cancel(key: number): void { this.entries.delete(key); }

    clear(): void { this.entries.clear(); }

    alphaOf(key: number): number { return this.entries.get(key)?.alpha ?? 1; }

    advance(dtMs: number): { changed: SlgFadeChange[]; finishedIn: number[]; finishedOut: number[] } {
        const changed: SlgFadeChange[] = [];
        const finishedIn: number[] = [];
        const finishedOut: number[] = [];
        if (!Number.isFinite(dtMs) || dtMs < 0) throw new RangeError("SLG fade dt invalid");
        for (const [key, entry] of this.entries) {
            entry.alpha = Math.max(0, Math.min(1, entry.alpha + entry.direction * dtMs / SLG_CHUNK_FADE_MS));
            changed.push({ key, alpha: entry.alpha });
            if (entry.direction === 1 && entry.alpha >= 1) finishedIn.push(key);
            if (entry.direction === -1 && entry.alpha <= 0) finishedOut.push(key);
        }
        for (const key of finishedIn) this.entries.delete(key);
        for (const key of finishedOut) this.entries.delete(key);
        return { changed, finishedIn, finishedOut };
    }
}
