import { Prefab, resources } from "cc";
import { AssetRetainer } from "./AssetLease";
import type { RetainedAsset } from "./AssetLease";
import type { Stage3DOwner } from "./Stage3D";
import { countFixtureReference } from "./fixtureSession";

/** Temporary SC1 framework loader. SC3 replaces this with batch AssetLease,
 * bundle addressing and deadlines, using the same synchronous retainer.
 */
export class FixturePrefabLoader {
    private readonly retainer = new AssetRetainer();
    private readonly held: RetainedAsset<Prefab>[] = [];
    private cancelled = false;

    constructor(private readonly owner: Stage3DOwner) {}

    async load(paths: readonly string[]): Promise<Prefab[]> {
        // Normal failures wait for all in-flight callbacks; close() can cancel
        // immediately and every late success still crosses the same boundary.
        const results = await Promise.all(paths.map((path) => this.loadOne(path).then(
            (asset) => ({ asset, error: undefined }),
            (error: unknown) => ({ asset: undefined, error }),
        )));
        const failed = results.find((result) => !result.asset);
        if (failed) throw failed.error;
        return results.map((result) => result.asset!);
    }

    cancel(): void { this.cancelled = true; }

    /** Only after the owner's render references and cached GPU batches retire. */
    release(): void {
        this.cancel();
        for (const hold of this.held.splice(0)) this.releaseOne(hold);
    }

    private releaseOne(hold: RetainedAsset<Prefab>): void {
        try { hold.release(); } finally { countFixtureReference(-1); }
    }

    private loadOne(path: string): Promise<Prefab> {
        return new Promise((resolve, reject) => {
            if (this.cancelled || !this.owner.isActive()) { reject(new Error(`Fixture load cancelled: ${path}`)); return; }
            resources.load(path, Prefab, (error, asset) => {
                try {
                    // Even an error carrying an asset or a late callback acquires
                    // and returns its own hold, never another consumer's ref.
                    const hold = asset ? this.retainer.retain(asset) : undefined;
                    if (hold) countFixtureReference(1);
                    if (error || !hold || this.cancelled || this.owner.signal.aborted || !this.owner.isActive()) {
                        if (hold) this.releaseOne(hold);
                        reject(error ?? new Error(`${hold ? "Fixture load cancelled" : "Missing prefab"}: ${path}`));
                        return;
                    }
                    this.held.push(hold);
                    resolve(hold.asset);
                } catch (failure) { reject(failure); }
            });
        });
    }
}
