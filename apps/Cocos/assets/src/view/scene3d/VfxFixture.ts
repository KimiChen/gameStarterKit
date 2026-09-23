import { isValid, Node } from "cc";
import type { AssetCatalogData } from "../../logic/scene3d/assetCatalog";
import type { Stage3DQuality } from "../../logic/scene3d/qualityTiers";
import { createCocosVfx } from "./cocosVfx";
import type { Vfx, VfxHandle } from "./Vfx";

/** Developer load fixture only. Production maxEffects remains 8/24/48 in quality.json. */
export class VfxFixture {
    readonly effects: VfxHandle<Node>[] = [];
    pool: Vfx<Node> | undefined;
    error = "";
    target: Node | undefined;
    private disposed = false;
    private readonly cancel = () => this.close();
    constructor(private readonly catalog: AssetCatalogData, private readonly parent: Node,
        readonly quality: Stage3DQuality, private readonly signal: AbortSignal) {
        signal.addEventListener("abort", this.cancel, { once: true });
        if (signal.aborted) this.close();
    }
    setEnabled(enabled: boolean): void {
        this.clear(); if (!enabled || this.disposed) return;
        this.error = "";
        this.target = new Node("Stage3dVfx.FollowTarget"); this.parent.addChild(this.target); this.target.setPosition(-12, 1, 8);
        this.pool = createCocosVfx(this.catalog, this.parent, {
            quality: { ...this.quality, maxEffects: 50 }, signal: this.signal, onError: (error) => { this.error = String(error); },
        });
        for (let i = 0; i < 50; i++) {
            const effect = this.pool.play("sparks", i === 0 ? { follow: () => this.target && isValid(this.target, true)
                ? this.target.worldPosition : undefined } : { at: { x: (i % 10 - 4.5) * 2.5, y: 1, z: (Math.floor(i / 10) - 2) * 5 } }, 120_000);
            if (effect) this.effects.push(effect);
        }
    }
    close(): void { this.disposed = true; this.signal.removeEventListener("abort", this.cancel); this.clear(); }
    private clear(): void {
        this.pool?.close(); this.pool = undefined; this.effects.length = 0;
        this.target?.destroy(); this.target = undefined;
    }
}
