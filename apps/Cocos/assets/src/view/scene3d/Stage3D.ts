import type { Camera, DirectionalLight, Node } from "cc";
import { designToScreen, resolveViewport } from "../../logic/scene3d/viewport";
import { resolveQuality, UNKNOWN_QUALITY_DEVICE } from "../../logic/scene3d/qualityTiers";
import type { Stage3DQuality } from "../../logic/scene3d/qualityTiers";
import type { RectDesignPx, ViewportMetrics } from "../../logic/scene3d/viewport";
import { cloneGlobals, globalsAssets, normalizeGlobalsPatch, resolveGlobals } from "./stage3dGlobals";
import type { Stage3DGlobalsPatch, Stage3DGlobalsState } from "./stage3dGlobals";
import { AssetRetainer, AssetReleaseError } from "./AssetLease";
import type { LoadedAsset, LoadedAssetRetainer, RetainedAsset } from "./AssetLease";
import { STAGE3D_CAMERA_MASK, STAGE3D_CAMERA_PRIORITY, STAGE3D_DEFAULT_LAYER } from "./stage3dLayers";

export type { RectDesignPx, Stage3DGlobalsPatch, Stage3DGlobalsState };
export interface Stage3DOwner { readonly signal: AbortSignal; isActive(): boolean; }
export interface Stage3DVector { readonly x: number; readonly y: number; readonly z: number; }
export interface Stage3DColor { readonly r: number; readonly g: number; readonly b: number; readonly a: number; }
export interface RayLike { readonly origin: Stage3DVector; readonly direction: Stage3DVector; }
export type Stage3DClear = Stage3DColor | "skybox";
export interface Stage3DCameraHandle {
    setPose(position: Stage3DVector, lookAt: Stage3DVector): void;
    setFov(degrees: number): void;
    setViewport(rectDesignPx: RectDesignPx): void;
    setClear(value: Stage3DClear): void;
}
export interface Stage3DLightHandle {
    setDirection(direction: Stage3DVector): void;
    setColor(color: Stage3DColor): void;
    setShadows(enabled: boolean, kind: "planar" | "shadowMap"): void;
}
export interface Stage3DGlobalsLease { readonly signal: AbortSignal; release(): void; }
export interface Stage3DLease extends Stage3DGlobalsLease {
    readonly root: Node;
    readonly camera: Stage3DCameraHandle;
    readonly light: Stage3DLightHandle;
    setGlobals(patch: Stage3DGlobalsPatch): void;
    screenToRay(xDesignPx: number, yDesignPx: number): RayLike;
}
export interface Stage3DAcquireOptions { readonly clearColor?: Stage3DColor; readonly viewport?: RectDesignPx; }
export interface Stage3DPort {
    readonly quality: Stage3DQuality;
    acquire(owner: Stage3DOwner, options?: Stage3DAcquireOptions): Stage3DLease;
    acquireGlobals(owner: Stage3DOwner, patch: Stage3DGlobalsPatch): Stage3DGlobalsLease;
    readonly active: boolean;
}

/**
 * All methods target the captured scene, never whichever scene is current later.
 * B3 supplies Cocos bindings. No engine module is loaded by this coordinator.
 */
