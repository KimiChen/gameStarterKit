/** SC1-B3: run the production adapter against a controlled cc boundary, without Creator. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { Camera, DirectionalLight, Node } from "cc";
import { designToScreen, resolveViewport } from "../src/logic/scene3d/viewport";
import type { Stage3DGlobalsState } from "../src/view/scene3d/Stage3D";

class FakeVec3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
    clone(): FakeVec3 { return new FakeVec3(this.x, this.y, this.z); }
}
class FakeColor {
    constructor(public r = 0, public g = 0, public b = 0, public a = 255) {}
    clone(): FakeColor { return new FakeColor(this.r, this.g, this.b, this.a); }
}
class FakeRect {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
}

interface Binding { type: string; callback: () => void; target: unknown; }
class FakeEvents {
    readonly bindings: Binding[] = [];
    readonly offCalls: Binding[] = [];
    failOn: { type: string; afterAttach: boolean; error: Error } | undefined;
    on(type: string, callback: () => void, target?: unknown): void {
        const failure = this.failOn?.type === type ? this.failOn : undefined;
        if (failure && !failure.afterAttach) throw failure.error;
        this.bindings.push({ type, callback, target });
        if (failure) throw failure.error;
    }
    off(type: string, callback: () => void, target?: unknown): void {
        assert.equal(typeof callback, "function", "never remove unrelated listeners with a bare off(event)");
        this.offCalls.push({ type, callback, target });
        for (let i = this.bindings.length - 1; i >= 0; i--) {
            const binding = this.bindings[i];
            if (binding.type === type && binding.callback === callback && binding.target === target) this.bindings.splice(i, 1);
        }
    }
    emit(type: string): void {
        for (const binding of [...this.bindings]) {
            if (binding.type === type) binding.callback.call(binding.target);
        }
    }
    reset(): void { this.bindings.length = 0; this.offCalls.length = 0; this.failOn = undefined; }
}

class FakeNode {
    static readonly created: FakeNode[] = [];
    readonly children: FakeNode[] = [];
    readonly components: object[] = [];
    readonly operations: string[] = [];
    layer = 0;
    parent: FakeNode | null = null;
    isValid = true;
    toDestroy = false;
    destroyCalls = 0;
    private enabled = true;
    worldPosition = new FakeVec3();
    lookTarget: FakeVec3 | undefined;
    lookUp: FakeVec3 | undefined;
    failAddAfterAttach: Error | undefined;
    constructor(readonly name = "node") { FakeNode.created.push(this); }
    get active(): boolean { return this.enabled; }
    set active(value: boolean) { this.enabled = value; this.operations.push(`active:${value}`); }
    addChild(node: FakeNode): void {
        node.parent = this;
        this.children.push(node);
        if (this.failAddAfterAttach) throw this.failAddAfterAttach;
    }
    addComponent<T extends { node: FakeNode }>(Type: new () => T): T {
        const component = new Type(); component.node = this; this.components.push(component); return component;
    }
    removeFromParent(): void {
        this.operations.push("detach");
        if (this.parent) {
            const index = this.parent.children.indexOf(this);
            if (index >= 0) this.parent.children.splice(index, 1);
        }
        this.parent = null;
    }
    destroy(): boolean {
        this.operations.push("destroy");
        this.destroyCalls++;
        this.toDestroy = true; // Cocos isValid remains true until deferred destruction.
        return true;
    }
    setWorldPosition(position: FakeVec3): void {
        assert.ok(position instanceof FakeVec3, "engine position setters need a real Vec3");
        this.operations.push("worldPosition");
        this.worldPosition = position.clone();
    }
    lookAt(target: FakeVec3, up?: FakeVec3): void {
        assert.ok(target instanceof FakeVec3, "engine lookAt needs a real Vec3");
        this.operations.push("lookAt");
        this.lookTarget = target.clone();
        if (up) { assert.ok(up instanceof FakeVec3); this.lookUp = up.clone(); }
    }
}
class FakeCamera {
    static readonly ProjectionType = { PERSPECTIVE: 1, ORTHO: 0 };
    static readonly ClearFlag = { SOLID_COLOR: 7, DEPTH_ONLY: 6, SKYBOX: 14, DONT_CLEAR: 0 };
    node!: FakeNode;
    projection = -1;
    priority = -1;
    visibility = 0;
    fov = 0;
    rect = new FakeRect();
    clearFlags = 0;
    clearColor = new FakeColor();
    readonly ray = { o: new FakeVec3(1, 2, 3), d: new FakeVec3(0, 0, -1) };
    readonly rayCalls: { x: number; y: number }[] = [];
    readonly order: string[] = [];
    readonly camera = { update: (force: boolean): void => {
        assert.equal(force, true, "same-frame picking must force a matrix refresh");
        this.order.push("update");
    } };
    screenPointToRay(x: number, y: number): typeof this.ray {
        this.order.push("ray"); this.rayCalls.push({ x, y }); return this.ray;
    }
}
class FakeLight { node!: FakeNode; color = new FakeColor(); shadowEnabled = false; }

/** SceneGlobals remembers its selected type while the disabled renderer uses NONE.
 * Model the observable 3.8.8 enabled/type side effects, including activation work
 * caused by changing type while enabled (planar shadows allocate a material).
 */
