import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Camera, DirectionalLight, Node } from "cc";
import {
    Stage3D, Stage3DApplyError, Stage3DBusy, Stage3DInactive,
    type RayLike, type Stage3DClear, type Stage3DColor, type Stage3DEngine,
    type Stage3DGlobalsState, type Stage3DOwner, type Stage3DScene, type Stage3DVector,
} from "../src/view/scene3d/Stage3D";
import {
    STAGE3D_CAMERA_MASK, STAGE3D_CAMERA_PRIORITY, STAGE3D_DEFAULT_LAYER,
    STAGE3D_HIDDEN_LAYER, STAGE3D_OVERLAY_LAYER, STAGE3D_PICK_MASK,
} from "../src/view/scene3d/stage3dLayers";
import type { RectDesignPx, ViewportMetrics } from "../src/logic/scene3d/viewport";

function baseline(): Stage3DGlobalsState {
    return {
        toneMapping: "default",
        fog: { enabled: false, type: "linear", density: 0.01, start: 1, end: 500 },
        ambient: { skyIllum: 10 },
        shadows: { enabled: false, kind: "planar" },
    };
}

function owner() {
    const controller = new AbortController();
    const signal = controller.signal;
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void => {
        if (!listener) return;
        if (type === "abort") listeners.add(listener);
        add(type, listener, options);
    };
    signal.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void => {
        if (!listener) return;
        if (type === "abort") listeners.delete(listener);
        remove(type, listener, options);
    };
    const state = { active: true };
    const value: Stage3DOwner = { signal, isActive: () => state.active };
    return { value, controller, state, listeners };
}

class FakeNode {
    active = true;
    isValid = true;
    readonly children: FakeNode[] = [];
    constructor(readonly name: string, readonly layer: number) {}
    addChild(child: FakeNode): void { this.children.push(child); }
    destroy(): void {
        this.active = false;
        this.isValid = false;
        for (const child of this.children) child.destroy();
        this.children.length = 0;
    }
}

class FakeCamera {
    projection = -1;
    priority = -1;
    visibility = 0;
    fov = 0;
    rect: RectDesignPx = { x: 0, y: 0, width: 0, height: 0 };
    clear: Stage3DClear = "skybox";
    pose: { position: Stage3DVector; lookAt: Stage3DVector } | undefined;
    constructor(readonly node: FakeNode) {}
}

class FakeLight {
    private shadow = false;
    failShadowOnce = false;
    direction: Stage3DVector | undefined;
    color: Stage3DColor | undefined;
    constructor(readonly node: FakeNode) {}
    get shadowEnabled(): boolean { return this.shadow; }
    set shadowEnabled(value: boolean) {
        this.shadow = value;
        if (this.failShadowOnce) { this.failShadowOnce = false; throw new Error("light partial failure"); }
    }
}

class FakeScene implements Stage3DScene {
    valid = true;
    state = baseline();
    readonly nodes: FakeNode[] = [];
    readonly cameras: FakeCamera[] = [];
    readonly lights: FakeLight[] = [];
    readonly listeners = new Set<(event: "frame" | "resize" | "destroy") => void>();
    readonly applied: Stage3DGlobalsState[] = [];
    readonly rays: { camera: FakeCamera; x: number; y: number }[] = [];
    failApplyOnce = false;
    readonly applyFailures: ("before" | "partial")[] = [];
    failLightOnce = false;
    onCreate: (() => void) | undefined;
    onApply: (() => void) | undefined;
    lastRay: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } } | undefined;
    metrics: ViewportMetrics = {
        design: { x: 0, y: 0, width: 750, height: 1500 },
        screen: { width: 1500, height: 3000 },
        content: { x: 0, y: 0, width: 1500, height: 3000 },
    };
    readonly globals = {
        read: (): Stage3DGlobalsState => this.state,
        apply: (state: Stage3DGlobalsState): void => {
            this.applied.push(structuredClone(state));
            const failure = this.applyFailures.shift() ?? (this.failApplyOnce ? "partial" : undefined);
            this.failApplyOnce = false;
            if (failure === "before") throw new Error("globals before-write failure");
            // An engine setter can fail after earlier fields have already changed.
            this.state.toneMapping = state.toneMapping;
            this.state.ambient.skyIllum = state.ambient.skyIllum;
            if (failure === "partial") throw new Error("globals partial failure");
            this.state = structuredClone(state);
            const action = this.onApply;
            this.onApply = undefined;
            action?.();
        },
    };
    isValid(): boolean { return this.valid; }
    isNodeValid(node: Node): boolean { return (node as unknown as FakeNode).isValid; }
    createNode(name: string, layer: number): Node {
        const node = new FakeNode(name, layer);
        this.nodes.push(node);
        const action = this.onCreate;
        this.onCreate = undefined;
        action?.();
        return node as unknown as Node;
    }
    addCamera(node: Node): Camera {
        const camera = new FakeCamera(node as unknown as FakeNode);
        this.cameras.push(camera);
        return camera as unknown as Camera;
    }
    addLight(node: Node): DirectionalLight {
        if (this.failLightOnce) { this.failLightOnce = false; throw new Error("light creation failure"); }
        const light = new FakeLight(node as unknown as FakeNode);
        this.lights.push(light);
        return light as unknown as DirectionalLight;
    }
    destroyNode(node: Node): void { (node as unknown as FakeNode).destroy(); }
    setCameraPose(camera: Camera, position: Stage3DVector, lookAt: Stage3DVector): void {
        (camera as unknown as FakeCamera).pose = { position: { ...position }, lookAt: { ...lookAt } };
    }
    setCameraViewport(camera: Camera, rect: RectDesignPx): void { (camera as unknown as FakeCamera).rect = { ...rect }; }
    setCameraClear(camera: Camera, clear: Stage3DClear): void {
        (camera as unknown as FakeCamera).clear = typeof clear === "string" ? clear : { ...clear };
    }
    screenPointToRay(camera: Camera, x: number, y: number): RayLike {
        this.rays.push({ camera: camera as unknown as FakeCamera, x, y });
        this.lastRay = { origin: { x, y, z: 5 }, direction: { x: 0, y: 0, z: -1 } };
        return this.lastRay;
    }
    setLightDirection(light: DirectionalLight, direction: Stage3DVector): void { (light as unknown as FakeLight).direction = { ...direction }; }
    setLightColor(light: DirectionalLight, color: Stage3DColor): void { (light as unknown as FakeLight).color = { ...color }; }
    readViewportMetrics(): ViewportMetrics { return this.metrics; }
    subscribe(listener: (event: "frame" | "resize" | "destroy") => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    emit(event: "frame" | "resize" | "destroy"): void {
        for (const listener of [...this.listeners]) listener(event);
    }
    get liveNodes(): number { return this.nodes.filter((node) => node.isValid).length; }
}