export interface Stage3DScene {
    isValid(): boolean;
    isNodeValid(node: Node): boolean;
    createNode(name: string, layer: number): Node;
    addCamera(node: Node): Camera;
    addLight(node: Node): DirectionalLight;
    /** Detach/deactivate before destroy; retire owned GPU state at the frame boundary. */
    destroyNode(node: Node): void;
    setCameraPose(camera: Camera, position: Stage3DVector, lookAt: Stage3DVector): void;
    /** Camera derives aspect itself from window pixels and this normalized rectangle. */
    setCameraViewport(camera: Camera, rect: RectDesignPx): void;
    setCameraClear(camera: Camera, value: Stage3DClear): void;
    /** Must update camera matrices before a same-frame pick. */
    screenPointToRay(camera: Camera, xScreenPx: number, yScreenPx: number): RayLike;
    setLightDirection(light: DirectionalLight, direction: Stage3DVector): void;
    setLightColor(light: DirectionalLight, color: Stage3DColor): void;
    readViewportMetrics(): ViewportMetrics;
    readonly globals: {
        read(): Stage3DGlobalsState;
        /** Validate resource classes even when a later token hides the patch. */
        validate?(patch: Stage3DGlobalsPatch): void;
        /** May fail after a partial write; caller will reapply the preceding full state. */
        apply(state: Stage3DGlobalsState): void;
    };
    /**
     * frame polls owners, resize recomputes the viewport, destroy precedes scene replacement.
     * Registration is atomic on failure; the returned unsubscribe is idempotent.
     */
    subscribe(listener: (event: "frame" | "resize" | "destroy") => void): () => void;
}
export interface Stage3DEngine { captureScene(): Stage3DScene; }

export class Stage3DBusy extends Error {
    constructor() { super("Stage3D already has a stage lease"); this.name = "Stage3DBusy"; }
}
export class Stage3DInactive extends Error {
    constructor() { super("Stage3D owner, scene or lease is no longer active"); this.name = "Stage3DInactive"; }
}
export class Stage3DApplyError extends Error {
    constructor(readonly failure: unknown, readonly rollbackFailures: readonly unknown[]) {
        super("Stage3D operation failed and cleanup or rollback was incomplete"); this.name = "Stage3DApplyError";
    }
}

interface StageNodes {
    root: Node;
    camera: Camera;
    light: DirectionalLight;
    nodes: Node[];
    viewport?: RectDesignPx;
}
interface Token {
    owner: Stage3DOwner;
    controller: AbortController;
    patch: Stage3DGlobalsPatch;
    stage?: StageNodes;
    detachOwner: () => void;
    released: boolean;
}
const BLACK: Stage3DColor = { r: 0, g: 0, b: 0, a: 255 };

/** Single-stage ownership and an acquisition-ordered globals table shared by every lease. */
export class Stage3D implements Stage3DPort {
    private scene: Stage3DScene | undefined;
    private baseline: Stage3DGlobalsState | undefined;
    private tokens: Token[] = [];
    private unsubscribe: (() => void) | undefined;
    private subscription: object | undefined;
    private disposed = false;
    private operating = false;
    private pendingSweep = false;
    private pendingReset = false;
    private pendingResize = false;
    private pendingDispose = false;
    private globalsDirty = false;
    private readonly globalHolds = new Map<Stage3DGlobalsPatch, RetainedAsset<LoadedAsset>[]>();
    private readonly pendingReleases = new Set<Token>();

    constructor(private readonly engine: Stage3DEngine,
        private readonly onError: (error: unknown) => void = (error) => console.error("[Stage3D] lifecycle cleanup failed", error),
        private readonly readQuality: () => Stage3DQuality = () => resolveQuality(UNKNOWN_QUALITY_DEVICE),
        private readonly retainer: LoadedAssetRetainer = new AssetRetainer()) {}

    get quality(): Stage3DQuality { return this.readQuality(); }

    get active(): boolean {
        const committed = () => this.tokens.some((token) => !!token.stage);
        // Abort callbacks run inside release, after the new table has committed.
        // A readonly status query must not start another sweep in that transaction.
        return this.operating ? committed() : this.operate(committed);
    }

