// SC0-B3 mutation executed: route() uses current hit instead of the recorded owner
// -> boundary/concurrent-touch and stale desktop end cases fail (2/11); restored.
// SC1-B9 mutation executed: remove RawInputRouter.setBlocked's cancel() call
// -> modal ownership + real Snake joystick/boost reset fail (5/20); restored.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { EventMouse, EventTouch } from "cc";
import type { GRoot } from "db://fairygui-cc/fairygui.mjs";
import { SnakePointerRouter } from "../src/logic/rooms/snake/SnakeControls";
import { PointerOwnership } from "../src/logic/input/PointerOwnership";
import { installFguiRawInput } from "../src/view/input/FguiRawInput";
import { rawInput, type RawInputSubscriber } from "../src/view/input/RawInput";
const owner = () => ({ signal: new AbortController().signal, isActive: () => true });
const registerWorld = (subscriber: RawInputSubscriber) => rawInput.subscribe(owner(), subscriber);
const readInput = () => rawInput.inspect();
const isActive = () => readInput().active;
const cancelInput = () => rawInput.cancel();
const setBlocked = (value: boolean) => rawInput.setBlocked(value);
const activateAdapter = (cancel: (id: number, event: EventTouch) => void) => rawInput.attachAdapter(cancel);
const peekOwner = (id: number) => rawInput.peek(id);
const routeTouch = rawInput.routeTouch.bind(rawInput);

type RawEvent = { getID(): number; getLocation(): { x: number; y: number }; getUILocation(): { x: number; y: number }; preventSwallow?: boolean };
const event = (id: number, x: number, y = 0): RawEvent => ({ getID: () => id, getLocation: () => ({ x, y }), getUILocation: () => ({ x, y }) });
class FakeNode {
    isValid = true;
    private readonly listeners = new Map<string, { fn: (event: RawEvent) => unknown; target: unknown }[]>();
    on(type: string, fn: (event: RawEvent) => unknown, target: unknown): void {
        this.listeners.set(type, [...this.listeners.get(type) ?? [], { fn, target }]);
    }
    off(type: string, fn: (event: RawEvent) => unknown, target: unknown): void {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry.fn !== fn || entry.target !== target));
    }
    emit(type: string, value: RawEvent): void { for (const entry of [...this.listeners.get(type) ?? []]) entry.fn.call(entry.target, value); }
    count(type: string): number { return this.listeners.get(type)?.length ?? 0; }
}
interface Info {
    touchId: number; button: number; target: unknown; pos: { x: number; y: number };
    began: boolean; clickCancelled: boolean; downTargets: unknown[]; touchMonitors: unknown[];
}
const bindings = [
    ["touch-start", "touchBeginHandler"], ["touch-move", "touchMoveHandler"],
    ["touch-end", "touchEndHandler"], ["touch-cancel", "touchCancelHandler"],
    ["mouse-down", "mouseDownHandler"], ["mouse-move", "mouseMoveHandler"],
    ["mouse-up", "mouseUpHandler"], ["mouse-wheel", "mouseWheelHandler"],
] as const;
class FakeProcessor {
    enabled = false;
    readonly infos: Info[] = [];
    readonly _touches = this.infos;
    readonly hud = {};
    readonly calls = { begin: 0, move: 0, end: 0, cancel: 0, click: 0, mouseMove: 0, wheel: 0 };
    constructor(private readonly root: { node: FakeNode }) { this.setEnabled(true); }
    setEnabled(value: boolean): void {
        if (value === this.enabled) return;
        this.enabled = value;
        for (const [type, key] of bindings) {
            if (value) this.root.node.on(type, this[key], this);
            else this.root.node.off(type, this[key], this);
        }
    }
    getInfo(id: number, create: boolean): Info | null {
        const existing = this.infos.find((info) => info.touchId === id);
        if (existing) return existing;
        // Locked FGUI claims an available slot even when create is false.
        const free = this.infos.filter((info) => info.touchId === -1).at(-1);
        if (free) { free.touchId = id; return free; }
        if (!create) return null;
        const info = { touchId: id, button: 0, target: null, pos: { x: 0, y: 0 }, began: false,
            clickCancelled: false, downTargets: [], touchMonitors: [] };
        this.infos.push(info);
        return info;
    }
    updateInfo(id: number, position: { x: number; y: number }): Info {
        const info = this.getInfo(id, true)!;
        info.pos.x = position.x; info.pos.y = position.y;
        info.target = position.x < 100 ? this.hud : this.root;
        info.button = 0;
        return info;
    }
    cancelClick(id: number): void { const info = this.getInfo(id, false); if (info) info.clickCancelled = true; }
    touchBeginHandler(value: RawEvent): void {
        this.calls.begin++;
        const info = this.updateInfo(value.getID(), value.getLocation());
        info.began = true; info.clickCancelled = false; info.downTargets = [info.target];
        value.preventSwallow = info.target === this.root;
    }
    touchMoveHandler(value: RawEvent): void {
        this.calls.move++;
        const info = this.updateInfo(value.getID(), value.getLocation());
        value.preventSwallow = info.target === this.root;
    }
    touchEndHandler(value: RawEvent): void {
        this.calls.end++;
        const info = this.updateInfo(value.getID(), value.getLocation());
        if (info.began && !info.clickCancelled && info.downTargets[0] === info.target) this.calls.click++;
        info.began = false; info.downTargets.length = 0; info.touchId = -1;
        value.preventSwallow = info.target === this.root;
    }
    touchCancelHandler(value: RawEvent): void {
        this.calls.cancel++;
        const info = this.updateInfo(value.getID(), value.getLocation());
        info.began = false; info.clickCancelled = true; info.touchId = -1;
        info.downTargets.length = 0; info.touchMonitors.length = 0;
    }
    mouseDownHandler(_value: RawEvent): void {}
    mouseUpHandler(_value: RawEvent): void {}
    mouseMoveHandler(_value: RawEvent): void { this.calls.mouseMove++; }
    mouseWheelHandler(_value: RawEvent): void { this.calls.wheel++; }
}
function fixture() {
    setBlocked(false);
    const root = { node: new FakeNode(), inputProcessor: null as FakeProcessor | null };
    const ip = new FakeProcessor(root);
    root.inputProcessor = ip;
    const worldEvents: string[] = [];
    let cancels = 0;
    const unregister = registerWorld({
        touch: (phase, value) => worldEvents.push(`${phase}:${value.getID()}`),
        wheel: () => worldEvents.push("wheel"), cancel: () => { cancels++; },
    });
    const originalBegin = ip.touchBeginHandler;
    const release = installFguiRawInput(root as unknown as GRoot);
    return { root, ip, worldEvents, originalBegin, cancels: () => cancels,
        dispose: () => { release(); unregister(); setBlocked(false); }, release };
}