function fixture() {
    const scene = new FakeScene();
    const engine: Stage3DEngine & { current: FakeScene; captures: number } = {
        current: scene, captures: 0,
        captureScene() { this.captures++; return this.current; },
    };
    const errors: unknown[] = [];
    return { scene, engine, errors, stage: new Stage3D(engine, (error) => errors.push(error)) };
}

test("Stage3D layers match project settings and separate render and pick masks", () => {
    const project = JSON.parse(readFileSync(new URL("../../Cocos/settings/v2/packages/project.json", import.meta.url), "utf8")) as {
        layer: { name: string; value: number }[];
    };
    assert.equal(project.layer.find((entry) => entry.name === "STAGE3D_HIDDEN")?.value, STAGE3D_HIDDEN_LAYER);
    assert.equal(project.layer.find((entry) => entry.name === "STAGE3D_OVERLAY")?.value, STAGE3D_OVERLAY_LAYER);
    assert.equal(STAGE3D_DEFAULT_LAYER, 1 << 30);
    assert.equal(STAGE3D_CAMERA_MASK, STAGE3D_DEFAULT_LAYER | STAGE3D_OVERLAY_LAYER);
    assert.equal(STAGE3D_PICK_MASK, STAGE3D_DEFAULT_LAYER);
    assert.equal(STAGE3D_CAMERA_MASK & STAGE3D_HIDDEN_LAYER, 0);
    assert.equal(STAGE3D_PICK_MASK & (STAGE3D_HIDDEN_LAYER | STAGE3D_OVERLAY_LAYER), 0);
    assert.equal(STAGE3D_CAMERA_PRIORITY, 0);
});

test("Stage3D permits independent globals but rejects a second stage without allocating nodes", () => {
    const { stage, scene, engine } = fixture();
    const globalsOwner = owner(), worldOwner = owner(), rejectedOwner = owner();
    const globals = stage.acquireGlobals(globalsOwner.value, { ambient: { skyIllum: 30 } });
    assert.equal(stage.active, false);
    assert.equal(scene.liveNodes, 0);
    const world = stage.acquire(worldOwner.value);
    assert.equal(stage.active, true);
    assert.equal(scene.state.ambient.skyIllum, 30);
    const count = scene.liveNodes;
    assert.throws(() => stage.acquire(rejectedOwner.value), Stage3DBusy);
    assert.equal(scene.liveNodes, count);
    assert.equal(rejectedOwner.listeners.size, 0);
    assert.equal(engine.captures, 1, "globals and world share one captured scene");
    assert.equal(scene.listeners.size, 1);
    assert.equal(scene.cameras[0].projection, 1);
    assert.equal(scene.cameras[0].priority, STAGE3D_CAMERA_PRIORITY);
    assert.equal(scene.cameras[0].visibility, STAGE3D_CAMERA_MASK);
    assert.equal(scene.cameras[0].fov, 45);
    assert.equal(world.root.layer, STAGE3D_DEFAULT_LAYER);
    world.release();
    assert.equal(scene.liveNodes, 0);
    assert.equal(scene.state.ambient.skyIllum, 30);
    globals.release();
    assert.deepEqual(scene.state, baseline());
    assert.equal(scene.listeners.size, 0);
    assert.equal(globalsOwner.listeners.size + worldOwner.listeners.size, 0);
});