    acquire(owner: Stage3DOwner, options: Stage3DAcquireOptions = {}): Stage3DLease {
        return this.operate(() => {
            this.requireOwner(owner);
            if (this.tokens.some((token) => !!token.stage)) throw new Stage3DBusy();
            const clear = color(options.clearColor ?? BLACK);
            const scene = this.ensureScene();
            const nodes: Node[] = [];
            let token: Token | undefined;
            try {
                const metrics = scene.readViewportMetrics();
                const viewport = options.viewport ? { ...options.viewport } : undefined;
                const resolved = resolveViewport(viewport ?? metrics.design, metrics);
                const root = scene.createNode("Stage3DRoot", STAGE3D_DEFAULT_LAYER); nodes.push(root);
                const cameraNode = scene.createNode("Stage3DCamera", STAGE3D_DEFAULT_LAYER); nodes.push(cameraNode);
                const camera = scene.addCamera(cameraNode);
                camera.projection = 1; // Creator 3.8.8 Camera.ProjectionType.PERSPECTIVE.
                camera.priority = STAGE3D_CAMERA_PRIORITY;
                camera.visibility = STAGE3D_CAMERA_MASK;
                camera.fov = 45;
                scene.setCameraViewport(camera, resolved.rect);
                scene.setCameraClear(camera, clear);
                const lightNode = scene.createNode("Stage3DLight", STAGE3D_DEFAULT_LAYER); nodes.push(lightNode);
                const light = scene.addLight(lightNode);
                light.shadowEnabled = false;
                token = this.makeToken(owner, {}, { root, camera, light, nodes, viewport });
                this.changeTable([...this.tokens, token], () => this.requireOwner(owner));
                return this.stageLease(token);
            } catch (error) {
                if (token) token.detachOwner();
                const failures: unknown[] = [];
                try { this.destroyNodes(scene, nodes); } catch (cleanup) { failures.push(cleanup); }
                try { this.closeEmptyScene(); } catch (cleanup) { failures.push(cleanup); }
                if (failures.length) throw new Stage3DApplyError(error, failures);
                throw error;
            }
        });
    }

    acquireGlobals(owner: Stage3DOwner, patch: Stage3DGlobalsPatch): Stage3DGlobalsLease {
        return this.operate(() => {
            this.requireOwner(owner);
            const copied = normalizeGlobalsPatch(patch);
            this.ensureScene();
            const token = this.makeToken(owner, copied);
            try { this.changeTable([...this.tokens, token], () => this.requireOwner(owner)); }
            catch (error) { token.detachOwner(); this.closeEmptyScene(); throw error; }
            return { signal: token.controller.signal, release: () => this.release(token) };
        });
    }

    dispose(): void {
        if (this.disposed) return;
        if (this.operating) { this.pendingDispose = true; return; }
        this.operate(() => { this.resetScene(); this.disposed = true; });
    }

    private makeToken(owner: Stage3DOwner, patch: Stage3DGlobalsPatch, stage?: StageNodes): Token {
        const abort = () => this.lifecycle("frame");
        const token: Token = { owner, patch, stage, controller: new AbortController(), released: false,
            detachOwner: () => owner.signal.removeEventListener("abort", abort) };
        owner.signal.addEventListener("abort", abort, { once: true });
        return token;
    }