test("SC1-B9 FGUI bridge locks touch ownership across both boundaries and handles concurrent HUD/world fingers", () => {
    const f = fixture();
    try {
        const hudStart = event(1, 20), worldStart = event(2, 200);
        f.root.node.emit("touch-start", hudStart);
        f.root.node.emit("touch-start", worldStart);
        assert.equal((readInput() as { ownersCount: number }).ownersCount, 2);
        const hudMove = event(1, 200), worldMove = event(2, 20);
        f.root.node.emit("touch-move", hudMove);
        f.root.node.emit("touch-move", worldMove);
        f.root.node.emit("touch-end", event(1, 200));
        f.root.node.emit("touch-end", event(2, 20));
        assert.deepEqual(f.worldEvents, ["start:2", "move:2", "end:2"]);
        assert.equal(f.ip.calls.begin, 1);
        assert.equal(f.ip.calls.move, 1);
        assert.equal(f.ip.calls.end, 1);
        assert.equal(f.ip.calls.click, 0, "world -> HUD must not synthesize a click");
        assert.equal(hudStart.preventSwallow, false);
        assert.equal(hudMove.preventSwallow, false, "HUD drag out must remain swallowed");
        assert.equal(worldStart.preventSwallow, true);
        assert.equal(worldMove.preventSwallow, true, "world drag keeps native Cocos propagation");
        assert.equal((readInput() as { ownersCount: number }).ownersCount, 0);
        assert.equal(f.ip.infos.filter((info) => info.touchId !== -1).length, 0, "world hit queries cannot leak FGUI captures");
    } finally { f.dispose(); }
});

test("SC1-B9 world hit and wheel do not claim a recycled FGUI slot after a HUD tap", () => {
    const f = fixture();
    try {
        f.root.node.emit("touch-start", event(903, 20));
        f.root.node.emit("touch-end", event(903, 20));
        assert.equal(f.ip.calls.click, 1);
        assert.equal(f.ip.infos.filter((info) => info.touchId !== -1).length, 0);
        f.root.node.emit("touch-start", event(901, 200));
        assert.equal(f.ip.infos.filter((info) => info.touchId !== -1).length, 0, "world hit must leave the recycled slot vacant");
        f.root.node.emit("mouse-wheel", event(0, 200));
        assert.equal(f.ip.infos.filter((info) => info.touchId !== -1).length, 0, "wheel must not leave a synthetic mouse capture");
        f.root.node.emit("touch-end", event(901, 200));
        assert.deepEqual(f.worldEvents, ["start:901", "wheel", "end:901"]);
        assert.equal(readInput().ownersCount, 0);
    } finally { f.dispose(); }
});