class FakeSwitchInfo {
    private active = false;
    private selected = 0;
    effectiveType: number;
    readonly activations: number[] = [];
    constructor(private readonly none: number) { this.effectiveType = none; }
    get enabled(): boolean { return this.active; }
    set enabled(value: boolean) {
        if (this.active === value) return;
        this.active = value;
        this.effectiveType = value ? this.selected : this.none;
        if (value) this.activations.push(this.selected);
    }
    get type(): number { return this.selected; }
    set type(value: number) {
        this.selected = value;
        this.effectiveType = this.active ? value : this.none;
        if (this.active) this.activations.push(value);
    }
}
class FakeFogInfo extends FakeSwitchInfo {
    fogDensity = 0.1; fogStart = -10; fogEnd = -20;
    fogColor = new FakeColor(11, 12, 13); accurate = true;
    constructor() { super(4); }
}
class FakeShadowsInfo extends FakeSwitchInfo {
    shadowColor = new FakeColor(41, 42, 43); shadowMapSize = 1024;
    constructor() { super(2); }
}

function rawGlobals() {
    return {
        postSettings: { toneMappingType: 0 },
        fog: new FakeFogInfo(),
        ambient: { skyIllum: 100, skyLightingColor: new FakeColor(21, 22, 23),
            groundLightingColor: new FakeColor(31, 32, 33) },
        shadows: new FakeShadowsInfo(),
        skybox: { enabled: true, useHDR: true, envmap: { name: "caller-owned-cubemap" } },
    };
}
class FakeScene extends FakeNode { globals = rawGlobals(); }
let currentScene: FakeScene | null = null;
let sceneReads = 0;
const validityCalls: { value: unknown; strict: boolean | undefined }[] = [];
const directorEvents = new FakeEvents();
const viewEvents = new FakeEvents();
const metrics = {
    origin: { x: 0, y: 0 }, size: { width: 375, height: 812 },
    viewport: new FakeRect(0, 0, 750, 1624), scaleX: 2, scaleY: 2,
    screen: { width: 750, height: 1624 },
};
const cc = {
    Node: FakeNode, Camera: FakeCamera, DirectionalLight: FakeLight, Vec3: FakeVec3, Color: FakeColor, Rect: FakeRect,
    isValid: (value: unknown, strict?: boolean): boolean => {
        validityCalls.push({ value, strict });
        return value instanceof FakeNode && value.isValid && (!strict || !value.toDestroy);
    },
    director: {
        getScene: (): FakeScene | null => { sceneReads++; return currentScene; },
        on: directorEvents.on.bind(directorEvents), off: directorEvents.off.bind(directorEvents),
    },
    Director: { EVENT_AFTER_UPDATE: "after-update", EVENT_BEFORE_SCENE_LAUNCH: "before-scene-launch" },
    view: {
        getVisibleOrigin: () => metrics.origin, getVisibleSize: () => metrics.size,
        getViewportRect: () => metrics.viewport, getScaleX: () => metrics.scaleX, getScaleY: () => metrics.scaleY,
        on: viewEvents.on.bind(viewEvents), off: viewEvents.off.bind(viewEvents),
    },
    screen: { get windowSize() { return metrics.screen; } },
};
let loaded: Promise<typeof import("../src/view/scene3d/cocosStage3DEngine")> | undefined;
function loadAdapter(): Promise<typeof import("../src/view/scene3d/cocosStage3DEngine")> {
    if (loaded) return loaded;
    loaded = (async () => {
        const moduleApi = createRequire(import.meta.url)("node:module") as {
            _load(request: string, parent: unknown, isMain: boolean): unknown;
        };
        const original = moduleApi._load;
        moduleApi._load = function (request, parent, isMain): unknown {
            if (request === "cc") return cc;
            return original.call(this, request, parent, isMain);
        };
        try { return await import("../src/view/scene3d/cocosStage3DEngine"); }
        finally { moduleApi._load = original; }
    })();
    return loaded;
}
function reset(): FakeScene {
    directorEvents.reset(); viewEvents.reset(); validityCalls.length = 0; FakeNode.created.length = 0;
    Object.assign(metrics, {
        origin: { x: 0, y: 0 }, size: { width: 375, height: 812 },
        viewport: new FakeRect(0, 0, 750, 1624), scaleX: 2, scaleY: 2, screen: { width: 750, height: 1624 },
    });
    currentScene = new FakeScene("scene"); sceneReads = 0;
    return currentScene;
}
const asNode = (node: FakeNode): Node => node as unknown as Node;
const asCamera = (camera: FakeCamera): Camera => camera as unknown as Camera;
const asLight = (light: FakeLight): DirectionalLight => light as unknown as DirectionalLight;

