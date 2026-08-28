import {
    Color,
    EventTouch,
    Graphics,
    Input,
    Node,
    UITransform,
    Vec3,
    input,
} from "cc";
import type {
    BallMoveInput,
    BallMovePresentation,
    BallMoveRenderWorld,
} from "../../../logic/rooms/ballMove/BallMoveGameplay";
import { renderBallMoveWorld } from "../../../logic/rooms/ballMove/BallMoveGameplay";
import { MAP_HEIGHT, MAP_WIDTH } from "../../../shared/index";

const COLOR_BORDER = new Color(120, 120, 120, 255);
const COLOR_DEAD = new Color(100, 100, 100, 255);
const COLOR_SELF = new Color(60, 200, 120, 255);
const COLOR_OTHER = new Color(240, 150, 60, 255);
const COLOR_HP_BG = new Color(40, 40, 40, 255);
const COLOR_HP = new Color(220, 60, 60, 255);
const RENDER_PALETTE = {
    border: COLOR_BORDER,
    dead: COLOR_DEAD,
    self: COLOR_SELF,
    other: COLOR_OTHER,
    hpBackground: COLOR_HP_BG,
    hp: COLOR_HP,
};

/** Cocos adapter for the ballMove presentation port. */
export class BallMoveView implements BallMovePresentation {
    private static readonly TMP_VEC3 = new Vec3();

    private graphics: Graphics | null = null;
    private layerTransform: UITransform | null = null;
    private layer: Node | null = null;
    private mounted = false;
    private touchStartBound = false;
    private touchMoveBound = false;
    private touchEndBound = false;
    private touchCancelBound = false;

    constructor(
        private readonly host: Node,
        private readonly dispatchInput: (input: BallMoveInput) => void,
    ) {}

    mount(): void {
        if (this.mounted) return;
        let layer: Node | null = null;
        const cleanupErrors: unknown[] = [];
        try {
            layer = new Node("PlayersLayer");
            layer.layer = this.host.layer;
            this.layer = layer;
            this.layerTransform = layer.addComponent(UITransform);
            this.host.addChild(layer);
            this.graphics = layer.addComponent(Graphics);

            // Set ownership before calling into the engine. If registration throws
            // after installing a listener, rollback still attempts the matching off.
            this.touchStartBound = true;
            input.on(Input.EventType.TOUCH_START, this.onTouch, this);
            this.touchMoveBound = true;
            input.on(Input.EventType.TOUCH_MOVE, this.onTouch, this);
            this.touchEndBound = true;
            input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
            this.touchCancelBound = true;
            input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
            this.mounted = true;
        } catch (error) {
            this.mounted = false;
            this.releaseTouchListeners(cleanupErrors);
            this.graphics = null;
            this.layerTransform = null;
            this.layer = null;
            this.destroyLayer(layer, cleanupErrors);
            this.reportCleanupErrors(cleanupErrors);
            throw error;
        }
    }

    render(world: BallMoveRenderWorld): void {
        const graphics = this.graphics;
        if (!this.mounted || !graphics) return;
        renderBallMoveWorld(world, graphics, RENDER_PALETTE);
    }

    unmount(): void {
        if (!this.mounted && !this.layer) return;
        this.mounted = false;
        const cleanupErrors: unknown[] = [];
        this.releaseTouchListeners(cleanupErrors);
        const layer = this.layer ?? this.graphics?.node ?? null;
        this.graphics = null;
        this.layerTransform = null;
        this.layer = null;
        this.destroyLayer(layer, cleanupErrors);
        this.reportCleanupErrors(cleanupErrors);
    }

    private onTouch(event: EventTouch): void {
        if (!this.mounted) return;
        const transform = this.layerTransform;
        if (!transform) return;
        const ui = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(BallMoveView.TMP_VEC3.set(ui.x, ui.y, 0));
        this.dispatchInput({
            type: "target",
            x: local.x + MAP_WIDTH / 2,
            y: local.y + MAP_HEIGHT / 2,
        });
    }

    private onTouchEnd(): void {
        if (!this.mounted) return;
        this.dispatchInput({ type: "release" });
    }

    private releaseTouchListeners(errors: unknown[]): void {
        if (this.touchStartBound) {
            this.touchStartBound = false;
            this.tryCleanup(() => input.off(Input.EventType.TOUCH_START, this.onTouch, this), errors);
        }
        if (this.touchMoveBound) {
            this.touchMoveBound = false;
            this.tryCleanup(() => input.off(Input.EventType.TOUCH_MOVE, this.onTouch, this), errors);
        }
        if (this.touchEndBound) {
            this.touchEndBound = false;
            this.tryCleanup(() => input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this), errors);
        }
        if (this.touchCancelBound) {
            this.touchCancelBound = false;
            this.tryCleanup(() => input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this), errors);
        }
    }

    private destroyLayer(layer: Node | null, errors: unknown[]): void {
        if (!layer) return;
        this.tryCleanup(() => layer.destroy(), errors);
    }

    private tryCleanup(cleanup: () => unknown, errors: unknown[]): void {
        try {
            cleanup();
        } catch (error) {
            errors.push(error);
        }
    }

    private reportCleanupErrors(errors: unknown[]): void {
        if (errors.length > 0) {
            console.error("[BallMoveView] 资源清理异常（其余资源已继续释放）", errors);
        }
    }
}
