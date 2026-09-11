import type { ResourceCatalog } from './resource-provider.js';
/** Catalog validation remains independent from IO and platform resource formats. */
export declare function parseResourceCatalog(value: unknown): ResourceCatalog;