test("Stage3D restores the live predecessor in either stage/globals release order", () => {
    for (const stageFirst of [true, false]) {
        const { stage, scene } = fixture();
        const world = stage.acquire(owner().value);
        world.setGlobals({ ambient: { skyIllum: 20 }, fog: { enabled: true } });
        const globals = stage.acquireGlobals(owner().value, { ambient: { skyIllum: 40 } });
        assert.equal(scene.state.ambient.skyIllum, 40);
        if (stageFirst) {
            world.release();
            assert.equal(scene.state.ambient.skyIllum, 40);
            assert.equal(scene.state.fog.enabled, false, "released stage fog must not survive behind a different override");
            globals.release();
        } else {
            globals.release();
            assert.equal(scene.state.ambient.skyIllum, 20);
            assert.equal(scene.state.fog.enabled, true);
            world.release();
        }
        assert.deepEqual(scene.state, baseline());
        assert.equal(scene.listeners.size, 0);
    }
});

test("Stage3D handles all three-token release orders without reviving a removed patch", () => {
    const cases = [
        { order: [0, 1, 2], values: [40, 40, 10] }, { order: [0, 2, 1], values: [40, 30, 10] },
        { order: [1, 0, 2], values: [40, 40, 10] }, { order: [1, 2, 0], values: [40, 20, 10] },
        { order: [2, 0, 1], values: [30, 30, 10] }, { order: [2, 1, 0], values: [30, 20, 10] },
    ];
    for (const { order, values } of cases) {
        const { stage, scene } = fixture();
        const first = stage.acquire(owner().value);
        first.setGlobals({ ambient: { skyIllum: 20 } });
        const leases = [first,
            stage.acquireGlobals(owner().value, { ambient: { skyIllum: 30 } }),
            stage.acquireGlobals(owner().value, { ambient: { skyIllum: 40 } })];
        for (let i = 0; i < order.length; i++) {
            leases[order[i]].release();
            assert.equal(scene.state.ambient.skyIllum, values[i], `release order ${order}, step ${i}`);
        }
        assert.deepEqual(scene.state, baseline());
        assert.equal(scene.liveNodes, 0);
    }
});

test("Stage3D replaces a whole patch, merges nested fields, and preserves acquisition priority", () => {
    const { stage, scene } = fixture();
    const world = stage.acquire(owner().value);
    world.setGlobals({ toneMapping: "linear", fog: { enabled: true, density: 0.1 }, ambient: { skyIllum: 20 } });
    const higher = stage.acquireGlobals(owner().value, { fog: { density: 0.3 }, shadows: { kind: "shadowMap" } });
    world.setGlobals({ fog: { density: 0.2, start: 5 } });
    assert.deepEqual(scene.state, {
        toneMapping: "default", fog: { enabled: false, type: "linear", density: 0.3, start: 5, end: 500 },
        ambient: { skyIllum: 10 }, shadows: { enabled: false, kind: "shadowMap" },
    });
    higher.release();
    assert.equal(scene.state.fog.density, 0.2, "updated covered patch becomes visible only after higher lease releases");
    assert.equal(scene.state.fog.start, 5);
    world.setGlobals({});
    assert.deepEqual(scene.state, baseline());
    world.release();
});

test("Stage3D snapshots incoming nested patches rather than retaining mutable caller data", () => {
    const { stage, scene } = fixture();
    const world = stage.acquire(owner().value);
    const patch = { fog: { density: 0.2 }, ambient: { skyIllum: 20 } };
    world.setGlobals(patch);
    patch.fog.density = 9;
    patch.ambient.skyIllum = 999;
    const temporary = stage.acquireGlobals(owner().value, { toneMapping: "linear" });
    assert.equal(scene.state.fog.density, 0.2);
    assert.equal(scene.state.ambient.skyIllum, 20);
    temporary.release();
    world.release();
    assert.deepEqual(scene.state, baseline());
});

test("Stage3D light shadows share the stage token while the light's private switch follows its owner", () => {
    const { stage, scene } = fixture();
    const world = stage.acquire(owner().value);
    world.setGlobals({ ambient: { skyIllum: 20 } });
    world.light.setShadows(true, "shadowMap");
    assert.deepEqual(scene.state.shadows, { enabled: true, kind: "shadowMap" });
    assert.equal(scene.state.ambient.skyIllum, 20);
    assert.equal(scene.lights[0].shadowEnabled, true);
    const higher = stage.acquireGlobals(owner().value, { shadows: { enabled: false, kind: "planar" } });
    world.light.setShadows(true, "shadowMap");
    assert.deepEqual(scene.state.shadows, { enabled: false, kind: "planar" }, "light update cannot jump above a later globals token");
    assert.equal(scene.lights[0].shadowEnabled, true);
    higher.release();
    assert.deepEqual(scene.state.shadows, { enabled: true, kind: "shadowMap" });
    world.setGlobals({ ambient: { skyIllum: 25 } });
    assert.deepEqual(scene.state.shadows, baseline().shadows, "whole patch replacement withdraws light's global override too");
    assert.equal(scene.lights[0].shadowEnabled, false);
    world.release();
});

