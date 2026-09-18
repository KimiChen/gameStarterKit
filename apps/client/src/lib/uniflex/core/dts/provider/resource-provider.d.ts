export interface ImageRef {
    readonly kind: 'image';
    readonly id: string;
}
export interface FontRef {
    readonly kind: 'font';
    readonly id: string;
    readonly weight: 400 | 700;
}
export type ResourceRef = ImageRef | FontRef;
export interface ImageResource {
    readonly id: string;
    readonly kind: 'image';
    readonly file: string;
    readonly width: number;
    readonly height: number;
    readonly sha256: string;
    readonly nineSlice?: readonly [number, number, number, number];
}
export interface FontResource {
    readonly id: string;
    readonly kind: 'font';
    readonly file: string;
    readonly weight: 400 | 700;
    readonly sha256: string;
    readonly fallbackCharacter?: string;
    readonly metrics: {
        readonly unitsPerEm: number;
        readonly ascender: number;
        readonly descender: number;
        readonly lineGap: number;
        readonly advances: Readonly<Record<string, number>>;
    };
}
export type ResourceEntry = ImageResource | FontResource;
export interface ResourceCatalog {
    readonly version: 1;
    readonly hash: string;
    readonly resources: readonly ResourceEntry[];
}
/** Content hash is SHA-256 of canonicalJson(value), not platform-imported bytes. */
export interface JsonRef {
    readonly id: string;
    readonly sha256: string;
}
export interface ResourceProvider {
    loadJson(ref: JsonRef): Promise<unknown>;
    prepare(catalog: ResourceCatalog): Promise<void>;
    has(id: string): boolean;
    /** Provider-owned immutable resource context, shared by templates and their instances. */
    acquire?(catalog: ResourceCatalog): Promise<ResourceLease>;
    /** Evict only contexts with no template or instance owners. */
    evictUnused?(): void;
    /** Keep at most this many unowned contexts, newest first. Live owners are never evicted. */
    trimUnused?(options: {
        readonly maxContexts: number;
    }): void;
    inspectRetention?(): ResourceRetentionSnapshot;
}
export interface ResourceRetentionSnapshot {
    readonly contexts: readonly {
        readonly key: string;
        readonly owners: number;
        readonly state: 'preparing' | 'ready';
        readonly lastUse: number;
    }[];
    readonly failedCleanup: number;
    /** Available only when this provider can identify its shared native cache. */
    readonly sharedNativeEntries?: number;
    readonly failedNativeCleanup?: number;
    /** Native allocation sizes are unavailable; counts must not be presented as bytes. */
    readonly nativeBytes: 'unknown';
}
export interface ResourceLease {
    readonly key: string;
    /** Returns an independently releasable owner. */
    retain(): ResourceLease;
    release(): void;
}
export declare const imageRef: (id: string) => ImageRef;
export declare const fontRef: (id: string, weight: 400 | 700) => FontRef;
