import type { ResourceCatalog, ResourceLease, ResourceRetentionSnapshot } from './resource-provider.js';
/** @internal Leases are verified by object identity, never by a caller-provided key. */
export declare class ResourceContexts<Context> {
    #private;
    private readonly create;
    private readonly destroy;
    constructor(create: (catalog: ResourceCatalog, key: string) => Promise<Context>, destroy: (context: Context) => void);
    acquire(catalog: ResourceCatalog): Promise<ResourceLease>;
    resolve(lease: ResourceLease): Context;
    private lease;
    evictUnused(): void;
    trimUnused({ maxContexts }: {
        readonly maxContexts: number;
    }): void;
    inspectRetention(): ResourceRetentionSnapshot;
    dispose(): void;
    private destroyContext;
    private clear;
}
