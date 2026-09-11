export type VirtualCollectionKey = string | number | symbol;
export type VirtualDataMutation = {
    readonly type: 'reset';
} | {
    readonly type: 'reorder';
} | {
    readonly type: 'splice';
    readonly index: number;
    readonly deleteCount: number;
    readonly insertCount: number;
} | {
    readonly type: 'update';
    readonly index: number;
    readonly count: number;
    readonly fields?: readonly string[];
};
export type VirtualDataChange = VirtualDataMutation | {
    readonly type: 'batch';
    readonly changes: readonly VirtualDataMutation[];
};
export declare function flattenDataChange(change: VirtualDataChange): readonly VirtualDataMutation[];
export declare function mergeDataChanges(a: VirtualDataChange | undefined, b: VirtualDataChange): VirtualDataChange;
export type VirtualDataListener = (change: VirtualDataChange) => void;
export interface VirtualListDataSource<Value> {
    readonly reactiveItems?: boolean;
    readonly length: number;
    get(index: number): Value;
    subscribe(listener: VirtualDataListener): () => void;
    /** Optional authoritative key lookup. Return -1 when absent; duplicate keys resolve to the first item. */
    indexOfKey?(key: VirtualCollectionKey, keyProperty: string): number;
}
/** Owned by a virtual collection, never global; invalidated synchronously by data notifications. */
export declare class VirtualKeyIndex {
    private source;
    private readonly properties;
    clear(): void;
    find(source: VirtualListDataSource<unknown>, key: VirtualCollectionKey, property: string): number;
}
/** Mutable convenience source. Store/domain code remains the data owner. */
export declare class ArrayVirtualListDataSource<Value> implements VirtualListDataSource<Value> {
    private readonly listeners;
    private values;
    constructor(values?: readonly Value[]);
    get length(): number;
    get(index: number): Value;
    subscribe(listener: VirtualDataListener): () => void;
    reset(values: readonly Value[]): void;
    splice(index: number, deleteCount: number, ...inserted: readonly Value[]): readonly Value[];
    update(index: number, value: Value): void;
    notify(index: number, count?: number): void;
    snapshot(): readonly Value[];
    /** Releases subscribers and retained values owned by a disposed Store. */
    dispose(): void;
    private emit;
}