    private stageLease(token: Token): Stage3DLease {
        const coordinator = this;
        const use = <T>(action: (stage: StageNodes, scene: Stage3DScene) => T): T => this.operate(() => {
            this.requireToken(token);
            return action(token.stage!, this.scene!);
        });
        return {
            root: token.stage!.root,
            signal: token.controller.signal,
            release: () => coordinator.release(token),
            camera: {
                setPose: (position, lookAt) => use((stage, scene) => {
                    const p = vector(position), target = vector(lookAt);
                    if (p.x === target.x && p.y === target.y && p.z === target.z) throw new RangeError("Camera position equals lookAt");
                    scene.setCameraPose(stage.camera, p, target);
                }),
                setFov: (degrees) => use((stage) => {
                    if (!Number.isFinite(degrees) || degrees <= 0 || degrees >= 180) throw new RangeError("Camera fov must be between 0 and 180");
                    stage.camera.fov = degrees;
                }),
                setViewport: (rect) => use((stage, scene) => {
                    const copied = { ...rect };
                    scene.setCameraViewport(stage.camera, resolveViewport(copied, scene.readViewportMetrics()).rect);
                    stage.viewport = copied;
                }),
                setClear: (value) => use((stage, scene) => scene.setCameraClear(stage.camera, value === "skybox" ? value : color(value))),
            },
            light: {
                setDirection: (direction) => use((stage, scene) => {
                    const copied = vector(direction);
                    if (copied.x === 0 && copied.y === 0 && copied.z === 0) throw new RangeError("Light direction must be nonzero");
                    scene.setLightDirection(stage.light, copied);
                }),
                setColor: (value) => use((stage, scene) => scene.setLightColor(stage.light, color(value))),
                setShadows: (enabled, kind) => use(() => this.replacePatch(token, {
                    ...token.patch, shadows: { ...token.patch.shadows, enabled, kind },
                })),
            },
            setGlobals: (patch) => use(() => this.replacePatch(token, patch)),
            screenToRay: (x, y) => use((stage, scene) => {
                const point = designToScreen(x, y, scene.readViewportMetrics());
                const ray = scene.screenPointToRay(stage.camera, point.x, point.y);
                return { origin: vector(ray.origin), direction: vector(ray.direction) };
            }),
        };
    }

    private replacePatch(token: Token, patch: Stage3DGlobalsPatch): void {
        const replacement = normalizeGlobalsPatch(patch);
        // Keep the existing array position: updating a covered token never raises its priority.
        const next = this.tokens.map((entry) => entry === token ? { ...token, patch: replacement } : entry);
        this.changeTable(next, () => this.requireOwner(token.owner));
        // Preserve handle identity and its abort listener; only the patch is replaced.
        token.patch = replacement;
        this.tokens = this.tokens.map((entry) => entry.controller === token.controller ? token : entry);
    }

    private changeTable(next: Token[], validate?: () => void): void {
        const scene = this.scene!, baseline = this.baseline!;
        if (!scene.isValid() || this.pendingReset || this.pendingDispose) throw new Stage3DInactive();
        const before = resolveGlobals(baseline, this.tokens.map((token) => token.patch));
        const after = resolveGlobals(baseline, next.map((token) => token.patch));
        const previousStage = this.tokens.find((token) => !!token.stage);
        const nextStage = next.find((token) => !!token.stage);
        const previousShadow = previousStage?.stage?.light.shadowEnabled;
        try {
            for (const token of next) scene.globals.validate?.(token.patch);
            // Retain every candidate patch before any setter can expose its resources.
            this.retainGlobals([baseline, ...next.map((token) => token.patch)]);
            scene.globals.apply(cloneGlobals(after));
            if (nextStage?.stage) nextStage.stage.light.shadowEnabled = nextStage.patch.shadows?.enabled ?? false;
            if (!scene.isValid() || this.pendingReset || this.pendingDispose) throw new Stage3DInactive();
            validate?.();
        } catch (failure) {
            const rollback: unknown[] = [];
            if (scene.isValid()) {
                try { scene.globals.apply(cloneGlobals(before)); } catch (error) { rollback.push(error); }
            } else this.pendingSweep = true;
            if (previousStage?.stage && previousShadow !== undefined) {
                try { previousStage.stage.light.shadowEnabled = previousShadow; } catch (error) { rollback.push(error); }
            }
            if (rollback.length) {
                // A partially applied candidate may still be referenced by the scene.
                // Keep its holds until a later full replay or scene teardown succeeds.
                this.globalsDirty = true;
                throw new Stage3DApplyError(failure, rollback);
            }
            this.releaseUnusedGlobals([baseline, ...this.tokens.map((token) => token.patch)]);
            throw failure;
        }
        this.tokens = next;
        this.releaseUnusedGlobals([baseline, ...next.map((token) => token.patch)]);
    }

