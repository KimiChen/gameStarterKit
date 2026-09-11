import type { VirtualCollectionKey, VirtualListDataSource } from './virtual-data-source.js';
export type VirtualDirection = 'vertical' | 'horizontal';
export type VirtualAlign = 'start' | 'center' | 'end' | 'nearest';
export interface VirtualRange {
    readonly start: number;
    readonly end: number;
    readonly firstVisible: number;
    readonly lastVisible: number;
}
export interface VirtualCollectionMetrics {
    readonly logicalItems: number;
    readonly physicalSlots: number;
    readonly visibleStart: number;
    readonly visibleEnd: number;
    readonly rebinds: number;
    readonly created: number;
    readonly destroyed: number;
    readonly layoutMs: number;
    readonly anchorKey: string | null;
}
export interface VirtualCollectionController<Key extends VirtualCollectionKey = VirtualCollectionKey> {
    scrollToIndex(index: number, align?: VirtualAlign, duration?: number): void;
    scrollToKey(key: Key, align?: VirtualAlign, duration?: number): void;
    getVisibleRange(): VirtualRange;
    getMetrics(): VirtualCollectionMetrics;
    invalidateSize(index?: number): void;
    stopScroll(): void;
}
export interface VirtualPlacement {
    readonly index: number;
    readonly lane: number;
    readonly mainOffset: number;
    readonly crossOffset: number;
    readonly mainSize: number;
    readonly crossSize: number;
}
export interface VirtualGroupHeaderPlacement {
    readonly firstIndex: number;
    readonly mainOffset: number;
}
export declare class FenwickTree {
    private values;
    private tree;
    constructor(length: number, initialValue?: number);
    get length(): number;
    get total(): number;
    get(index: number): number;
    set(index: number, value: number): boolean;
    resize(length: number, initialValue?: number): void;
    splice(index: number, deleteCount: number, insertCount: number, initialValue?: number): void;
    replace(values: readonly number[]): void;
    /** Sum of [0, end). */
    prefix(end: number): number;
    /** First index whose item intersects offset. */
    indexAtOffset(offset: number): number;
    private rebuild;
}
export interface VirtualListModelOptions {
    readonly itemCount: number;
    readonly viewportSize: number;
    readonly itemSize?: number;
    readonly estimatedItemSize?: number;
    readonly gap?: number;
    readonly overscan?: number;
}
export declare class VirtualListModel {
    private readonly fixedSize;
    private readonly estimate;
    private readonly gap;
    private readonly overscan;
    private sizes;
    private viewport;
    private offset;
    private groupStarts;
    private headerSize;
    constructor(options: VirtualListModelOptions);
    get itemCount(): number;
    get scrollOffset(): number;
    get viewportSize(): number;
    get contentSize(): number;
    get maxOffset(): number;
    get isFixed(): boolean;
    setViewport(size: number): boolean;
    setItemCount(count: number): void;
    spliceItems(index: number, deleteCount: number, insertCount: number): void;
    setGroups(starts: readonly number[], headerSize: number): boolean;
    updateSize(index: number, size: number): boolean;
    /** Replaces every variable extent in O(n), for data sources that expose exact sizes. */
    setSizes(sizes: readonly number[]): void;
    resetSize(index?: number): void;
    sizeAt(index: number): number;
    offsetAt(index: number): number;
    groupHeaders(): readonly VirtualGroupHeaderPlacement[];
    headerOffsetForIndex(index: number): number;
    indexAt(offset: number): number;
    scrollTo(offset: number): boolean;
    offsetForIndex(index: number, align?: VirtualAlign): number;
    readRange(): VirtualRange;
    private get baseContentSize();
    private baseOffsetAt;
    private groupOrdinal;
}
export interface VirtualGridOptions {
    readonly itemCount: number;
    readonly viewportMainSize: number;
    readonly viewportCrossSize: number;
    readonly lanes: number;
    readonly cellSize?: number;
    readonly estimatedCellSize?: number;
    readonly mainGap?: number;
    readonly crossGap?: number;
    readonly overscan?: number;
    readonly mode?: 'regular' | 'masonry';
    readonly groupStarts?: readonly number[];
    readonly headerSize?: number;
}
export declare class VirtualGridModel {
    private static readonly MASONRY_CHECKPOINT_INTERVAL;
    private readonly mode;
    private readonly mainGap;
    private readonly crossGap;
    private readonly fixedSize;
    private readonly estimate;
    private readonly overscan;
    private count;
    private viewportMain;
    private viewportCross;
    private laneCount;
    private measured;
    private placements;
    private lanes;
    private regularRows;
    private groupStarts;
    private headerSize;
    private headerPlacements;
    private mainExtent;
    constructor(options: VirtualGridOptions);
    /** Incremental append path used by masonry data sources. */
    appendItems(count: number): void;
    spliceItems(index: number, deleteCount: number, insertCount: number): void;
    get itemCount(): number;
    get contentSize(): number;
    get lanesCount(): number;
    get placementCount(): number;
    groupHeaders(): readonly VirtualGroupHeaderPlacement[];
    headerOffsetForIndex(index: number): number;
    setViewport(main: number, cross: number, lanes?: number): boolean;
    setItemCount(count: number): void;
    setGroups(starts: readonly number[], headerSize: number): boolean;
    updateSize(index: number, mainSize: number): boolean;
    /** Apply exact source extents in one rebuild, independent of visited windows. */
    setSizes(sizes: readonly number[]): void;
    placementAt(index: number): VirtualPlacement | undefined;
    visible(offset: number): readonly VirtualPlacement[];
    private rebuild;
    private regularPlacement;
    private rebuildMasonryFrom;
    private crossSize;
    private rebuildGrouped;
}
export interface StickyHeaderResult<Group extends VirtualCollectionKey> {
    readonly group: Group;
    readonly firstIndex: number;
    readonly offset: number;
}
export declare function computeStickyHeader<Value, Group extends VirtualCollectionKey>(source: VirtualListDataSource<Value>, groupOf: (value: Value) => Group, itemOffset: (index: number) => number, scrollOffset: number, headerSize: number, groupStarts?: readonly number[]): StickyHeaderResult<Group> | null;
