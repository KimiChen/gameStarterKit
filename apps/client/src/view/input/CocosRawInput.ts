/** The global fallback is used only while the FGUI adapter is not capturing UI events. */
import { input, Input, type EventMouse, type EventTouch } from "cc";
import { rawInput, type RawInputRouter } from "./RawInput";

export function installCocosRawInput(router: RawInputRouter = rawInput): () => void {
    const bindings: [typeof Input.EventType.TOUCH_START | typeof Input.EventType.TOUCH_MOVE | typeof Input.EventType.TOUCH_END | typeof Input.EventType.TOUCH_CANCEL, (event: EventTouch) => void][] = [
        [Input.EventType.TOUCH_START, (event) => route("start", event)],
        [Input.EventType.TOUCH_MOVE, (event) => route("move", event)],
        [Input.EventType.TOUCH_END, (event) => route("end", event)],
        [Input.EventType.TOUCH_CANCEL, (event) => route("cancel", event)],
    ];
    const route = (phase: "start" | "move" | "end" | "cancel", event: EventTouch): void => {
        if (!router.isUiCapturing) router.routeTouch(phase, event, "world");
    };
    const wheel = (event: EventMouse): void => {
        if (!router.isUiCapturing) router.routeWheel(event, "world");
    };
    const attached: typeof bindings = [];
    let wheelBound = false, released = false;
    const release = (): void => {
        if (released) return;
        released = true;
        router.cancel();
        for (const [type, callback] of attached) input.off(type, callback);
        if (wheelBound) input.off(Input.EventType.MOUSE_WHEEL, wheel);
    };
    try {
        for (const binding of bindings) { attached.push(binding); input.on(...binding); }
        wheelBound = true;
        input.on(Input.EventType.MOUSE_WHEEL, wheel);
    } catch (error) { release(); throw error; }
    return release;
}