function watchWrites(target: object, keys: readonly string[], prefix: string, writes: string[]): void {
    for (const key of keys) {
        let owner: object | null = target;
        let descriptor: PropertyDescriptor | undefined;
        while (owner && !descriptor) {
            descriptor = Object.getOwnPropertyDescriptor(owner, key);
            owner = Object.getPrototypeOf(owner) as object | null;
        }
        let stored: unknown = Reflect.get(target, key);
        Object.defineProperty(target, key, {
            configurable: true, enumerable: true,
            get: () => descriptor?.get ? descriptor.get.call(target) : stored,
            set: (value: unknown) => {
                writes.push(`${prefix}.${key}`);
                if (descriptor?.set) descriptor.set.call(target, value);
                else stored = value;
            },
        });
    }
}

function expectedGlobals(): Stage3DGlobalsState {
    return {
        toneMapping: "default",
        fog: { enabled: false, type: "linear", density: 0.1, start: -10, end: -20 },
        ambient: { skyIllum: 100 }, shadows: { enabled: false, kind: "planar" },
    };
}

test("Cocos Stage3D constructs lazily and requires a live captured scene", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    reset(); currentScene = null;
    const engine = new CocosStage3DEngine();
    assert.equal(sceneReads, 0, "construction cannot access a scene before launch");
    assert.throws(() => engine.captureScene());
    const original = reset();
    const scope = engine.captureScene();
    assert.equal(scope.isValid(), true);
    original.toDestroy = true;
    assert.equal(original.isValid, true);
    assert.equal(scope.isValid(), false, "queued Cocos destruction is already inactive");
    assert.ok(validityCalls.some((call) => call.value === original && call.strict === true));
    assert.throws(() => engine.captureScene(), "capturing a queued-for-destruction scene must fail");
});