test("Stage3D rolls back partially created nodes and permits acquire retry", () => {
    const { stage, scene } = fixture();
    const own = owner();
    scene.failLightOnce = true;
    assert.throws(() => stage.acquire(own.value), /light creation failure/u);
    assert.equal(stage.active, false);
    assert.equal(scene.liveNodes, 0);
    assert.equal(scene.listeners.size, 0);
    assert.equal(own.listeners.size, 0);
    assert.deepEqual(scene.state, baseline());
    const world = stage.acquire(own.value);
    world.release();
    assert.equal(scene.liveNodes, 0);
});

test("Stage3D acquire failure after a partial globals write leaves existing leases intact", () => {
    const { stage, scene } = fixture();
    const existing = stage.acquireGlobals(owner().value, { ambient: { skyIllum: 20 } });
    const saved = structuredClone(scene.state);
    const failed = owner();
    scene.failApplyOnce = true;
    assert.throws(() => stage.acquireGlobals(failed.value, { toneMapping: "linear", ambient: { skyIllum: 99 } }), /globals partial failure/u);
    assert.deepEqual(scene.state, saved);
    assert.equal(failed.listeners.size, 0);
    assert.equal(existing.signal.aborted, false);
    const retry = stage.acquireGlobals(failed.value, { toneMapping: "linear", ambient: { skyIllum: 99 } });
    assert.equal(scene.state.ambient.skyIllum, 99);
    retry.release();
    assert.deepEqual(scene.state, saved);
    existing.release();
    assert.deepEqual(scene.state, baseline());
});

test("Stage3D failed initial stage table commit reclaims nodes, listener and baseline", () => {
    const { stage, scene } = fixture();
    const own = owner();
    scene.failApplyOnce = true;
    assert.throws(() => stage.acquire(own.value), /globals partial failure/u);
    assert.equal(scene.liveNodes, 0);
    assert.equal(scene.listeners.size, 0);
    assert.equal(own.listeners.size, 0);
    assert.deepEqual(scene.state, baseline());
    const world = stage.acquire(own.value);
    world.release();
});

test("Stage3D setGlobals failure restores the complete previous state and remains retryable", () => {
    const { stage, scene } = fixture();
    const world = stage.acquire(owner().value);
    world.setGlobals({ fog: { enabled: true }, ambient: { skyIllum: 20 }, shadows: { enabled: true } });
    const saved = structuredClone(scene.state);
    scene.failApplyOnce = true;
    assert.throws(() => world.setGlobals({ toneMapping: "linear", ambient: { skyIllum: 99 } }), /globals partial failure/u);
    assert.deepEqual(scene.state, saved);
    assert.equal(scene.lights[0].shadowEnabled, true);
    assert.equal(world.signal.aborted, false);
    world.setGlobals({ toneMapping: "linear", ambient: { skyIllum: 99 } });
    assert.equal(scene.state.toneMapping, "linear");
    assert.equal(scene.state.ambient.skyIllum, 99);
    assert.equal(scene.lights[0].shadowEnabled, false);
    world.release();
    assert.deepEqual(scene.state, baseline());
});

test("Stage3D partial private light failure rolls back both globals and the light switch", () => {
    const { stage, scene } = fixture();
    const world = stage.acquire(owner().value);
    world.setGlobals({ ambient: { skyIllum: 20 } });
    const saved = structuredClone(scene.state);
    scene.lights[0].failShadowOnce = true;
    assert.throws(() => world.light.setShadows(true, "shadowMap"), /light partial failure/u);
    assert.deepEqual(scene.state, saved);
    assert.equal(scene.lights[0].shadowEnabled, false);
    world.light.setShadows(true, "shadowMap");
    assert.equal(scene.lights[0].shadowEnabled, true);
    assert.deepEqual(scene.state.shadows, { enabled: true, kind: "shadowMap" });
    world.release();
});

test("Stage3D failed release keeps the lease live until a successful retry restores baseline", () => {
    const { stage, scene } = fixture();
    const own = owner();
    const world = stage.acquire(own.value);
    world.setGlobals({ ambient: { skyIllum: 99 }, toneMapping: "linear" });
    const saved = structuredClone(scene.state), nodes = scene.liveNodes;
    scene.failApplyOnce = true;
    assert.throws(() => world.release(), /globals partial failure/u);
    assert.deepEqual(scene.state, saved);
    assert.equal(scene.liveNodes, nodes);
    assert.equal(world.signal.aborted, false);
    assert.equal(own.listeners.size, 1);
    assert.equal(stage.active, true);
    world.release();
    assert.deepEqual(scene.state, baseline());
    assert.equal(world.signal.aborted, true);
    assert.equal(scene.liveNodes, 0);
    assert.equal(scene.listeners.size, 0);
    assert.equal(own.listeners.size, 0);
});