    private retainGlobals(patches: readonly Stage3DGlobalsPatch[]): void {
        for (const patch of patches) {
            if (this.globalHolds.has(patch)) continue;
            const holds: RetainedAsset<LoadedAsset>[] = [];
            this.globalHolds.set(patch, holds);
            for (const asset of globalsAssets(patch)) holds.push(this.retainer.retain(asset));
        }
    }

    /** Only after the corresponding scene references have been replaced/removed. */
    private releaseUnusedGlobals(patches: readonly Stage3DGlobalsPatch[]): void {
        const live = new Set(patches), failures: unknown[] = [];
        for (const [patch, holds] of this.globalHolds) {
            if (live.has(patch)) continue;
            this.globalHolds.delete(patch);
            for (const hold of holds) {
                try { hold.release(); } catch (error) { failures.push(error); }
            }
        }
        // The table already committed: a cleanup failure must never roll it back.
        if (failures.length) this.onError(new AssetReleaseError(failures));
    }

    private release(token: Token): void {
        if (token.released) return;
        if (this.operating) { this.pendingReleases.add(token); this.pendingSweep = true; return; }
        this.operate(() => this.releaseToken(token));
    }

    private releaseToken(token: Token): void {
        if (token.released || !this.tokens.includes(token)) return;
        this.changeTable(this.tokens.filter((entry) => entry !== token));
        try { this.finishToken(token); }
        finally { this.closeEmptyScene(); }
    }

    private finishToken(token: Token): void {
        token.released = true;
        token.detachOwner();
        this.pendingReleases.delete(token);
        token.controller.abort();
        if (token.stage) this.destroyNodes(this.scene!, token.stage.nodes);
    }

    private destroyNodes(scene: Stage3DScene, nodes: readonly Node[]): void {
        const failures: unknown[] = [];
        for (const node of [...nodes].reverse()) {
            try { node.active = false; } catch (error) { failures.push(error); }
            try { scene.destroyNode(node); } catch (error) { failures.push(error); }
        }
        if (failures.length) throw failures[0];
    }

    private ensureScene(): Stage3DScene {
        if (this.scene) return this.scene;
        const scene = this.engine.captureScene();
        if (!scene.isValid()) throw new Stage3DInactive();
        const baseline = cloneGlobals(scene.globals.read());
        try { this.retainGlobals([baseline]); }
        catch (error) { this.releaseUnusedGlobals([]); throw error; }
        this.scene = scene;
        this.baseline = baseline;
        const subscription = {};
        this.subscription = subscription;
        try {
            this.unsubscribe = scene.subscribe((event) => {
                // An already queued callback can outlive unsubscribe and scene replacement.
                if (this.scene === scene && this.subscription === subscription) this.lifecycle(event);
            });
        }
        catch (error) {
            this.subscription = undefined; this.scene = undefined; this.baseline = undefined;
            this.releaseUnusedGlobals([]); throw error;
        }
        return scene;
    }

    private closeEmptyScene(): void {
        // Never adopt a partially written state as a new baseline after rollback failed.
        if (this.tokens.length || this.globalsDirty) return;
        const unsubscribe = this.unsubscribe;
        this.unsubscribe = undefined;
        this.subscription = undefined;
        this.scene = undefined;
        this.baseline = undefined;
        this.pendingReset = false;
        this.pendingResize = false;
        this.releaseUnusedGlobals([]);
        unsubscribe?.();
    }

    private resetScene(): void {
        if (!this.scene) return;
        // A replaced/destroyed scene must never redirect this write into the new scene.
        if (this.scene.isValid()) {
            const before = resolveGlobals(this.baseline!, this.tokens.map((token) => token.patch));
            try { this.scene.globals.apply(cloneGlobals(this.baseline!)); }
            catch (failure) {
                try { this.scene.globals.apply(cloneGlobals(before)); }
                catch (rollback) {
                    this.globalsDirty = true;
                    throw new Stage3DApplyError(failure, [rollback]);
                }
                throw failure;
            }
        }
        this.globalsDirty = false;
        const previous = this.tokens;
        this.tokens = [];
        const failures: unknown[] = [];
        for (const token of previous) {
            try { this.finishToken(token); } catch (error) { failures.push(error); }
        }
        this.closeEmptyScene();
        if (failures.length) throw failures[0];
    }

