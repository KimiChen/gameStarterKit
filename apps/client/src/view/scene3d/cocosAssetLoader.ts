import { assetManager, resources } from "cc";
import type { Asset, AssetManager } from "cc";
import { AssetLease } from "./AssetLease";
import type { AssetLoader, AssetLoadCallback, AssetType } from "./AssetLease";

/**
 * Creator 3.8.8 cc.d.ts:30086,30271,31134. resources is an ordinary named bundle.
 * Bundle caches belong to the engine: a page never calls releaseAll/removeBundle.
 * Reference operations are invoked only by AssetLease's shared retainer boundary.
 */
export const cocosAssetLoader: AssetLoader = {
    addRef: (asset) => asset.addRef(),
    decRef: (asset) => asset.decRef(),
    load<T extends Asset>(name: string, path: string, type: AssetType<T>, callback: AssetLoadCallback<T>): void {
        // The built-in resources bundle is available without asynchronous bundle discovery.
        if (name === "resources") { resources.load(path, type, callback); return; }
        const loaded = assetManager.getBundle(name);
        if (loaded) { loaded.load(path, type, callback); return; }
        let completed = false;
        assetManager.loadBundle(name, (error: Error | null, bundle: AssetManager.Bundle) => {
            if (completed) return;
            completed = true;
            if (error || !bundle) { callback(error ?? new Error(`Missing bundle: ${name}`)); return; }
            try { bundle.load(path, type, callback); }
            catch (failure) { callback(failure); }
        });
    },
};

/** Stateless across acquisitions; safe to share between independently owned pages. */
export const assetLease = new AssetLease(cocosAssetLoader);