test("Stage3D owner abort cancels only its token and invalidates all stage handle operations", () => {
    const { stage, scene, errors } = fixture();
    const own = owner();
    const world = stage.acquire(own.value);
    world.setGlobals({ ambient: { skyIllum: 20 }, fog: { enabled: true } });
    const independent = stage.acquireGlobals(owner().value, { ambient: { skyIllum: 40 } });
    own.controller.abort();
    assert.equal(world.signal.aborted, true);
    assert.equal(stage.active, false);
    assert.equal(scene.liveNodes, 0);
    assert.equal(scene.state.ambient.skyIllum, 40);
    assert.equal(scene.state.fog.enabled, false);
    assert.equal(own.listeners.size, 0);
    assert.equal(world.root.isValid, false, "released root remains inspectable but has been destroyed");
    assert.throws(() => world.camera.setFov(60), Stage3DInactive);
    assert.throws(() => world.light.setDirection({ x: 0, y: -1, z: 0 }), Stage3DInactive);
    assert.throws(() => world.setGlobals({}), Stage3DInactive);
    assert.throws(() => world.screenToRay(0, 0), Stage3DInactive);
    world.release();
    independent.release();
    assert.deepEqual(scene.state, baseline());
    assert.deepEqual(errors, []);
});

test("Stage3D polls isActive on the next frame even without an abort event", () => {
    const { stage, scene } = fixture();
    const own = owner(), globalOwner = owner();
    const world = stage.acquire(own.value);
    world.setGlobals({ toneMapping: "linear" });
    const globals = stage.acquireGlobals(globalOwner.value, { ambient: { skyIllum: 50 } });
    own.state.active = false;
    globalOwner.state.active = false;
    assert.equal(world.signal.aborted, false, "test must not accidentally trigger cleanup by reading coordinator.active");
    scene.emit("frame");
    assert.equal(world.signal.aborted, true);
    assert.equal(globals.signal.aborted, true);
    assert.deepEqual(scene.state, baseline());
    assert.equal(scene.liveNodes, 0);
    assert.equal(scene.listeners.size, 0);
    assert.equal(own.listeners.size + globalOwner.listeners.size, 0);
});

test("Stage3D abort during synchronous setup rejects acquire and leaves no partial stage", () => {
    for (const phase of ["create", "apply"] as const) {
        const { stage, scene, errors } = fixture();
        const own = owner();
        if (phase === "create") scene.onCreate = () => own.controller.abort();
        else scene.onApply = () => own.controller.abort();
        assert.throws(() => stage.acquire(own.value), Stage3DInactive);
        assert.equal(scene.liveNodes, 0);
        assert.equal(scene.listeners.size, 0);
        assert.equal(own.listeners.size, 0);
        assert.deepEqual(scene.state, baseline());
        assert.deepEqual(errors, []);
        const replacement = stage.acquire(owner().value);
        replacement.release();
    }
});

test("Stage3D rejects owners already aborted or inactive before touching the scene", () => {
    const { stage, engine } = fixture();
    const aborted = owner(), inactive = owner();
    aborted.controller.abort(); inactive.state.active = false;
    for (const own of [aborted, inactive]) {
        assert.throws(() => stage.acquire(own.value), Stage3DInactive);
        assert.throws(() => stage.acquireGlobals(own.value, {}), Stage3DInactive);
        assert.equal(own.listeners.size, 0);
    }
    assert.equal(engine.captures, 0);
});

test("Stage3D stale release and stale camera handles cannot affect a new stage", () => {
    const { stage, scene } = fixture();
    const own = owner();
    const old = stage.acquire(own.value);
    old.release();
    const fresh = stage.acquire(owner().value);
    fresh.setGlobals({ ambient: { skyIllum: 77 } });
    const count = scene.liveNodes;
    old.release();
    own.controller.abort();
    assert.throws(() => old.camera.setFov(80), Stage3DInactive);
    assert.equal(scene.liveNodes, count);
    assert.equal(scene.state.ambient.skyIllum, 77);
    assert.equal(fresh.signal.aborted, false);
    fresh.release(); fresh.release();
    assert.equal(scene.listeners.size, 0);
});

test("Stage3D scene replacement cleans the captured scene without writing into its successor", () => {
    const { stage, scene, engine } = fixture();
    const old = stage.acquire(owner().value);
    old.setGlobals({ ambient: { skyIllum: 80 }, toneMapping: "linear" });
    const successor = new FakeScene();
    successor.state.ambient.skyIllum = 500;
    engine.current = successor;
    scene.emit("destroy");
    assert.equal(old.signal.aborted, true);
    assert.deepEqual(scene.state, baseline());
    assert.equal(scene.listeners.size, 0);
    assert.equal(scene.liveNodes, 0);
    assert.equal(successor.applied.length, 0);
    assert.equal(successor.state.ambient.skyIllum, 500);
    const fresh = stage.acquire(owner().value);
    fresh.setGlobals({ ambient: { skyIllum: 600 } });
    old.release();
    assert.equal(successor.state.ambient.skyIllum, 600);
    fresh.release();
    assert.equal(successor.state.ambient.skyIllum, 500);
});

