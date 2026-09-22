/** Locked FairyGUI 1.2.2 instance adapter; no vendor changes. See README for engine evidence. */
import type { EventMouse, EventTouch } from "cc";
import type { GRoot } from "db://fairygui-cc/fairygui.mjs";
import { rawInput, type RawInputRouter } from "./RawInput";

interface Point { x: number; y: number; }
type RawTouch = EventTouch & { getLocation(): Point; preventSwallow?: boolean };
type RawMouse = EventMouse & { getLocation(): Point; preventSwallow?: boolean };
interface TouchInfo {
    touchId: number; button: number; target: unknown; pos: Point;
    began: boolean; clickCancelled: boolean; downTargets: unknown[]; touchMonitors: unknown[];
}
type TouchHandler = (event: RawTouch) => unknown;
type MouseHandler = (event: RawMouse) => unknown;
interface FguiInputProcessor {
    enabled: boolean;
    _touches: TouchInfo[];
    touchBeginHandler: TouchHandler; touchMoveHandler: TouchHandler;
    touchEndHandler: TouchHandler; touchCancelHandler: TouchHandler;
    mouseDownHandler: MouseHandler; mouseMoveHandler: MouseHandler;
    mouseUpHandler: MouseHandler; mouseWheelHandler: MouseHandler;
    updateInfo(id: number, position: Point): TouchInfo;
    cancelClick(id: number): void;
}
const touchBindings = [
    ["touch-start", "touchBeginHandler", "start"], ["touch-move", "touchMoveHandler", "move"],
    ["touch-end", "touchEndHandler", "end"], ["touch-cancel", "touchCancelHandler", "cancel"],
] as const;
const mouseBindings = [
    ["mouse-down", "mouseDownHandler"], ["mouse-move", "mouseMoveHandler"],
    ["mouse-up", "mouseUpHandler"], ["mouse-wheel", "mouseWheelHandler"],
] as const;
type HandlerName = typeof touchBindings[number][1] | typeof mouseBindings[number][1];
let installed: { release(): void } | null = null;

export function installFguiRawInput(root: GRoot, router: RawInputRouter = rawInput): () => void {
    installed?.release();
    const ip = root.inputProcessor as unknown as FguiInputProcessor;
    for (const [, key] of [...touchBindings, ...mouseBindings]) {
        if (typeof ip?.[key] !== "function") throw new Error(`[raw-input] missing FGUI handler ${key}`);
    }
    if (!Array.isArray(ip._touches)) throw new Error("[raw-input] missing FGUI touch records");
    for (const key of ["updateInfo", "cancelClick"] as const) {
        if (typeof ip[key] !== "function") throw new Error(`[raw-input] missing FGUI method ${key}`);
    }
    const originals = new Map<HandlerName, TouchHandler | MouseHandler>();
    const descriptors = new Map<HandlerName, PropertyDescriptor | undefined>();
    for (const [, key] of [...touchBindings, ...mouseBindings]) {
        originals.set(key, ip[key]);
        descriptors.set(key, Object.getOwnPropertyDescriptor(ip, key));
    }
    const originalCancel = ip.touchCancelHandler;
    let released = false;

    // updateInfo uses the exact FGUI camera/coordinate conversion. Restore its
    // temporary touch record so wheel/hit queries cannot corrupt pointer 0 or
    // leave a world pointer inside InputProcessor.getAllTouches().
    const hit = (event: RawTouch | RawMouse): "hud" | "world" => {
        const id = "getID" in event ? event.getID() ?? 0 : 0;
        // getInfo(id, false) still claims an existing vacant slot in FairyGUI
        // 1.2.2; only an exact record lookup is a non-mutating peek.
        const previous = ip._touches.find((touch) => touch.touchId === id);
        const snapshot = previous ? { touchId: previous.touchId, button: previous.button,
            target: previous.target, x: previous.pos.x, y: previous.pos.y } : null;
        const info = ip.updateInfo(id, event.getLocation());
        const result = info.target === root ? "world" : "hud";
        if (snapshot) {
            info.touchId = snapshot.touchId; info.button = snapshot.button; info.target = snapshot.target;
            info.pos.x = snapshot.x; info.pos.y = snapshot.y;
        } else {
            info.touchId = -1; info.button = -1; info.target = null;
        }
        return result;
    };

    const deactivate = router.attachAdapter((id, event) => {
        const info = ip._touches.find((touch) => touch.touchId === id);
        if (!info) return;
        ip.cancelClick(id);
        info.began = false;
        info.downTargets.length = 0;
        try { originalCancel.call(ip, event as RawTouch); }
        finally {
            info.began = false; info.clickCancelled = true;
            info.downTargets.length = 0; info.touchMonitors.length = 0;
            info.target = null; info.touchId = -1; info.button = -1;
        }
    });

    const replace = (type: string, key: HandlerName, handler: TouchHandler | MouseHandler): void => {
        if (ip.enabled) root.node.off(type, originals.get(key)!, ip);
        // Assigning on the instance keeps InputProcessor.onEnable/onDisable working.
        Object.defineProperty(ip, key, { value: handler, writable: true, configurable: true });
        if (ip.enabled) root.node.on(type, handler, ip);
    };

    const release = (): void => {
        if (released) return;
        released = true;
        if (installed?.release === release) installed = null;
        try { deactivate(); }
        finally {
            for (const [type, key] of [...touchBindings, ...mouseBindings]) {
                root.node.off(type, ip[key], ip);
                const descriptor = descriptors.get(key);
                if (descriptor) Object.defineProperty(ip, key, descriptor);
                else delete (ip as unknown as Partial<Record<HandlerName, unknown>>)[key];
                if (ip.enabled && root.node.isValid) root.node.on(type, originals.get(key)!, ip);
            }
        }
    };
    installed = { release };
    try {
        for (const [type, key, phase] of touchBindings) {
            const original = originals.get(key) as TouchHandler;
            replace(type, key, (event: RawTouch) => {
                if (released) return;
                const owner = router.routeTouch(phase, event, phase === "start" ? hit(event) : "world");
                if (owner === "hud") {
                    try { return original.call(ip, event); }
                    finally { event.preventSwallow = false; }
                }
                // World input was explicitly routed; skip FGUI so crossing into a
                // HUD cannot generate a click. Native Cocos nodes may still receive
                // their UI event; the host global source skips events while this adapter captures.
                event.preventSwallow = owner === "world" && !router.isBlocked;
                return undefined;
            });
        }
        for (const [type, key] of mouseBindings) {
            const original = originals.get(key) as MouseHandler;
            replace(type, key, (event: RawMouse) => {
                if (released) return;
                if (router.isSuspended) { event.preventSwallow = false; return undefined; }
                const owner = key === "mouseWheelHandler" ? router.routeWheel(event, hit(event))
                    : router.peek(0) ?? hit(event);
                if (owner === "hud") {
                    try { return original.call(ip, event); }
                    finally { event.preventSwallow = false; }
                }
                // Cocos synthesizes touch from desktop mouse. Never synthesize a
                // second world gesture here; only wheel has a separate raw route.
                event.preventSwallow = owner === "world" && !router.isBlocked;
                return undefined;
            });
        }
    } catch (error) { release(); throw error; }
    return release;
}
