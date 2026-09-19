/**
 * 兴趣集（MMO MF5a-B2，docs/MMO.md §4.3）：会话 → 「实体 id → 修订号」视图 + 版本号。
 *
 * 候选来自 mode（网格 / 视距 / 可见性规则），框架只负责记住上一版视图、算出 enter / update / leave 三类差分
 * 并推进版本号；⛔ 不做任何空间判断。差分内部按 id 升序（确定性：同一输入同一输出，测试与回放可钉）。
 * 有界：一个会话的视图超过 `maxEntities` 即 fail-closed（mode 的视距没有收敛是实现缺陷，⛔ 不静默截断）。
 */
import { OBSERVER_SYNC_LIMITS } from "@game/shared";

/** 实体 id → 修订号（修订号变化 = 该实体的可见投影变了）。 */
export type InterestView = ReadonlyMap<string, number>;

export interface InterestDiff {
    /** 上一版没有、这一版有：完整投影（enter）。 */
    readonly entered: readonly string[];
    /** 两版都有但修订号不同：变化投影（update）。 */
    readonly updated: readonly string[];
    /** 上一版有、这一版没有：只发 id（leave）。 */
    readonly left: readonly string[];
}

export interface InterestReplaceResult {
    /** 该会话视图版本号：有任何差分才 +1（无变化不推进）。 */
    readonly version: number;
    readonly diff: InterestDiff;
}

const EMPTY_VIEW: InterestView = new Map();
const sortIds = (ids: string[]): readonly string[] => ids.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

export class InterestSet {
    private readonly bySession = new Map<string, { version: number; view: Map<string, number> }>();

    constructor(private readonly maxEntities: number = OBSERVER_SYNC_LIMITS.interestMaxEntities) {
        if (!Number.isSafeInteger(maxEntities) || maxEntities < 1 || maxEntities > OBSERVER_SYNC_LIMITS.interestMaxEntities) {
            throw new RangeError(`[InterestSet] maxEntities 必须是 1..${OBSERVER_SYNC_LIMITS.interestMaxEntities} 的整数（§11.2 只许收紧）`);
        }
    }

    /** 当前视图版本；未知会话为 0。 */
    version(session: string): number {
        return this.bySession.get(session)?.version ?? 0;
    }

    /** 当前视图（只读快照）；未知会话为空。 */
    view(session: string): InterestView {
        return this.bySession.get(session)?.view ?? EMPTY_VIEW;
    }

    /** 用新视图替换旧视图并返回差分；差分为空时版本号不动。 */
    replace(session: string, next: InterestView): InterestReplaceResult {
        if (next.size > this.maxEntities) {
            throw new RangeError(`[InterestSet] 会话 ${session} 的兴趣集 ${next.size} 超过上限 ${this.maxEntities}——mode 的视距未收敛`);
        }
        const entry = this.bySession.get(session) ?? { version: 0, view: new Map<string, number>() };
        const entered: string[] = [];
        const updated: string[] = [];
        const left: string[] = [];
        for (const [id, rev] of next) {
            if (!Number.isSafeInteger(rev)) throw new TypeError(`[InterestSet] 实体 ${id} 的修订号必须是整数`);
            const previous = entry.view.get(id);
            if (previous === undefined) entered.push(id);
            else if (previous !== rev) updated.push(id);
        }
        for (const id of entry.view.keys()) {
            if (!next.has(id)) left.push(id);
        }
        const diff: InterestDiff = { entered: sortIds(entered), updated: sortIds(updated), left: sortIds(left) };
        const changed = entered.length > 0 || updated.length > 0 || left.length > 0;
        entry.view = new Map(next);
        if (changed) entry.version += 1;
        this.bySession.set(session, entry);
        return { version: entry.version, diff };
    }

    /** 直接设定视图而不产生差分（baseline 之后：客户端已拿到完整集合，后续差分相对它）。 */
    rebase(session: string, next: InterestView): number {
        if (next.size > this.maxEntities) {
            throw new RangeError(`[InterestSet] 会话 ${session} 的兴趣集 ${next.size} 超过上限 ${this.maxEntities}——mode 的视距未收敛`);
        }
        const entry = this.bySession.get(session) ?? { version: 0, view: new Map<string, number>() };
        entry.view = new Map(next);
        entry.version += 1;
        this.bySession.set(session, entry);
        return entry.version;
    }

    remove(session: string): void {
        this.bySession.delete(session);
    }

    sessions(): readonly string[] {
        return [...this.bySession.keys()];
    }
}