test("Stage3D invalid scene and externally destroyed stage nodes revoke their leases", () => {
    for (const reason of ["scene", "node"] as const) {
        const { stage, scene } = fixture();
        const world = stage.acquire(owner().value);
        world.setGlobals({ ambient: { skyIllum: 30 } });
        const writes = scene.applied.length;
        if (reason === "scene") scene.valid = false;
        else (world.root as unknown as FakeNode).destroy();
        scene.emit("frame");
        assert.equal(world.signal.aborted, true);
        assert.equal(scene.liveNodes, 0);
        assert.equal(scene.listeners.size, 0);
        if (reason === "scene") assert.equal(scene.applied.length, writes, "cannot restore a destroyed scene through a stale adapter");
        else assert.deepEqual(scene.state, baseline());
    }
});

test("Stage3D dispose restores globals, destroys nodes, cancels leases and permanently rejects acquire", () => {
    const { stage, scene } = fixture();
    const own = owner(), other = owner();
    const world = stage.acquire(own.value);
    world.setGlobals({ ambient: { skyIllum: 99 } });
    const globals = stage.acquireGlobals(other.value, { toneMapping: "linear" });
    stage.dispose(); stage.dispose();
    assert.deepEqual(scene.state, baseline());
    assert.equal(world.signal.aborted, true);
    assert.equal(globals.signal.aborted, true);
    assert.equal(scene.liveNodes, 0);
    assert.equal(scene.listeners.size, 0);
    assert.equal(own.listeners.size + other.listeners.size, 0);
    assert.throws(() => stage.acquire(owner().value), Stage3DInactive);
    assert.throws(() => stage.acquireGlobals(owner().value, {}), Stage3DInactive);
    world.release(); globals.release();
});

test("Stage3D dispose failure restores the previous live state and permits an explicit retry", () => {
    const { stage, scene } = fixture();
    const own = owner();
    const world = stage.acquire(own.value);
    world.setGlobals({ ambient: { skyIllum: 99 }, toneMapping: "linear", fog: { enabled: true } });
    const saved = structuredClone(scene.state), nodeCount = scene.liveNodes;
    scene.failApplyOnce = true;
    assert.throws(() => stage.dispose(), /globals partial failure/u);
    assert.deepEqual(scene.state, saved);
    assert.equal(world.signal.aborted, false);
    assert.equal(scene.liveNodes, nodeCount);
    assert.equal(own.listeners.size, 1);
    world.camera.setFov(65);
    assert.equal(scene.cameras[0].fov, 65);
    stage.dispose();
    assert.equal(world.signal.aborted, true);
    assert.equal(scene.liveNodes, 0);
    assert.equal(scene.listeners.size, 0);
    assert.equal(own.listeners.size, 0);
    assert.deepEqual(scene.state, baseline());
});

test("Stage3D drains an abort callback releasing an earlier token before acquire returns", () => {
    const { stage, scene, errors } = fixture();
    const bOwner = owner(), aOwner = owner();
    const b = stage.acquireGlobals(bOwner.value, { ambient: { skyIllum: 20 } });
    const a = stage.acquireGlobals(aOwner.value, { fog: { enabled: true } });
    a.signal.addEventListener("abort", () => b.release(), { once: true });
    scene.onApply = () => aOwner.controller.abort();
    const c = stage.acquireGlobals(owner().value, { toneMapping: "linear" });
    assert.equal(a.signal.aborted, true);
    assert.equal(b.signal.aborted, true, "cancel callbacks cannot leave earlier tokens pending until another frame");
    assert.equal(aOwner.listeners.size + bOwner.listeners.size, 0);
    assert.deepEqual(scene.state, { ...baseline(), toneMapping: "linear" });
    assert.equal(c.signal.aborted, false);
    assert.deepEqual(errors, []);
    c.release();
    assert.deepEqual(scene.state, baseline());
});

test("Stage3D ignores a delayed callback from a closed scene subscription", () => {
    const { stage, scene, engine } = fixture();
    const old = stage.acquire(owner().value);
    const delayed = [...scene.listeners][0];
    scene.emit("destroy");
    const successor = new FakeScene();
    successor.state.ambient.skyIllum = 500;
    engine.current = successor;
    const fresh = stage.acquire(owner().value);
    fresh.setGlobals({ ambient: { skyIllum: 600 } });
    const writes = successor.applied.length;
    delayed("destroy"); delayed("resize"); delayed("frame");
    assert.equal(old.signal.aborted, true);
    assert.equal(fresh.signal.aborted, false);
    assert.equal(successor.state.ambient.skyIllum, 600);
    assert.equal(successor.applied.length, writes);
    assert.equal(successor.liveNodes > 0, true);
    assert.equal(successor.listeners.size, 1);
    fresh.release();
    assert.equal(successor.state.ambient.skyIllum, 500);
});