test("Cocos Stage3D scope stays bound to its captured scene and components", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    const original = reset();
    const engine = new CocosStage3DEngine();
    const scope = engine.captureScene();
    const node = scope.createNode("Stage3DRoot", 1 << 30) as unknown as FakeNode;
    assert.equal(node.name, "Stage3DRoot");
    assert.equal(node.layer, 1 << 30);
    assert.equal(node.parent, original);
    assert.deepEqual(original.children, [node]);
    const camera = scope.addCamera(asNode(node));
    const light = scope.addLight(asNode(node));
    assert.ok(camera instanceof FakeCamera);
    assert.ok(light instanceof FakeLight);
    assert.deepEqual(node.components, [camera, light]);
    const next = new FakeScene("next"); next.globals.ambient.skyIllum = 999;
    currentScene = next;
    assert.equal(scope.isValid(), false, "same engine must reject stale scene identity");
    const nextScope = engine.captureScene();
    assert.equal(nextScope.globals.read().ambient.skyIllum, 999);
    assert.equal(original.globals.ambient.skyIllum, 100);
    assert.throws(() => scope.globals.read(), /inactive|no longer active/iu);
    assert.throws(() => scope.globals.apply(expectedGlobals()), /inactive|no longer active/iu);
    assert.throws(() => scope.createNode("stale", 1), /inactive|no longer active/iu);
    assert.equal(next.globals.ambient.skyIllum, 999);
    scope.destroyNode(asNode(node));
    assert.equal(node.destroyCalls, 1, "old scene nodes still need cleanup after a scene switch");
    assert.equal(next.children.length, 0, "old content must not move to the new scene");
});

test("Cocos Stage3D destroys nodes inactive-first, detached and exactly once", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    const original = reset();
    const scope = new CocosStage3DEngine().captureScene();
    const node = scope.createNode("owned", 1) as unknown as FakeNode;
    node.operations.length = 0;
    scope.destroyNode(asNode(node));
    assert.deepEqual(node.operations, ["active:false", "detach", "destroy"]);
    assert.equal(original.children.length, 0);
    assert.equal(node.isValid, true);
    assert.equal(scope.isNodeValid(asNode(node)), false, "strict validity catches deferred destruction");
    scope.destroyNode(asNode(node));
    assert.equal(node.destroyCalls, 1);
});

test("Cocos Stage3D cleans a node if attaching it throws after partial registration", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    const original = reset();
    const scope = new CocosStage3DEngine().captureScene();
    const failure = new Error("addChild failed after attach"); original.failAddAfterAttach = failure;
    assert.throws(() => scope.createNode("partial", 1), (error: unknown) => error === failure);
    assert.equal(original.children.length, 0);
    const partial = FakeNode.created.find((node) => node.name === "partial");
    assert.ok(partial);
    assert.equal(partial.destroyCalls, 1);
    assert.equal(partial.active, false);
});

test("Cocos Stage3D maps world pose, viewport and clear flags through real engine value objects", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    reset();
    const scope = new CocosStage3DEngine().captureScene();
    const camera = scope.addCamera(scope.createNode("camera", 1)) as unknown as FakeCamera;
    const position = { x: 1, y: 2, z: 3 }, target = { x: 4, y: 5, z: 6 };
    scope.setCameraPose(asCamera(camera), position, target);
    assert.deepEqual(camera.node.operations, ["worldPosition", "lookAt"]);
    assert.deepEqual({ ...camera.node.worldPosition }, position);
    assert.deepEqual({ ...camera.node.lookTarget }, target);
    const rect = { x: 0.1, y: 0.2, width: 0.6, height: 0.7 };
    scope.setCameraViewport(asCamera(camera), rect);
    assert.ok(camera.rect instanceof FakeRect);
    assert.deepEqual({ ...camera.rect }, rect, "already-normalized rect must not be divided twice");
    const color = { r: 1, g: 2, b: 3, a: 4 };
    scope.setCameraClear(asCamera(camera), color);
    assert.equal(camera.clearFlags, 7);
    assert.ok(camera.clearColor instanceof FakeColor);
    assert.deepEqual({ ...camera.clearColor }, color);
    color.r = 99;
    assert.equal(camera.clearColor.r, 1);
    scope.setCameraClear(asCamera(camera), "skybox");
    assert.equal(camera.clearFlags, 14);
    assert.equal(Object.hasOwn(camera, "aspect"), false);
});

