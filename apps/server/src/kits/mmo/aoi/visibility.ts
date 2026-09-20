/**
 * mmo kit · 可见性规则（kit 内部模块，docs/MMO.md §4.3「授权由 kit 可见性规则（隐身 / 阵营 / 位面）决定」；MK1-B2）：
 *  - 位面：只看得见同 plane 的实体（编排 / 副本分相位用；缺省 0）；
 *  - 隐身：stealth 实体只对自己与同阵营可见（无阵营的观察者——怪物、中立——看不见）；
 *  - 本人永远看得见自己。
 * `pickInterest` 把网格候选收敛成兴趣集：精确视距 → 规则 → 最近优先（距离平方、再 id）→ 截到上限（框架 InterestSet 超限即抛，kit 必须先收敛）。
 */
export interface IVisibilityFacts {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly plane: number;
    readonly stealth: boolean;
    readonly factionId: string | null;
}

export function canSee(viewer: IVisibilityFacts, target: IVisibilityFacts): boolean {
    if (viewer.id === target.id) return true;
    if (viewer.plane !== target.plane) return false;
    if (target.stealth && (viewer.factionId === null || viewer.factionId !== target.factionId)) return false;
    return true;
}

export interface IInterestPick<T extends IVisibilityFacts> {
    readonly entity: T;
    readonly distanceSq: number;
}

/** 候选 → 兴趣集（视距内 + 规则通过 + 最近优先截到 cap；本人距离 0 必在首位）。 */
export function pickInterest<T extends IVisibilityFacts>(viewer: T, candidates: Iterable<T>, radius: number, cap: number): IInterestPick<T>[] {
    const radiusSq = radius * radius;
    const picked: IInterestPick<T>[] = [];
    for (const entity of candidates) {
        const dx = entity.x - viewer.x;
        const dy = entity.y - viewer.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > radiusSq) continue;
        if (!canSee(viewer, entity)) continue;
        picked.push({ entity, distanceSq });
    }
    picked.sort((left, right) => left.distanceSq - right.distanceSq || (left.entity.id < right.entity.id ? -1 : left.entity.id > right.entity.id ? 1 : 0));
    return picked.length > cap ? picked.slice(0, cap) : picked;
}