test("Stage3D ignores a stale subscription even when the next scope reuses the same scene wrapper", () => {
    const { stage, scene, engine } = fixture();
    const old = stage.acquire(owner().value);
    const delayed = [...scene.listeners][0];
    old.release();
    const fresh = stage.acquire(owner().value);
    fresh.setGlobals({ ambient: { skyIllum: 600 } });
    assert.equal(engine.captures, 2, "both acquisitions capture the same FakeScene object in distinct scopes");
    const writes = scene.applied.length;
    const currentCamera = scene.cameras[scene.cameras.length - 1];
    const viewport = { ...currentCamera.rect };
    // A stale resize would visibly change the new camera if admitted.
    scene.metrics = { ...scene.metrics, content: { x: 100, y: 200, width: 1200, height: 2400 } };
    delayed("resize"); delayed("frame"); delayed("destroy");
    assert.equal(old.signal.aborted, true);
    assert.equal(fresh.signal.aborted, false);
    assert.deepEqual(currentCamera.rect, viewport);
    assert.equal(scene.state.ambient.skyIllum, 600);
    assert.equal(scene.applied.length, writes);
    assert.equal(scene.listeners.size, 1);
    assert.equal(scene.liveNodes > 0, true);
    fresh.release();
    assert.deepEqual(scene.state, baseline());
    assert.equal(scene.listeners.size, 0);
});

test("Stage3D does not accept a dirty baseline after acquire and its rollback both fail", () => {
    const { stage, scene } = fixture();
    const failedOwner = owner();
    scene.applyFailures.push("partial", "before");
    assert.throws(() => stage.acquireGlobals(failedOwner.value, { ambient: { skyIllum: 99 }, toneMapping: "linear" }), Stage3DApplyError);
    assert.equal(scene.state.ambient.skyIllum, 99, "fixture must leave a dirty engine value after the failed rollback");
    assert.equal(failedOwner.listeners.size, 0);
    scene.applyFailures.push("before");
    const retryOwner = owner();
    assert.throws(() => stage.acquireGlobals(retryOwner.value, { fog: { enabled: true } }), /globals before-write failure/u);
    assert.equal(retryOwner.listeners.size, 0, "failed baseline recovery cannot publish a new lease");
    const recovered = stage.acquireGlobals(retryOwner.value, { fog: { enabled: true } });
    assert.deepEqual(scene.state, { ...baseline(), fog: { ...baseline().fog, enabled: true } });
    recovered.release();
    assert.deepEqual(scene.state, baseline(), "the original baseline must survive both failures");
    assert.equal(scene.listeners.size, 0);
});

test("Stage3D restores the committed state before another operation after update/release/dispose rollback failure", () => {
    for (const operation of ["update", "release", "dispose"] as const) {
        const { stage, scene } = fixture();
        const world = stage.acquire(owner().value);
        world.setGlobals({ ambient: { skyIllum: 20 }, toneMapping: "linear", fog: { enabled: true } });
        const saved = structuredClone(scene.state);
        scene.applyFailures.push("partial", "before");
        assert.throws(() => {
            if (operation === "update") world.setGlobals({ ambient: { skyIllum: 99 } });
            else if (operation === "release") world.release();
            else stage.dispose();
        }, Stage3DApplyError);
        assert.equal(world.signal.aborted, false);
        world.camera.setFov(65);
        assert.deepEqual(scene.state, saved, `${operation} rollback failure must recover the last committed table before accepting work`);
        assert.equal(scene.cameras[0].fov, 65);
        if (operation === "dispose") stage.dispose();
        else world.release();
        assert.deepEqual(scene.state, baseline());
        assert.equal(world.signal.aborted, true);
        assert.equal(scene.listeners.size, 0);
        assert.equal(scene.liveNodes, 0);
    }
});

test("Stage3D twenty open/close cycles reclaim content nodes and every lifecycle listener", () => {
    const { stage, scene, errors } = fixture();
    for (let cycle = 0; cycle < 20; cycle++) {
        const own = owner(), other = owner();
        const world = stage.acquire(own.value);
        const content = new FakeNode(`content-${cycle}`, STAGE3D_DEFAULT_LAYER);
        (world.root as unknown as FakeNode).addChild(content);
        world.setGlobals({ fog: { enabled: true }, ambient: { skyIllum: cycle + 100 } });
        const globals = stage.acquireGlobals(other.value, { toneMapping: "linear" });
        if (cycle % 2 === 0) { world.release(); globals.release(); }
        else { globals.release(); own.controller.abort(); }
        assert.equal(content.isValid, false);
        assert.equal(scene.liveNodes, 0);
        assert.equal(scene.listeners.size, 0);
        assert.equal(own.listeners.size + other.listeners.size, 0);
        assert.deepEqual(scene.state, baseline());
    }
    assert.deepEqual(errors, []);
});

