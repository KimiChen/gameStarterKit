/**
 * Framework-internal reference boundary for assets that have already loaded.
 * SC1 uses synchronous holds only. Async loading, deadlines and cancellation
 * join this boundary in SC3; this module is not a kit retain API.
 */

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
    retain<T extends LoadedAsset>(asset: T): RetainedAsset<T> {
        if (asset === null || typeof asset !== "object"
            || typeof asset.addRef !== "function" || typeof asset.decRef !== "function"
            || typeof asset.isValid !== "boolean") {
            throw new TypeError("AssetRetainer requires an already loaded asset");
        }
        if (!asset.isValid) throw new Error("AssetRetainer cannot retain a destroyed asset");

        asset.addRef();
        let released = false;
        return Object.freeze({
            asset,
            release(): void {
                if (released) return;
                released = true;
                asset.decRef();
            },
        });
    }
}
