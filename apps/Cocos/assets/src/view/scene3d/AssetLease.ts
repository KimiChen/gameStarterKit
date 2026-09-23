import type { Asset } from "cc";

/** Asset loading and the single framework reference boundary. No engine runtime import. */

/** Stable address for SC3 loading: resources is also a bundle name; paths omit extensions.
 * Package bundles use <class>-<id>[-<map>]. No URL/path inference at kit call sites.
 */
export interface AssetAddress {
    readonly bundle: string;
    readonly path: string;
}

/** Structural subset of cc.Asset, so the same boundary works without an engine. */
export interface LoadedAsset {
    readonly isValid: boolean;
    addRef(): unknown;
    decRef(): unknown;
}

export interface RetainedAsset<T extends LoadedAsset> {
    readonly asset: T;
    /** Invoke the matching decRef at most once, including reentrant calls. */
    release(): void;
}

export interface LoadedAssetRetainer {
    retain<T extends LoadedAsset>(asset: T): RetainedAsset<T>;
}

export interface AssetReferences {
    addRef(asset: LoadedAsset): unknown;
    decRef(asset: LoadedAsset): unknown;
}

const assetReferences: AssetReferences = {
    addRef: (asset) => asset.addRef(),
    decRef: (asset) => asset.decRef(),
};

/**
 * Each successful retain owns one engine reference, independently of other
 * callers. The input identity is authoritative: addRef's return value is not.
 *
 * A throwing addRef publishes no lease. We do not guess whether a custom
 * implementation changed its count before throwing and risk decrementing
 * someone else's reference. Cocos addRef is a synchronous count increment.
 *
 * A release consumes its lease before calling decRef, so reentrant release is
 * safe. A decRef error propagates unchanged; repeating release cannot retry an
 * operation that may already have decremented or destroyed the resource.
 */
export class AssetRetainer implements LoadedAssetRetainer {
    constructor(private readonly references: AssetReferences = assetReferences) {}

    retain<T extends LoadedAsset>(asset: T): RetainedAsset<T> {
        if (asset === null || typeof asset !== "object"
            || typeof asset.addRef !== "function" || typeof asset.decRef !== "function"
            || typeof asset.isValid !== "boolean") {
            throw new TypeError("AssetRetainer requires an already loaded asset");
        }
        if (!asset.isValid) throw new Error("AssetRetainer cannot retain a destroyed asset");

        this.references.addRef(asset);
        const references = this.references;
        let released = false;
        return Object.freeze({
            asset,
            release(): void {
                if (released) return;
                released = true;
                references.decRef(asset);
            },
        });
    }
}

export const DEFAULT_ASSET_DEADLINE_MS = 15_000;
export type AssetErrorCode = "ASSET_MISSING" | "ASSET_TIMEOUT" | "ASSET_CANCELLED";
// Match Creator's Constructor<T>; the loader receives the class, never constructs it here.
export type AssetType<T extends Asset = Asset> = new (...args: any[]) => T;
export type AssetLoadCallback<T extends Asset> = (error: unknown, asset?: T | null) => void;
export interface AssetRequest<T extends Asset = Asset> extends AssetAddress {
    readonly type: AssetType<T>;
}

/** load borrows its callback asset; it must not addRef on behalf of the caller. */
export interface AssetLoader extends AssetReferences {
    load<T extends Asset>(bundle: string, path: string, type: AssetType<T>, callback: AssetLoadCallback<T>): void;
}
export interface AssetScheduler {
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
}
export interface AssetLeaseConfig {
    readonly scheduler?: AssetScheduler;
    /** Reports cleanup failures after the acquire promise has already settled. */
    readonly onError?: (error: unknown) => void;
}
export interface AssetAcquireOptions {
    readonly deadlineMs?: number;
    /** Cancels only the in-flight acquisition. A successful lease is released explicitly. */
    readonly signal?: AbortSignal;
}
export type AcquiredAssets<R extends readonly AssetRequest[]> = {
    readonly [K in keyof R]: R[K] extends AssetRequest<infer T> ? T : never;
};
export interface AssetBatch<R extends readonly AssetRequest[]> {
    /** Same order and asset identity as requests, including duplicate addresses. */
    readonly assets: AcquiredAssets<R>;
    /** Call after nodes/render references retire; returns each owned ref at most once. */
    release(): void;
}

export class AssetLoadError extends Error {
    readonly retryable: boolean;
    readonly cleanupErrors: unknown[] = [];

