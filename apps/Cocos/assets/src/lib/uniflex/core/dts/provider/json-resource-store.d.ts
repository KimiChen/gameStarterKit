import type { JsonRef } from './resource-provider.js';
export interface LoadedJson {
    readonly value: unknown;
    readonly release?: () => void;
}
export type JsonLoader = (ref: JsonRef) => Promise<LoadedJson>;
/** Provider-owned bootstrap data cache. No catalog or native object escapes. */
export declare class JsonResourceStore {
    #private;
    private readonly load;
    constructor(load: JsonLoader);
    loadJson(ref: JsonRef): Promise<unknown>;
    has(id: string): boolean;
    dispose(): void;
}
