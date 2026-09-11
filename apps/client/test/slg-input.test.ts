/** Exercise production View callbacks with the real camera; the event hub only records node/global ownership. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { MapCamera } from "../src/kits/slg/logic/mapCamera";

type LoaderModule = { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
type Subject = typeof import("../src/kits/slg/view/SlgMapView");
type Listener = { type: string; callback: (...args: unknown[]) => void; target: unknown };

class EventHub {
    readonly listeners: Listener[] = [];
    on(type: string, callback: Listener["callback"], target: unknown): void {
        this.listeners.push({ type, callback, target });
    }
    off(type: string, callback: Listener["callback"], target: unknown): void {
        for (let i = this.listeners.length - 1; i >= 0; i -= 1) {
            const item = this.listeners[i];
            if (item.type === type && item.callback === callback && item.target === target) this.listeners.splice(i, 1);
        }
    }
    emit(type: string, event?: unknown): void {
        for (const item of [...this.listeners]) if (item.type === type) item.callback.call(item.target, event);
    }
}

const EVENTS = {
    TOUCH_START: "touch-start", TOUCH_MOVE: "touch-move", TOUCH_END: "touch-end", TOUCH_CANCEL: "touch-cancel",
    MOUSE_DOWN: "mouse-down", MOUSE_MOVE: "mouse-move", MOUSE_UP: "mouse-up", MOUSE_WHEEL: "mouse-wheel", MOUSE_LEAVE: "mouse-leave",
} as const;
const globalInput = new EventHub();
const gameEvents = new EventHub();
class FakeNode extends EventHub {
    static readonly EventType = EVENTS;
    getComponent(): { convertToNodeSpaceAR: (point: FakeVec3) => FakeVec3 } {
        // UI origin is bottom-left; this fullscreen root's origin is its center.
        return { convertToNodeSpaceAR: (point) => new FakeVec3(point.x - 400, point.y - 600, point.z) };
    }
    setPosition(): void {}
    setScale(): void {}
}
class FakeVec3 { constructor(readonly x: number, readonly y: number, readonly z: number) {} }
class FakeCocosView {
    readonly root = new FakeNode();
    readonly layerWidth = 800;
    readonly layerHeight = 1200;
}
class FakeRenderer { render(): void {} dispose(): void {} }
class FakeFarRenderer {
    readonly node = new FakeNode();
    render(): void {}
    setVisible(): void {}
    dispose(): void {}
}
class FakeOverview {
    readonly node = new FakeNode();
    visible = false;
    private readonly visibilityChanged: (visible: boolean) => void;
    // 生产构造签名 (parent, terrain, landmarks, art, decorations, w, h, onLocate, onVisibilityChange)。
    constructor(...args: unknown[]) { this.visibilityChanged = args[8] as (visible: boolean) => void; }
    setVisible(value: boolean): void { this.visible = value; this.visibilityChanged(value); }
    updateViewport(): void {}
    dispose(): void {}
}

let loaded: Subject | null = null;
async function loadSubject(): Promise<Subject> {
    if (loaded) return loaded;
    const require = createRequire(import.meta.url);
    const moduleApi = require("node:module") as LoaderModule;
    const originalLoad = moduleApi._load;
    const cc = {
        Color: class {}, Node: FakeNode, Vec3: FakeVec3, UITransform: class {}, Label: class {},
        input: globalInput, Input: { EventType: EVENTS }, game: gameEvents, Game: { EVENT_HIDE: "hide" },
    };
    moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
        if (request === "cc") return cc;
        if (request === "../../../view/CocosView") return { CocosView: FakeCocosView };
        if (request === "../../../view/uiPlate") return { createSolidPlate: () => { throw new Error("input tests do not build renderer nodes"); } };
        if (request === "./SlgChunkRenderer") return { SlgChunkRenderer: FakeRenderer };
        if (request === "./SlgDecorationRenderer") return { SlgDecorationRenderer: FakeRenderer };
        if (request === "./SlgFarLayerRenderer") return { SlgFarLayerRenderer: FakeFarRenderer };
        if (request === "./SlgWorldOverview") return { SlgWorldOverview: FakeOverview };
        if (request === "./SlgArtResources") return { loadSlgArtResources: async (mapId: string) => ({
            mapId, terrain: {}, overview: null, decorations: null, island: null,
            groundTiles: { tile: 64, image: 1024, blocks: [] },
            layout: { index: new Map(), landmarks: [] }, release(): void {},
        }), SlgGroundTileCache: class { dispose(): void {} } };
        return originalLoad.call(this, request, parent, isMain);
    };
    try { loaded = await import("../src/kits/slg/view/SlgMapView"); return loaded; }
    finally { moduleApi._load = originalLoad; }
}

interface InputView {
    readonly root: FakeNode;
    active: boolean;
    mapBottom: number;
    mapTop: number;
    mapCenter: number;
    world: FakeNode;
    terrainLayer: FakeNode;
    decorationLayer: FakeNode;
    overview: FakeOverview | null;
    logic: {
        camera: MapCamera;
        runtime: { now(): number; selfUid(): string };
        updateViewport(): void;
        select(x: number, y: number): void;
        setLandmarks(landmarks: readonly unknown[]): void;
        dispose(): void;
        selectedTile(): unknown;
        canCapture(): boolean;
        actionText(): string;
        busy: boolean;
        trophies: number;
    };
    offTick: () => void;
    bindInput(bind: boolean): void;
    loadTerrain(): Promise<void>;
    onCloseLifecycle(): void;
}

async function withView(body: (harness: {
    view: InputView; camera: MapCamera; selections: { x: number; y: number }[];
    emit: (type: string, x?: number, y?: number, id?: number, wheel?: number, button?: number) => void;
    advance: (ms: number) => void; updates: () => number; disposed: () => number; stoppedTicks: () => number;
}) => void | Promise<void>): Promise<void> {
    const subject = await loadSubject();
    const view = new subject.SlgMapView() as unknown as InputView;
    const camera = new MapCamera(800, 720, 1500, 1500);
    const selections: { x: number; y: number }[] = [];
    let now = 1000, updates = 0, disposed = 0, stoppedTicks = 0;
    view.active = true; view.mapBottom = -300; view.mapTop = 420; view.mapCenter = 60;
    view.world = new FakeNode(); view.terrainLayer = new FakeNode(); view.decorationLayer = new FakeNode();
    view.logic = {
        camera, runtime: { now: () => now, selfUid: () => "" }, updateViewport: () => { updates += 1; },
        select: (x, y) => { selections.push({ x, y }); }, setLandmarks: () => {},
        dispose: () => { disposed += 1; camera.cancel(); },
        selectedTile: () => null, canCapture: () => false, actionText: () => "", busy: false, trophies: 0,
    };
    view.offTick = () => { stoppedTicks += 1; };
    view.bindInput(true);
    const emit = (type: string, x = 0, y = 0, id = 1, wheel = 0, button = 0): void => {
        view.root.emit(type, {
            propagationStopped: false,
            getUILocation: () => ({ x: x + 400, y: y + 660 }),
            getID: () => id, getButton: () => button, getScrollY: () => wheel,
        });
    };
    try {
        await body({ view, camera, selections, emit, advance: (ms) => { now += ms; },
            updates: () => updates, disposed: () => disposed, stoppedTicks: () => stoppedTicks });
    } finally { view.onCloseLifecycle(); }
}

test("SLG input: fullscreen foreground owns every pointer event and route close removes only its listeners", async () => {
    await withView(({ view, camera, emit, disposed, stoppedTicks }) => {
        assert.deepEqual(view.root.listeners.map((item) => item.type).sort(), Object.values(EVENTS).sort());
        assert.equal(globalInput.listeners.length, 0, "background ScrollView consumes input before the global fallback");
        let unrelated = 0;
        const callback = () => { unrelated += 1; };
        view.root.on(EVENTS.MOUSE_DOWN, callback, null);
        gameEvents.on("hide", callback, null);
        try {
            emit(EVENTS.MOUSE_DOWN);
            assert.equal(camera.pointerCount, 1);
            view.onCloseLifecycle();
            assert.equal(camera.pointerCount, 0);
            assert.equal(disposed(), 1); assert.equal(stoppedTicks(), 1);
            assert.equal(view.root.listeners.length, 1);
            assert.equal(gameEvents.listeners.length, 1);
            emit(EVENTS.MOUSE_DOWN); gameEvents.emit("hide");
            assert.equal(unrelated, 3, "unrelated subscribers survive route close");
            assert.equal(camera.pointerCount, 0);
        } finally {
            view.root.off(EVENTS.MOUSE_DOWN, callback, null);
            gameEvents.off("hide", callback, null);
        }
    });
});

test("SLG input: central click selects, drag pans without selecting, and wheel zoom preserves its anchor", async () => {
    await withView(({ camera, selections, emit, advance, updates }) => {
        emit(EVENTS.MOUSE_DOWN); emit(EVENTS.MOUSE_UP);
        assert.deepEqual(selections, [{ x: 750, y: 750 }]);
        emit(EVENTS.MOUSE_DOWN); advance(20); emit(EVENTS.MOUSE_MOVE, 80, 30); emit(EVENTS.MOUSE_UP);
        assert.ok(camera.x < 750 && camera.y < 750);
        assert.equal(selections.length, 1);
        const anchor = camera.worldAt(120, 50), scale = camera.scale;
        emit(EVENTS.MOUSE_WHEEL, 120, 50, 1, 200);
        assert.ok(camera.scale > scale);
        assert.deepEqual(camera.worldAt(120, 50), anchor);
        assert.equal(updates(), 2);
        const version = camera.version;
        emit(EVENTS.MOUSE_WHEEL, 0, 500, 1, 200);
        emit(EVENTS.MOUSE_DOWN, 0, -500); emit(EVENTS.MOUSE_UP);
        emit(EVENTS.MOUSE_DOWN, 0, 0, 1, 0, 2); emit(EVENTS.MOUSE_UP);
        assert.equal(camera.version, version, "toolbar and non-primary buttons cannot move the map");
        assert.equal(selections.length, 1);
    });
});

test("SLG input: touch replaces synthetic mouse, deduplicates taps, and retains two-finger zoom", async () => {
    await withView(({ camera, selections, emit, advance }) => {
        emit(EVENTS.MOUSE_DOWN);
        emit(EVENTS.TOUCH_START, 0, 0, 7);
        assert.equal(camera.pointerCount, 1, "touch replaces an already-started synthetic mouse pointer");
        emit(EVENTS.TOUCH_END, 0, 0, 7); emit(EVENTS.MOUSE_UP);
        emit(EVENTS.MOUSE_DOWN); emit(EVENTS.MOUSE_UP);
        assert.equal(selections.length, 1);
        advance(501);
        emit(EVENTS.MOUSE_DOWN); emit(EVENTS.MOUSE_UP);
        assert.equal(selections.length, 2, "physical mouse resumes after the deduplication interval");
        const scale = camera.scale;
        emit(EVENTS.TOUCH_START, -40, 0, 1); emit(EVENTS.TOUCH_START, 40, 0, 2);
        advance(16); emit(EVENTS.TOUCH_MOVE, 80, 0, 2);
        assert.ok(camera.scale > scale);
        emit(EVENTS.TOUCH_END, -40, 0, 1); emit(EVENTS.TOUCH_END, 80, 0, 2);
        assert.equal(camera.pointerCount, 0); assert.equal(selections.length, 2, "pinch cannot also select a tile");
    });
});

test("SLG input: mouse leave, game hide, and touch cancel clear active drag and inertia", async () => {
    await withView(({ camera, selections, emit, advance }) => {
        for (const cancel of [() => emit(EVENTS.MOUSE_LEAVE), () => gameEvents.emit("hide")]) {
            emit(EVENTS.MOUSE_DOWN); advance(16); emit(EVENTS.MOUSE_MOVE, 80, 30);
            assert.equal(camera.pointerCount, 1);
            cancel();
            const version = camera.version;
            emit(EVENTS.MOUSE_MOVE, 200, 80); emit(EVENTS.MOUSE_UP); camera.step(0.05);
            assert.equal(camera.pointerCount, 0); assert.equal(camera.version, version);
        }
        emit(EVENTS.TOUCH_START); advance(16); emit(EVENTS.TOUCH_MOVE, 80, 30); emit(EVENTS.TOUCH_CANCEL);
        const version = camera.version;
        emit(EVENTS.TOUCH_END); camera.step(0.05);
        assert.equal(camera.pointerCount, 0); assert.equal(camera.version, version); assert.equal(selections.length, 0);
    });
});

test("SLG input: overview visibility cancels gestures and blocks click-through until the close grace period ends", async () => {
    await withView(async ({ view, camera, selections, emit, advance }) => {
        await view.loadTerrain();
        assert.ok(view.overview);
        emit(EVENTS.MOUSE_DOWN); advance(16); emit(EVENTS.MOUSE_MOVE, 80, 30);
        view.overview.setVisible(true);
        assert.equal(camera.pointerCount, 0);
        const version = camera.version;
        advance(500);
        emit(EVENTS.MOUSE_UP); emit(EVENTS.MOUSE_WHEEL, 0, 0, 1, 300);
        emit(EVENTS.TOUCH_START); emit(EVENTS.TOUCH_MOVE, 80, 30); emit(EVENTS.TOUCH_END);
        camera.step(0.05);
        assert.equal(camera.version, version); assert.equal(selections.length, 0);
        view.overview.setVisible(false);
        emit(EVENTS.MOUSE_DOWN); emit(EVENTS.MOUSE_UP); emit(EVENTS.MOUSE_WHEEL, 0, 0, 1, 300);
        assert.equal(camera.version, version); assert.equal(selections.length, 0);
        advance(351);
        emit(EVENTS.MOUSE_DOWN); emit(EVENTS.MOUSE_UP);
        assert.equal(selections.length, 1);
    });
});