test("SC1-B9 wheel hits current location without corrupting a HUD touch; desktop mouse does not synthesize world touches", () => {
    const f = fixture();
    try {
        f.root.node.emit("touch-start", event(0, 20));
        const info = f.ip.getInfo(0, false)!;
        f.root.node.emit("mouse-wheel", event(0, 200));
        assert.equal(info.target, f.ip.hud);
        assert.equal(info.pos.x, 20);
        f.root.node.emit("mouse-wheel", event(0, 20));
        assert.equal(f.ip.calls.wheel, 1);
        assert.deepEqual(f.worldEvents, ["wheel"]);
        f.root.node.emit("touch-end", event(0, 20));
        f.root.node.emit("touch-start", event(0, 200));
        f.root.node.emit("mouse-move", event(0, 20));
        assert.equal(f.ip.calls.mouseMove, 0, "world mouse drag must not also invoke FGUI move");
        assert.deepEqual(f.worldEvents, ["wheel", "start:0"]);
    } finally { f.dispose(); }
});

test("SC1-B9 modal cancellation clears both owners and allows the modal's own fresh FGUI clicks", () => {
    const f = fixture();
    try {
        f.root.node.emit("touch-start", event(1, 20));
        f.root.node.emit("touch-start", event(2, 200));
        setBlocked(true);
        assert.equal((readInput() as { ownersCount: number }).ownersCount, 0);
        assert.deepEqual(f.worldEvents, ["start:2", "cancel:2"]);
        assert.equal(f.ip.calls.cancel, 1);
        f.root.node.emit("touch-end", event(1, 20));
        assert.equal(f.ip.calls.click, 0, "cancelled old HUD press cannot click the modal");
        f.root.node.emit("touch-start", event(3, 20));
        f.root.node.emit("touch-end", event(3, 20));
        assert.equal(f.ip.calls.click, 1, "modal remains interactive through the original FGUI handlers");
        setBlocked(false);
        f.root.node.emit("touch-move", event(2, 210));
        f.root.node.emit("touch-end", event(2, 210));
        assert.deepEqual(f.worldEvents, ["start:2", "cancel:2"], "restoring input cannot resume an old world pointer");
        f.root.node.emit("touch-start", event(2, 200));
        assert.equal(f.worldEvents.at(-1), "start:2");
    } finally { f.dispose(); }
});

test("SC1-B9 world replacement cancels the former owner and stale release does not resurrect it", () => {
    const f = fixture();
    const replacement: string[] = [];
    let releaseNew: (() => void) | undefined;
    try {
        f.root.node.emit("touch-start", event(7, 200));
        releaseNew = registerWorld({ touch: (phase) => replacement.push(phase), cancel: () => replacement.push("cancelAll") });
        assert.deepEqual(f.worldEvents, ["start:7", "cancel:7"]);
        assert.ok(f.cancels() >= 2);
        f.root.node.emit("touch-move", event(7, 210));
        assert.deepEqual(replacement, []);
        f.root.node.emit("touch-start", event(8, 200));
        assert.deepEqual(replacement, ["start"]);
        releaseNew();
        f.root.node.emit("touch-start", event(9, 200));
        assert.deepEqual(f.worldEvents, ["start:7", "cancel:7"], "old registration stays retired");
    } finally { releaseNew?.(); f.dispose(); }
});

test("SC1-B9 adapter survives processor disable/enable and restores original prototype handlers on release", () => {
    const f = fixture();
    try {
        f.ip.setEnabled(false);
        assert.equal(f.root.node.count("touch-start"), 0);
        f.ip.setEnabled(true);
        assert.equal(f.root.node.count("touch-start"), 1);
        f.root.node.emit("touch-start", event(1, 200));
        assert.deepEqual(f.worldEvents, ["start:1"]);
        f.release();
        f.release();
        assert.equal(isActive(), false);
        assert.equal(f.ip.touchBeginHandler, f.originalBegin);
        assert.equal(Object.hasOwn(f.ip, "touchBeginHandler"), false);
        assert.equal(f.root.node.count("touch-start"), 1);
        f.root.node.emit("touch-start", event(2, 200));
        assert.deepEqual(f.worldEvents, ["start:1", "cancel:1"]);
    } finally { f.dispose(); }
});