test("Cocos Stage3D refreshes camera matrices before same-frame ray queries and copies output vectors", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    reset();
    const scope = new CocosStage3DEngine().captureScene();
    const camera = scope.addCamera(scope.createNode("camera", 1)) as unknown as FakeCamera;
    const ray = scope.screenPointToRay(asCamera(camera), 123, 456);
    assert.deepEqual(camera.order, ["update", "ray"]);
    assert.deepEqual(camera.rayCalls, [{ x: 123, y: 456 }]);
    assert.deepEqual(ray, { origin: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: -1 } });
    camera.ray.o.x = 99; camera.ray.d.z = 0;
    assert.equal(ray.origin.x, 1); assert.equal(ray.direction.z, -1);
});

test("Cocos Stage3D light direction is relative to world position and colors are copied", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    const original = reset();
    const scope = new CocosStage3DEngine().captureScene();
    const light = scope.addLight(scope.createNode("light", 1)) as unknown as FakeLight;
    light.node.worldPosition = new FakeVec3(10, 20, 30);
    scope.setLightDirection(asLight(light), { x: -2, y: 3, z: -4 });
    assert.deepEqual({ ...light.node.lookTarget }, { x: 8, y: 23, z: 26 });
    const color = { r: 90, g: 80, b: 70, a: 60 };
    scope.setLightColor(asLight(light), color);
    assert.ok(light.color instanceof FakeColor);
    color.r = 0; assert.equal(light.color.r, 90);
    assert.equal(original.globals.shadows.enabled, false, "private light setters cannot bypass the globals token table");
});

test("Cocos Stage3D uses a nonparallel up vector for vertical camera and light directions", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    reset();
    const scope = new CocosStage3DEngine().captureScene();
    const camera = scope.addCamera(scope.createNode("camera", 1)) as unknown as FakeCamera;
    scope.setCameraPose(asCamera(camera), { x: 3, y: 4, z: 5 }, { x: 3, y: 14, z: 5 });
    assert.deepEqual({ ...camera.node.lookUp }, { x: 0, y: 0, z: 1 });
    scope.setCameraPose(asCamera(camera), { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    assert.deepEqual({ ...camera.node.lookUp }, { x: 0, y: 1, z: 0 });
    const light = scope.addLight(scope.createNode("light", 1)) as unknown as FakeLight;
    scope.setLightDirection(asLight(light), { x: 0, y: -1, z: 0 });
    assert.deepEqual({ ...light.node.lookUp }, { x: 0, y: 0, z: 1 });
    scope.setLightDirection(asLight(light), { x: 1, y: -1, z: 1 });
    assert.deepEqual({ ...light.node.lookUp }, { x: 0, y: 1, z: 0 });
});

test("Cocos Stage3D globals use fixed enums, detached snapshots and preserve unmanaged colors/resources", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    const original = reset();
    const scope = new CocosStage3DEngine().captureScene();
    const untouched = {
        fogColor: original.globals.fog.fogColor, ambientColor: original.globals.ambient.skyLightingColor,
        groundColor: original.globals.ambient.groundLightingColor, shadowColor: original.globals.shadows.shadowColor,
        skybox: original.globals.skybox, envmap: original.globals.skybox.envmap,
    };
    const snapshot = scope.globals.read();
    assert.deepEqual(snapshot, expectedGlobals());
    snapshot.fog.density = 9;
    assert.equal(original.globals.fog.fogDensity, 0.1);
    for (const [fogType, rawType] of [["linear", 0], ["exp", 1], ["expSquared", 2], ["layered", 3]] as const) {
        const state = expectedGlobals(); state.toneMapping = "linear";
        state.fog = { enabled: true, type: fogType, density: 0.7, start: -50, end: -60 };
        state.ambient.skyIllum = 300;
        state.shadows = { enabled: true, kind: "shadowMap" };
        scope.globals.apply(state);
        assert.equal(original.globals.postSettings.toneMappingType, 1);
        assert.equal(original.globals.fog.type, rawType);
        assert.equal(original.globals.shadows.type, 1);
        assert.deepEqual(scope.globals.read(), state);
    }
    scope.globals.apply(expectedGlobals());
    assert.deepEqual(scope.globals.read(), expectedGlobals());
    assert.equal(original.globals.fog.fogColor, untouched.fogColor);
    assert.equal(original.globals.ambient.skyLightingColor, untouched.ambientColor);
    assert.equal(original.globals.ambient.groundLightingColor, untouched.groundColor);
    assert.equal(original.globals.shadows.shadowColor, untouched.shadowColor);
    assert.equal(original.globals.skybox, untouched.skybox);
    assert.equal(original.globals.skybox.envmap, untouched.envmap);
    assert.equal(original.globals.skybox.useHDR, true);
    assert.equal(original.globals.fog.accurate, true);
    assert.equal(original.globals.shadows.shadowMapSize, 1024);
});

