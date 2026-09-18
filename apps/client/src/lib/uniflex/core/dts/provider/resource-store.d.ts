import type { ResourceProvider, ResourceCatalog, ResourceEntry, ResourceRef, FontRef, FontResource } from './resource-provider.js';
import type { JsonRef } from './resource-provider.js';
import type { JsonLoader } from './json-resource-store.js';
import type { ResourceLease } from './resource-provider.js';
export interface ResourceResolver<Native> {
    resolve(ref: ResourceRef): {
        entry: ResourceEntry;
        native: Native;
    };
    font(ref?: FontRef, bold?: boolean): {
        entry: FontResource;
        native: Native;
    };
}
/** Provider-internal cache; the business-facing ResourceProvider exposes no native values. */
export declare class ResourceStore<Native> implements ResourceProvider {
    #private;
    private readonly load;
    private readonly release;
    private readonly maxConcurrentLoads;
    constructor(load: (entry: ResourceEntry) => Promise<Native>, release: (value: Native) => void, loadJson?: JsonLoader, maxConcurrentLoads?: number);
    acquire(catalog: ResourceCatalog): Promise<ResourceLease>;
    context(lease?: ResourceLease): ResourceResolver<Native>;
    evictUnused(): void;
    trimUnused(options: {
        readonly maxContexts: number;
    }): void;
    inspectRetention(): {
        contexts: readonly {
            readonly key: string;
            readonly owners: number;
            readonly state: 'preparing' | 'ready';
            readonly lastUse: number;
        }[];
        failedCleanup: number;
        nativeBytes: 'unknown';
        sharedNativeEntries: number;
        failedNativeCleanup: number;
    };
    private loadShared;
    private releaseShared;
    loadJson(ref: JsonRef): Promise<unknown>;
    prepare(catalog: ResourceCatalog): Promise<void>;
    private loadBounded;
    has(id: string): boolean;
    resolve(ref: ResourceRef): {
        entry: ResourceEntry;
        native: Native;
    };
    font(ref?: FontRef, bold?: boolean): {
        entry: FontResource;
        native: Native;
    };
    dispose(): void;
}