test("SC1-B9 adapter replacement restores old root listeners and stale release leaves the new root active", () => {
    const first = fixture();
    const second = fixture();
    try {
        first.release();
        assert.equal(isActive(), true);
        assert.equal(first.ip.touchBeginHandler, first.originalBegin);
        second.root.node.emit("touch-start", event(4, 200));
        assert.deepEqual(second.worldEvents, ["start:4"]);
    } finally { first.dispose(); second.dispose(); }
});

test("SC1-B9 cancellation clears real Snake router joystick/boost state and reopening requires fresh gestures", () => {
    const f = fixture();
    let boosting = false;
    let knob = { x: 0, y: 0 };
    const router = new SnakePointerRouter("right", 0, {
        steer: (_x, _y, x, y) => { knob = { x, y }; }, centerJoystick: () => { knob = { x: 0, y: 0 }; },
        setBoost: (value) => { boosting = value; }, activate: () => {},
    });
    const unregister = registerWorld({
        touch: (phase, value) => {
            const p = value.getUILocation();
            if (phase === "cancel") router.cancel(value.getID());
            else router[phase](value.getID(), p.x, p.y);
        },
        cancel: () => router.cancelAll(),
        inspect: () => ({ boosting, routerOwnersCount: router.ownerCount, knob }),
    });
    try {
        f.root.node.emit("touch-start", event(1, 450, 220));
        f.root.node.emit("touch-start", event(2, 620, 410));
        assert.equal(boosting, true);
        assert.notEqual(knob.x, 0);
        setBlocked(true);
        assert.equal(boosting, false);
        assert.equal(router.ownerCount, 0);
        assert.deepEqual(knob, { x: 0, y: 0 });
        setBlocked(false);
        f.root.node.emit("touch-move", event(1, 480, 220));
        assert.deepEqual(knob, { x: 0, y: 0 });
        f.root.node.emit("touch-start", event(2, 620, 410));
        cancelInput();
        assert.equal(boosting, false);
        assert.equal(router.ownerCount, 0);
    } finally { unregister(); f.dispose(); }
});

test("SC1-B9 subscribers receive the original raw events during dispatch", () => {
    const f = fixture();
    let receivedTouch: EventTouch | null = null;
    let receivedMouse: EventMouse | null = null;
    const unregister = registerWorld({ touch: (_phase, value: EventTouch) => { receivedTouch = value; },
        wheel: (value: EventMouse) => { receivedMouse = value; }, cancel: () => {} });
    try {
        const touch = event(1, 200);
        const wheel = event(0, 200);
        f.root.node.emit("touch-start", touch);
        f.root.node.emit("mouse-wheel", wheel);
        assert.equal(receivedTouch, touch);
        assert.equal(receivedMouse, wheel);
    } finally { unregister(); f.dispose(); }
});

test("SC1-B9 deferred cancellation snapshots IDs because Cocos reuses EventTouch across multiple touches", () => {
    const f = fixture();
    let id = 1;
    const sharedEvent = { ...event(1, 200), getID: () => id };
    try {
        f.root.node.emit("touch-start", sharedEvent);
        id = 2;
        f.root.node.emit("touch-start", sharedEvent);
        id = 99;
        cancelInput();
        assert.deepEqual(f.worldEvents, ["start:1", "start:2", "cancel:1", "cancel:2"]);
        assert.equal(readInput().ownersCount, 0);
    } finally { f.dispose(); }
});

test("SC1-B9 modal/hide cancellation also guards gameplay without an overlay adapter", () => {
    assert.equal(isActive(), false);
    let cancels = 0;
    const unregister = registerWorld({ touch: () => {}, cancel: () => { cancels++; } });
    try {
        setBlocked(true);
        assert.equal(cancels, 1);
        cancelInput();
        assert.equal(cancels, 2);
        assert.equal(readInput().blocked, true);
        setBlocked(false);
        assert.equal(cancels, 3);
    } finally { unregister(); setBlocked(false); }
    assert.equal(cancels, 4);
});