test("Cocos Stage3D applying unchanged globals avoids engine setters and their pipeline side effects", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    const original = reset();
    const scope = new CocosStage3DEngine().captureScene();
    const writes: string[] = [];
    watchWrites(original.globals.postSettings, ["toneMappingType"], "post", writes);
    watchWrites(original.globals.fog, ["enabled", "type", "fogDensity", "fogStart", "fogEnd"], "fog", writes);
    watchWrites(original.globals.ambient, ["skyIllum"], "ambient", writes);
    watchWrites(original.globals.shadows, ["enabled", "type"], "shadows", writes);
    scope.globals.apply(expectedGlobals());
    assert.deepEqual(writes, [], "empty token apply must not rebuild pipelines or upload unchanged globals");
    const changed = expectedGlobals(); changed.ambient.skyIllum = 300;
    scope.globals.apply(changed);
    assert.deepEqual(writes, ["ambient.skyIllum"], "one changed field must not touch other managed setters");
    writes.length = 0;
    scope.globals.apply(changed);
    assert.deepEqual(writes, [], "reapplying the same complete state must be a no-op at engine setters");
});

test("Cocos Stage3D retries a setter whose Info value changed before its renderer update failed", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    const original = reset();
    const scope = new CocosStage3DEngine().captureScene();
    const failure = new Error("post settings renderer update failed after Info write");
    let info = 0, renderer = 0, calls = 0, failOnce = true;
    Object.defineProperty(original.globals.postSettings, "toneMappingType", {
        configurable: true, enumerable: true,
        get: () => info,
        set: (value: number) => {
            info = value;
            calls++;
            if (failOnce) { failOnce = false; throw failure; }
            renderer = value;
        },
    });
    const target = expectedGlobals(); target.toneMapping = "linear";
    assert.throws(() => scope.globals.apply(target), (error: unknown) => error === failure);
    assert.equal(info, 1);
    assert.equal(renderer, 0, "Info readback cannot prove the renderer update completed");
    scope.globals.apply(target);
    assert.equal(calls, 2, "same-target retry must re-enter the failed setter despite equal readback");
    assert.equal(renderer, 1);
    scope.globals.apply(target);
    assert.equal(calls, 2, "after a successful retry, unchanged applies return to the no-op path");
});

test("Cocos Stage3D replays the complete baseline after both apply and rollback fail after Info writes", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    const original = reset();
    const scope = new CocosStage3DEngine().captureScene();
    const failure = new Error("pipeline state synchronization interrupted");
    let info = 0, synchronized = true, failures = 2, calls = 0;
    Object.defineProperty(original.globals.postSettings, "toneMappingType", {
        configurable: true, enumerable: true,
        get: () => info,
        set: (value: number) => {
            info = value;
            calls++;
            synchronized = false;
            if (failures > 0) { failures--; throw failure; }
            synchronized = true;
        },
    });
    const writes: string[] = [];
    watchWrites(original.globals.postSettings, ["toneMappingType"], "post", writes);
    watchWrites(original.globals.fog, ["enabled", "type", "fogDensity", "fogStart", "fogEnd"], "fog", writes);
    watchWrites(original.globals.ambient, ["skyIllum"], "ambient", writes);
    watchWrites(original.globals.shadows, ["enabled", "type"], "shadows", writes);
    const target = expectedGlobals(); target.toneMapping = "linear";
    assert.throws(() => scope.globals.apply(target), (error: unknown) => error === failure);
    assert.throws(() => scope.globals.apply(expectedGlobals()), (error: unknown) => error === failure);
    assert.equal(info, 0, "failed rollback can already look identical to the saved baseline");
    assert.equal(synchronized, false);
    writes.length = 0;
    scope.globals.apply(expectedGlobals());
    assert.equal(calls, 3);
    assert.equal(synchronized, true);
    assert.deepEqual(new Set(writes), new Set([
        "post.toneMappingType", "fog.enabled", "fog.type", "fog.fogDensity", "fog.fogStart", "fog.fogEnd",
        "ambient.skyIllum", "shadows.enabled", "shadows.type",
    ]), "a dirty retry must not trust any managed Info field's equality after a failed pipeline update");
    writes.length = 0;
    scope.globals.apply(expectedGlobals());
    assert.deepEqual(writes, []);
});