test("Stage3D forwards pose/light operations and validates values before changing the engine", () => {
    const { stage, scene } = fixture();
    const world = stage.acquire(owner().value);
    const position = { x: 1, y: 2, z: 3 }, lookAt = { x: 0, y: 0, z: 0 };
    world.camera.setPose(position, lookAt);
    world.camera.setFov(70);
    world.camera.setClear({ r: 10, g: 20, b: 30, a: 255 });
    world.light.setDirection({ x: 0, y: -1, z: 0 });
    world.light.setColor({ r: 255, g: 100, b: 50, a: 255 });
    assert.deepEqual(scene.cameras[0].pose, { position, lookAt });
    assert.equal(scene.cameras[0].fov, 70);
    assert.deepEqual(scene.cameras[0].clear, { r: 10, g: 20, b: 30, a: 255 });
    assert.deepEqual(scene.lights[0].direction, { x: 0, y: -1, z: 0 });
    assert.deepEqual(scene.lights[0].color, { r: 255, g: 100, b: 50, a: 255 });
    assert.throws(() => world.camera.setFov(180), /fov/u);
    assert.throws(() => world.camera.setPose(position, position), /equals lookAt/u);
    assert.throws(() => world.camera.setPose({ x: Number.NaN, y: 0, z: 0 }, lookAt), /finite/u);
    assert.throws(() => world.light.setDirection({ x: 0, y: 0, z: 0 }), /nonzero/u);
    assert.throws(() => world.camera.setClear({ r: 256, g: 0, b: 0, a: 255 }), /channels/u);
    assert.equal(scene.cameras[0].fov, 70);
    assert.deepEqual(scene.cameras[0].pose, { position, lookAt });
    world.camera.setClear("skybox");
    assert.equal(scene.cameras[0].clear, "skybox");
    world.release();
});

test("Stage3D resizes explicit viewports and converts pick points to actual screen pixels", () => {
    const { stage, scene } = fixture();
    scene.metrics = {
        design: { x: -100, y: 50, width: 400, height: 800 },
        screen: { width: 1000, height: 2000 },
        content: { x: 100, y: 200, width: 800, height: 1600 },
    };
    const viewport = { x: 0, y: 250, width: 200, height: 400 };
    const world = stage.acquire(owner().value, { viewport });
    assert.deepEqual(scene.cameras[0].rect, { x: 0.3, y: 0.3, width: 0.4, height: 0.4 });
    viewport.x = 99;
    const ray = world.screenToRay(0, 250);
    assert.deepEqual(ray, { origin: { x: 300, y: 600, z: 5 }, direction: { x: 0, y: 0, z: -1 } });
    scene.lastRay!.origin.x = -999;
    assert.equal(ray.origin.x, 300, "ray data must not alias adapter scratch objects");
    scene.metrics = { ...scene.metrics, screen: { width: 2000, height: 2000 }, content: { x: 600, y: 200, width: 800, height: 1600 } };
    scene.emit("resize");
    assert.deepEqual(scene.cameras[0].rect, { x: 0.4, y: 0.3, width: 0.2, height: 0.4 });
    assert.deepEqual(world.screenToRay(0, 250).origin, { x: 800, y: 600, z: 5 });
    assert.deepEqual(world.screenToRay(-200, -50).origin, { x: 400, y: 0, z: 5 }, "owned drag may leave the visible design rectangle");
    const before = { ...scene.cameras[0].rect };
    assert.throws(() => world.camera.setViewport({ x: 0, y: 0, width: 1, height: 1 }), /visible bounds/u);
    assert.deepEqual(scene.cameras[0].rect, before);
    world.camera.setViewport(scene.metrics.design);
    assert.deepEqual(scene.cameras[0].rect, { x: 0.3, y: 0.1, width: 0.4, height: 0.8 });
    world.release();
});

test("Stage3D default viewport follows a new visible design rectangle on resize", () => {
    const { stage, scene } = fixture();
    const world = stage.acquire(owner().value);
    scene.metrics = {
        design: { x: 20, y: 30, width: 1200, height: 800 },
        screen: { width: 2400, height: 1600 },
        content: { x: 0, y: 0, width: 2400, height: 1600 },
    };
    scene.emit("resize");
    assert.deepEqual(scene.cameras[0].rect, { x: 0, y: 0, width: 1, height: 1 });
    assert.deepEqual(world.screenToRay(20, 30).origin, { x: 0, y: 0, z: 5 });
    world.release();
});

test("Stage3D cancellation callbacks can read committed occupancy without reentering an update", () => {
    for (const operation of ["release", "owner", "dispose"] as const) {
        const { stage } = fixture();
        const own = owner();
        const world = stage.acquire(own.value);
        const values: boolean[] = [], failures: unknown[] = [];
        world.signal.addEventListener("abort", () => {
            try { values.push(stage.active); } catch (error) { failures.push(error); }
        });
        if (operation === "release") world.release();
        else if (operation === "owner") own.controller.abort();
        else stage.dispose();
        assert.deepEqual(failures, [], `${operation}: a readonly query is not a reentrant mutation`);
        assert.deepEqual(values, [false]);
    }
    const { stage } = fixture();
    const world = stage.acquire(owner().value);
    const globals = stage.acquireGlobals(owner().value, {});
    const values: boolean[] = [], failures: unknown[] = [];
    globals.signal.addEventListener("abort", () => {
        try { values.push(stage.active); } catch (error) { failures.push(error); }
    });
    globals.release();
    assert.deepEqual(failures, []);
    assert.deepEqual(values, [true], "releasing only globals preserves the committed stage occupancy");
    world.release();
});