test("SC1-B9 partial listener installation failure restores originals and removes the active adapter", () => {
    const root = { node: new FakeNode(), inputProcessor: null as FakeProcessor | null };
    const ip = new FakeProcessor(root);
    root.inputProcessor = ip;
    const original = ip.touchBeginHandler;
    const originalOn = root.node.on.bind(root.node);
    let failed = false;
    root.node.on = (type, fn, target) => {
        if (type === "mouse-move" && !failed) { failed = true; throw new Error("fixture registration failed"); }
        originalOn(type, fn, target);
    };
    assert.throws(() => installFguiRawInput(root as unknown as GRoot), /fixture registration failed/u);
    assert.equal(isActive(), false);
    assert.equal(ip.touchBeginHandler, original);
    for (const [type] of bindings) assert.equal(root.node.count(type), 1, type);
});

test("SC1-B9 pointer cancellation completes every owner before rethrowing the first failure", () => {
    const visited: number[] = [], first = new Error("HUD cancellation failed");
    const ownership = new PointerOwnership((id) => { visited.push(id); throw id === 1 ? first : new Error("world cancellation failed"); });
    ownership.route(1, "start", "hud"); ownership.route(2, "start", "world");
    assert.throws(() => ownership.cancelAll(), (error) => error === first);
    assert.deepEqual(visited, [1, 2]);
    assert.equal(ownership.count, 0);
    assert.equal(ownership.route(2, "move", "world"), null);
});

test("SC1-B9 throwing HUD cancellation still cancels every world pointer, clears pending and permits host lifecycle continuation", () => {
    for (const action of ["hide", "block", "release"] as const) {
        setBlocked(false);
        const first = new Error(`HUD cancel ${action}`), reported: unknown[][] = [], received: string[] = [];
        const oldError = console.error;
        console.error = (...values: unknown[]) => { reported.push(values); };
        let armed = false, cancelAll = 0;
        const unregister = registerWorld({
            touch: (phase, touch) => { received.push(`${phase}:${touch.getID()}`); if (armed && phase === "cancel") throw new Error("world touch failure"); },
            cancel: () => { cancelAll++; if (armed) throw new Error("world cancelAll failure"); },
        });
        const release = activateAdapter(() => { throw first; });
        try {
            routeTouch("start", event(1, 20) as unknown as EventTouch, "hud");
            routeTouch("start", event(2, 200) as unknown as EventTouch, "world");
            routeTouch("start", event(3, 210) as unknown as EventTouch, "world");
            const beforeCancels = cancelAll;
            armed = true;
            let hostContinued = false;
            assert.doesNotThrow(() => {
                if (action === "hide") cancelInput();
                else if (action === "block") setBlocked(true);
                else release();
                hostContinued = true;
            });
            assert.equal(hostContinued, true);
            assert.deepEqual(received, ["start:2", "start:3", "cancel:2", "cancel:3"]);
            assert.equal(cancelAll, beforeCancels + 1);
            assert.equal(reported.length, 1, "only the first failure is reported after complete cleanup");
            assert.equal(reported[0]![1], first);
            assert.equal(readInput().ownersCount, 0);
            assert.equal(readInput().pendingCount, 0);
            for (const id of [1, 2, 3]) assert.equal(peekOwner(id), null);
            setBlocked(false);
            routeTouch("move", event(2, 220) as unknown as EventTouch, "world");
            assert.equal(received.at(-1), "cancel:3", "old world gestures cannot resume after reported failure");
        } finally {
            armed = false; release(); unregister(); setBlocked(false); console.error = oldError;
        }
    }
});

test("SC1-B9 FGUI release restores original handlers even when native HUD cancel fails", () => {
    const f = fixture(), first = new Error("native FGUI cancel failed"), reported: unknown[][] = [];
    const updateInfo = f.ip.updateInfo, oldError = console.error;
    console.error = (...values: unknown[]) => { reported.push(values); };
    try {
        f.root.node.emit("touch-start", event(1, 20));
        f.root.node.emit("touch-start", event(2, 200));
        f.ip.updateInfo = function (id, position) { if (id === 1) throw first; return updateInfo.call(this, id, position); };
        assert.doesNotThrow(() => f.release());
        assert.deepEqual(f.worldEvents, ["start:2", "cancel:2"]);
        assert.equal(reported[0]![1], first);
        assert.equal(readInput().pendingCount, 0);
        assert.equal(isActive(), false);
        assert.equal(f.ip.touchBeginHandler, f.originalBegin);
        for (const [type] of bindings) assert.equal(f.root.node.count(type), 1);
        assert.equal(f.ip.infos.filter((info) => info.touchId !== -1).length, 0);
    } finally { f.ip.updateInfo = updateInfo; f.dispose(); console.error = oldError; }
});

