/**
 * mmo kit · AI 分桶调度器（kit 内部，MK2-B2；docs/MMO.md §7.2「分桶调度器」/ §7.6「AI 分桶不挤占主 tick」）：
 * 每 tick 只让 `tick % buckets` 那一桶的实体思考；再受本 tick 的 wall 预算（budgetMs）约束——超预算的思考**顺延**到下一 tick（轮转游标保证不饿死），
 * 移动积分仍每 tick 做（不在此）。时钟可注入（单测用假时钟钉预算语义）。
 */
import { bucketOf } from "@game/shared/kits/mmo/api/ai/index";

export interface AiSchedulerOptions {
    readonly buckets: number;
    readonly budgetMs: number;
    readonly now?: () => number;
}

export interface AiSchedulerStats {
    /** 本 tick 思考过的实体数 */
    thought: number;
    /** 本 tick 因预算顺延的实体数 */
    deferred: number;
}

export class AiScheduler {
    readonly buckets: number;
    readonly budgetMs: number;
    private readonly now: () => number;
    /** 顺延队列（上一 tick 没轮到的，下一 tick 优先） */
    private carry: string[] = [];
    readonly stats: AiSchedulerStats = { thought: 0, deferred: 0 };

    constructor(options: AiSchedulerOptions) {
        this.buckets = Math.max(1, Math.floor(options.buckets));
        this.budgetMs = Math.max(0, options.budgetMs);
        this.now = options.now ?? (() => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()));
    }

    /** 本 tick 该思考的 id：顺延的在前，再加本桶的（去重、保持序）。 */
    due(ids: Iterable<string>, tick: number): string[] {
        const bucket = tick % this.buckets;
        const out: string[] = [...this.carry];
        const seen = new Set(out);
        for (const id of ids) {
            if (this.buckets > 1 && bucketOf(id, this.buckets) !== bucket) continue;
            if (!seen.has(id)) { seen.add(id); out.push(id); }
        }
        this.carry = [];
        return out;
    }

    /** 在预算内逐个调用 think；超预算的顺延到下一 tick（保持顺序）。 */
    run(ids: readonly string[], think: (id: string) => void): void {
        const startedAt = this.now();
        this.stats.thought = 0;
        this.stats.deferred = 0;
        let index = 0;
        for (; index < ids.length; index += 1) {
            if (index > 0 && this.now() - startedAt >= this.budgetMs) break;
            think(ids[index]!);
            this.stats.thought += 1;
        }
        if (index < ids.length) {
            this.carry = ids.slice(index);
            this.stats.deferred = this.carry.length;
        }
    }

    forget(id: string): void {
        this.carry = this.carry.filter((entry) => entry !== id);
    }

    reset(): void {
        this.carry = [];
        this.stats.thought = 0;
        this.stats.deferred = 0;
    }
}