    private requireOwner(owner: Stage3DOwner): void {
        if (this.disposed || this.pendingDispose || owner.signal.aborted || !owner.isActive()) throw new Stage3DInactive();
    }

    private requireToken(token: Token): void {
        this.requireOwner(token.owner);
        if (token.released || !this.tokens.includes(token) || !this.scene?.isValid()) throw new Stage3DInactive();
    }

    private sweep(): void {
        if (this.pendingDispose) { this.resetScene(); this.disposed = true; this.pendingDispose = false; return; }
        if (this.scene && (this.pendingReset || !this.scene.isValid())) { this.resetScene(); return; }
        if (this.scene && this.globalsDirty) {
            this.scene.globals.apply(resolveGlobals(this.baseline!, this.tokens.map((token) => token.patch)));
            const stage = this.tokens.find((token) => !!token.stage);
            if (stage?.stage) stage.stage.light.shadowEnabled = stage.patch.shadows?.enabled ?? false;
            this.globalsDirty = false;
            this.releaseUnusedGlobals([this.baseline!, ...this.tokens.map((token) => token.patch)]);
            this.closeEmptyScene();
        }
        for (const token of [...this.tokens]) {
            if (this.pendingReleases.has(token) || token.owner.signal.aborted || !token.owner.isActive()
                || token.stage?.nodes.some((node) => !this.scene!.isNodeValid(node))) this.releaseToken(token);
        }
        if (this.pendingResize) {
            this.pendingResize = false;
            const stage = this.tokens.find((token) => !!token.stage)?.stage;
            if (stage && this.scene) {
                const metrics = this.scene.readViewportMetrics();
                this.scene.setCameraViewport(stage.camera, resolveViewport(stage.viewport ?? metrics.design, metrics).rect);
            }
        }
    }

    private lifecycle(event: "frame" | "resize" | "destroy"): void {
        this.pendingSweep = true;
        if (event === "destroy") this.pendingReset = true;
        if (event === "resize") this.pendingResize = true;
        if (!this.operating) {
            try { this.operate(() => undefined); } catch (error) { this.onError(error); }
        }
    }

    private operate<T>(action: () => T): T {
        if (this.operating) throw new Error("Stage3D does not allow reentrant updates");
        this.operating = true;
        try { this.pendingSweep = false; this.sweep(); return action(); }
        finally {
            this.operating = false;
            // Abort/release during an adapter call is deferred until its transaction finishes.
            let remaining = this.tokens.length + 2;
            while (this.pendingSweep || this.pendingDispose) {
                // Releases can cascade through abort listeners, but no reentrant acquisition
                // can add tokens. Bound a broken adapter that emits resize on every write.
                if (remaining-- === 0) {
                    this.onError(new Error("Stage3D lifecycle callbacks did not settle"));
                    break;
                }
                this.operating = true;
                try { this.pendingSweep = false; this.sweep(); }
                catch (error) { this.onError(error); break; }
                finally { this.operating = false; }
            }
        }
    }
}

function vector(value: Stage3DVector): Stage3DVector {
    if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) throw new TypeError("Stage3D vector must be finite");
    return { x: value.x, y: value.y, z: value.z };
}
function color(value: Stage3DColor): Stage3DColor {
    if (!value || ![value.r, value.g, value.b, value.a].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
        throw new TypeError("Stage3D color channels must be between 0 and 255");
    }
    return { r: value.r, g: value.g, b: value.b, a: value.a };
}