    constructor(readonly code: AssetErrorCode, readonly request?: AssetAddress,
        readonly cause?: unknown, readonly deadlineMs?: number) {
        const address = request ? ` ${request.bundle}:${request.path}` : "";
        super(`[AssetLease] ${code}${address}${deadlineMs === undefined ? "" : ` (${deadlineMs}ms)`}`);
        this.name = "AssetLoadError";
        this.retryable = code !== "ASSET_CANCELLED";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class AssetReleaseError extends Error {
    constructor(readonly failures: readonly unknown[]) {
        super(`[AssetLease] ${failures.length} reference release(s) failed`);
        this.name = "AssetReleaseError";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

function copyRequest(request: AssetRequest): AssetRequest {
    if (!request || typeof request !== "object"
        || typeof request.bundle !== "string" || !/^[A-Za-z0-9_-]+$/.test(request.bundle)
        || typeof request.path !== "string" || !request.path.length
        || /[\\\\?#:\u0000-\u001f]/.test(request.path)
        || request.path.split("/").some((part) => !part || part === "." || part === "..")
        || typeof request.type !== "function" || !request.type.prototype) {
        throw new TypeError("AssetLease requires a bundle name, relative asset path and asset constructor");
    }
    return Object.freeze({ bundle: request.bundle, path: request.path, type: request.type });
}

function releaseAll(holds: RetainedAsset<Asset>[]): unknown[] {
    const failures: unknown[] = [];
    // Remove before invoking user/engine code: cleanup may reenter release/abort.
    for (const hold of holds.splice(0)) {
        try { hold.release(); } catch (error) { failures.push(error); }
    }
    return failures;
}

/**
 * Each request owns one hold, even when the engine coalesces loads or shares a cache.
 * Failures settle immediately and drain acquired refs. Uncancellable late successes
 * still acquire/return their own ref through the same retainer; they cannot revive a batch.
 */
export class AssetLease {
    private readonly retainer: AssetRetainer;
    private readonly scheduler: AssetScheduler;
    private readonly onError: (error: unknown) => void;

    constructor(private readonly loader: AssetLoader, config: AssetLeaseConfig = {}) {
        this.retainer = new AssetRetainer(loader);
        this.scheduler = config.scheduler ?? {
            setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
            clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
        };
        this.onError = config.onError ?? ((error) => console.error("[AssetLease] late cleanup failed", error));
    }

    async acquire<R extends readonly AssetRequest[]>(requests: R, options: AssetAcquireOptions = {}): Promise<AssetBatch<R>> {
        // Validate the entire batch before allocating timers, listeners or engine requests.
        if (!Array.isArray(requests)) throw new TypeError("AssetLease requests must be an array");
        const inputs = Array.from(requests, copyRequest);
        const deadlineMs = options.deadlineMs ?? DEFAULT_ASSET_DEADLINE_MS;
        // Native timers otherwise overflow to 1ms, violating the requested deadline.
        if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 0 || deadlineMs > 0x7fffffff) {
            throw new RangeError("AssetLease deadlineMs must be an integer between 0 and 2147483647");
        }
        const signal = options.signal;
        const cancelled = (request?: AssetAddress) => new AssetLoadError("ASSET_CANCELLED", request,
            (signal as (AbortSignal & { reason?: unknown }) | undefined)?.reason);
        if (signal?.aborted) throw cancelled(inputs[0]);

        return new Promise<AssetBatch<R>>((resolve, reject) => {
            let state: "loading" | "ready" | "closed" = "loading";
            let timer: unknown;
            let timerInstalled = false;
            const completed = inputs.map(() => false);
            const assets: Asset[] = new Array(inputs.length);
            const holds: RetainedAsset<Asset>[] = [];
            let remaining = inputs.length;
            const pending = () => inputs.find((_, index) => !completed[index]);
            const cleanup = () => {
                signal?.removeEventListener("abort", abort);
                if (timerInstalled) { timerInstalled = false; this.scheduler.clearTimeout(timer); }
            };
            const fail = (error: AssetLoadError) => {
                if (state !== "loading") return;
                state = "closed";
                cleanup();
                error.cleanupErrors.push(...releaseAll(holds));
                reject(error);
            };
            const abort = () => fail(cancelled(pending()));
            const succeed = () => {
                state = "ready";
                cleanup();
                resolve(Object.freeze({
                    assets: Object.freeze(assets) as AcquiredAssets<R>,
                    release: () => {
                        if (state === "closed") return;
                        state = "closed";
                        const failures = releaseAll(holds);
                        if (failures.length) throw new AssetReleaseError(failures);
                    },
                }));
            };
            if (!remaining) { succeed(); return; }
            signal?.addEventListener("abort", abort, { once: true });
            if (signal?.aborted) { abort(); return; }
            timer = this.scheduler.setTimeout(() => fail(new AssetLoadError("ASSET_TIMEOUT", pending(), undefined, deadlineMs)), deadlineMs);
            timerInstalled = true;
            // An injected scheduler may fire synchronously (including a zero deadline).
            if (state !== "loading") { cleanup(); return; }

            for (let index = 0; index < inputs.length && state === "loading"; index++) {
                const request = inputs[index];
                const complete: AssetLoadCallback<Asset> = (error, asset) => {
                    if (completed[index]) return; // A load callback owns at most one hold.
                    completed[index] = true;
                    if (error !== undefined && error !== null || !asset) {
                        // Error callbacks do not transfer a usable asset, even if one is supplied.
                        fail(new AssetLoadError("ASSET_MISSING", request, error));
                        return;
                    }
                    let hold: RetainedAsset<Asset>;
                    try { hold = this.retainer.retain(asset); }
                    catch (cause) {
                        if (state === "loading") fail(new AssetLoadError("ASSET_MISSING", request, cause));
                        else this.onError(cause);
                        return;
                    }
                    // addRef can reenter cancellation. Always account for the returned hold.
                    if (state !== "loading") {
                        const failures = releaseAll([hold]);
                        if (failures.length) this.onError(new AssetReleaseError(failures));
                        return;
                    }
                    holds.push(hold);
                    if (!(asset instanceof request.type)) {
                        fail(new AssetLoadError("ASSET_MISSING", request, new TypeError("Loader returned the wrong asset type")));
                        return;
                    }
                    assets[index] = asset;
                    if (--remaining === 0) succeed();
                };
                try { this.loader.load(request.bundle, request.path, request.type, complete); }
                catch (error) { complete(error); }
            }
        });
    }
}