test("Cocos Stage3D disables globals before changing their type and enables the final selected type", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    const original = reset();
    const scope = new CocosStage3DEngine().captureScene();
    const active = expectedGlobals();
    active.fog = { ...active.fog, enabled: true, type: "layered" };
    active.shadows = { enabled: true, kind: "shadowMap" };
    scope.globals.apply(active);
    assert.equal(original.globals.fog.effectiveType, 3);
    assert.equal(original.globals.shadows.effectiveType, 1);
    original.globals.fog.activations.length = 0;
    original.globals.shadows.activations.length = 0;
    scope.globals.apply(expectedGlobals()); // true+shadowMap -> false+planar
    assert.deepEqual(original.globals.shadows.activations, [], "disable before planar selection avoids a transient material allocation");
    assert.deepEqual(original.globals.fog.activations, [], "disabled fog changes must not activate intermediate shader types");
    assert.equal(original.globals.fog.effectiveType, 4);
    assert.equal(original.globals.shadows.effectiveType, 2);
    const selectedWhileDisabled = expectedGlobals();
    selectedWhileDisabled.fog.type = "expSquared";
    selectedWhileDisabled.shadows.kind = "shadowMap";
    scope.globals.apply(selectedWhileDisabled);
    assert.equal(original.globals.fog.effectiveType, 4);
    assert.equal(original.globals.shadows.effectiveType, 2);
    assert.equal(scope.globals.read().fog.type, "expSquared", "snapshot reads info's selected type, not renderer NONE");
    selectedWhileDisabled.fog.enabled = true;
    selectedWhileDisabled.shadows.enabled = true;
    scope.globals.apply(selectedWhileDisabled);
    assert.equal(original.globals.fog.effectiveType, 2);
    assert.equal(original.globals.shadows.effectiveType, 1);
});

test("Cocos Stage3D rejects unknown engine enum values without silently choosing a default", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    for (const part of ["tone", "fog", "shadow"] as const) {
        const original = reset();
        const scope = new CocosStage3DEngine().captureScene();
        if (part === "tone") original.globals.postSettings.toneMappingType = 99;
        if (part === "fog") original.globals.fog.type = 99;
        if (part === "shadow") original.globals.shadows.type = 99;
        assert.throws(() => scope.globals.read(), `${part} unknown enum must fail`);
    }
});

test("Cocos Stage3D viewport metrics preserve offset, unequal scale and nonzero design origin", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    reset();
    Object.assign(metrics, {
        origin: { x: 10, y: 20 }, size: { width: 300, height: 400 },
        viewport: new FakeRect(80, 40, 700, 1400), scaleX: 2, scaleY: 3,
        screen: { width: 1000, height: 1600 },
    });
    const scope = new CocosStage3DEngine().captureScene();
    const actual = scope.readViewportMetrics();
    assert.deepEqual(actual, {
        design: { x: 10, y: 20, width: 300, height: 400 }, screen: { width: 1000, height: 1600 },
        content: { x: 100, y: 100, width: 600, height: 1200 },
    });
    assert.deepEqual(designToScreen(10, 20, actual), { x: 100, y: 100 });
    assert.deepEqual(designToScreen(310, 420, actual), { x: 700, y: 1300 });
    assert.deepEqual(resolveViewport(actual.design, actual), {
        rect: { x: 0.1, y: 0.0625, width: 0.6, height: 0.75 }, aspect: 0.5,
    });
    metrics.origin.x = 88; metrics.screen.width = 777;
    assert.equal(actual.design.x, 10); assert.equal(actual.screen.width, 1000);
});

