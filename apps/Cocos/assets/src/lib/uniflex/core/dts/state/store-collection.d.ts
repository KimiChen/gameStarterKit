import type { DeepReadonly } from './reactivity.js';
import type { VirtualListDataSource } from '../virtual/virtual-data-source.js';
export interface StoreCollection<T extends {
    id: string;
}> {
    readonly byId: Readonly<Record<string, DeepReadonly<T> | undefined>>;
    readonly list: VirtualListDataSource<DeepReadonly<T>>;
}
export interface CollectionWriter<T extends {
    id: string;
}> {
    insert(value: T): void;
    update(id: string, set: Partial<T>, unset?: readonly string[]): void;
    remove(id: string): void;
    replace(values: readonly T[]): void;
    dispose(): void;
}
export declare function createStoreCollection<T extends {
    id: string;
}>(options?: {
    compare?: (a: DeepReadonly<T>, b: DeepReadonly<T>) => number;
    filter?: (item: DeepReadonly<T>) => boolean;
}): {
    store: StoreCollection<T>;
    writer: CollectionWriter<T>;
};