test("SC1-B9 a modal opened during HUD cancellation preserves remaining world cancellation snapshots", () => {
    setBlocked(false);
    const received: string[] = [];
    const unregister = registerWorld({ touch: (phase, value) => { received.push(`${phase}:${value.getID()}`); }, cancel: () => {} });
    const release = activateAdapter(() => setBlocked(true));
    try {
        routeTouch("start", event(1, 20) as unknown as EventTouch, "hud");
        routeTouch("start", event(2, 200) as unknown as EventTouch, "world");
        cancelInput();
        assert.deepEqual(received, ["start:2", "cancel:2"]);
        assert.equal(readInput().pendingCount, 0);
        assert.equal(readInput().ownersCount, 0);
    } finally { release(); unregister(); setBlocked(false); }
});

test("SC1-B9 expired owner aborts immediately, clears both pointer maps and cannot be reused", () => {
    const f = fixture();
    const controller = new AbortController();
    const events: string[] = [];
    const owned = { signal: controller.signal, isActive: () => !controller.signal.aborted };
    const release = rawInput.subscribe(owned, { touch: (phase) => events.push(phase), cancel: () => events.push("clear") });
    try {
        f.root.node.emit("touch-start", event(1, 200));
        controller.abort();
        assert.deepEqual(events, ["start", "cancel", "clear"]);
        assert.equal(readInput().ownersCount, 0);
        assert.equal(readInput().pendingCount, 0);
        assert.equal(readInput().worldGeneration, null);
        assert.throws(() => rawInput.subscribe(owned, { touch() {}, cancel() {} }), /inactive/);
        f.root.node.emit("touch-move", event(1, 230));
        f.root.node.emit("touch-end", event(1, 230));
        release();
        assert.deepEqual(events, ["start", "cancel", "clear"]);
    } finally { release(); f.dispose(); }
});

test("SC1-B9 generation-only expiry cancels before the next router event and stale release is inert", () => {
    const f = fixture();
    let current = true;
    const events: string[] = [];
    const release = rawInput.subscribe({ signal: new AbortController().signal, isActive: () => current }, {
        touch: (phase) => events.push(phase), cancel: () => events.push("clear"),
    });
    try {
        f.root.node.emit("touch-start", event(1, 200));
        current = false;
        f.root.node.emit("touch-move", event(1, 230));
        assert.deepEqual(events, ["start", "cancel", "clear"]);
        const next: string[] = [];
        const releaseNext = registerWorld({ touch: (phase) => next.push(phase), cancel() {} });
        release();
        f.root.node.emit("touch-end", event(1, 230));
        assert.deepEqual(next, []);
        f.root.node.emit("touch-start", event(1, 230));
        assert.deepEqual(next, ["start"]);
        releaseNext();
    } finally { release(); f.dispose(); }
});

test("SC1-B9 hide cancels first, blocks all old events and resumes only fresh gestures", () => {
    const f = fixture();
    try {
        f.root.node.emit("touch-start", event(1, 200));
        f.root.node.emit("touch-start", event(2, 20));
        rawInput.setSuspended(true);
        assert.deepEqual(f.worldEvents, ["start:1", "cancel:1"]);
        f.root.node.emit("touch-start", event(3, 20));
        f.root.node.emit("touch-end", event(3, 20));
        f.root.node.emit("touch-start", event(4, 200));
        f.root.node.emit("mouse-wheel", event(0, 20));
        assert.equal(f.ip.calls.click, 0);
        assert.equal(f.ip.calls.wheel, 0);
        rawInput.setSuspended(false);
        f.root.node.emit("touch-end", event(1, 20));
        f.root.node.emit("touch-end", event(2, 20));
        assert.equal(f.ip.calls.click, 0);
        f.root.node.emit("touch-start", event(5, 200));
        assert.equal(f.worldEvents.at(-1), "start:5");
    } finally { rawInput.setSuspended(false); f.dispose(); }
});

test("SC1-B9 duplicate start cancellation cannot reenter a newly modal world", () => {
    const f = fixture();
    const events: string[] = [];
    const release = registerWorld({
        touch: (phase) => { events.push(phase); if (phase === "cancel") setBlocked(true); }, cancel() {},
    });
    try {
        f.root.node.emit("touch-start", event(1, 200));
        f.root.node.emit("touch-start", event(1, 200));
        assert.deepEqual(events, ["start", "cancel"]);
        assert.equal(readInput().ownersCount, 0);
        assert.equal(readInput().pendingCount, 0);
    } finally { release(); f.dispose(); }
});