test("Cocos Stage3D NO_BORDER clips visible content to screen then inversely maps design bounds", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    reset();
    Object.assign(metrics, {
        origin: { x: 0, y: 0 }, size: { width: 800, height: 400 },
        viewport: new FakeRect(-100, 0, 1600, 800), scaleX: 2, scaleY: 2,
        screen: { width: 1200, height: 800 },
    });
    const actual = new CocosStage3DEngine().captureScene().readViewportMetrics();
    assert.deepEqual(actual, {
        design: { x: 50, y: 0, width: 600, height: 400 }, screen: { width: 1200, height: 800 },
        content: { x: 0, y: 0, width: 1200, height: 800 },
    });
    assert.deepEqual(designToScreen(50, 0, actual), { x: 0, y: 0 });
    assert.deepEqual(designToScreen(650, 400, actual), { x: 1200, y: 800 });
    assert.deepEqual(resolveViewport(actual.design, actual).rect, { x: 0, y: 0, width: 1, height: 1 });
});

test("Cocos Stage3D subscribes to engine frame/scene and view resize events with idempotent cleanup", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    reset();
    const scope = new CocosStage3DEngine().captureScene();
    const received: string[] = [];
    const unrelated = () => {};
    directorEvents.on("after-update", unrelated);
    const unsubscribe = scope.subscribe((event) => received.push(event));
    assert.deepEqual(directorEvents.bindings.filter((binding) => binding.callback !== unrelated).map((binding) => binding.type).sort(),
        ["after-update", "before-scene-launch"]);
    assert.deepEqual(viewEvents.bindings.map((binding) => binding.type).sort(), ["canvas-resize", "design-resolution-changed"]);
    const late = [...directorEvents.bindings, ...viewEvents.bindings].filter((binding) => binding.callback !== unrelated);
    directorEvents.emit("after-update");
    viewEvents.emit("design-resolution-changed"); viewEvents.emit("canvas-resize");
    directorEvents.emit("before-scene-launch");
    assert.deepEqual(received, ["frame", "resize", "resize", "destroy"]);
    unsubscribe();
    assert.deepEqual(directorEvents.bindings.map((binding) => binding.callback), [unrelated]);
    assert.equal(viewEvents.bindings.length, 0);
    const offCount = directorEvents.offCalls.length + viewEvents.offCalls.length;
    unsubscribe();
    assert.equal(directorEvents.offCalls.length + viewEvents.offCalls.length, offCount);
    for (const binding of late) binding.callback.call(binding.target);
    assert.equal(received.length, 4, "queued callbacks must be inert after unsubscribe");
});

test("Cocos Stage3D rolls back its own subscriptions when an on call fails before or after attachment", async () => {
    const { CocosStage3DEngine } = await loadAdapter();
    for (const afterAttach of [false, true]) {
        reset();
        const scope = new CocosStage3DEngine().captureScene();
        const unrelated = () => {};
        directorEvents.on("after-update", unrelated);
        viewEvents.on("canvas-resize", unrelated);
        const failure = new Error("resize registration failed");
        viewEvents.failOn = { type: "canvas-resize", afterAttach, error: failure };
        let callbacks = 0;
        assert.throws(() => scope.subscribe(() => { callbacks++; }), (error: unknown) => error === failure);
        assert.deepEqual(directorEvents.bindings.map((binding) => binding.callback), [unrelated]);
        assert.deepEqual(viewEvents.bindings.map((binding) => binding.callback), [unrelated]);
        for (const removed of [...directorEvents.offCalls, ...viewEvents.offCalls]) removed.callback.call(removed.target);
        assert.equal(callbacks, 0, "failed subscription callbacks must become inert before rollback");
    }
});
