/** Snake V2 中央操作区：布局、设备偏好与 pointer ownership（纯 Logic）。 */

export type SnakeHandedness = "right" | "left";
export type SnakeControlId = "s1" | "s2" | "s3" | "s4" | "joystick";
export type SnakeControlAction = "emote" | "activeTool" | "shield" | "boost" | "steer";

export const SNAKE_HANDEDNESS_STORAGE_KEY = "snake.controls.handedness.v1";

export interface HandednessPreferencePort {
    read(key: typeof SNAKE_HANDEDNESS_STORAGE_KEY): string | null;
    write(key: typeof SNAKE_HANDEDNESS_STORAGE_KEY, value: SnakeHandedness): void;
}

export interface SnakeControlGeometry {
    readonly id: SnakeControlId;
    readonly action: SnakeControlAction;
    readonly x: number;
    readonly y: number;
    readonly visibleDiameter: number;
    readonly hitRadius: number;
    readonly visible: boolean;
}

const PHYSICAL_SLOTS = Object.freeze([
    { id: "s1", x: 130, y: 410, visibleDiameter: 88, hitRadius: 56 },
    { id: "s2", x: 295, y: 490, visibleDiameter: 104, hitRadius: 64 },
    { id: "s3", x: 455, y: 490, visibleDiameter: 104, hitRadius: 64 },
    { id: "s4", x: 620, y: 410, visibleDiameter: 144, hitRadius: 88 },
] as const);

const RIGHT_ACTIONS: readonly SnakeControlAction[] = ["emote", "activeTool", "shield", "boost"];
const LEFT_ACTIONS: readonly SnakeControlAction[] = ["boost", "shield", "activeTool", "emote"];

export function snakeControlShiftY(safeBottom: number): number {
    return Math.max(0, Math.max(0, safeBottom) + 161 - 220);
}

export function snakeControlLayout(
    handedness: SnakeHandedness,
    safeBottom = 0,
): readonly SnakeControlGeometry[] {
    const shift = snakeControlShiftY(safeBottom);
    const actions = handedness === "left" ? LEFT_ACTIONS : RIGHT_ACTIONS;
    const slots: SnakeControlGeometry[] = PHYSICAL_SLOTS.map((slot, index) => ({
        ...slot,
        y: slot.y + shift,
        action: actions[index],
        // S2 首发只开放加速；隐藏槽位保留几何、不补位且不命中。
        visible: actions[index] === "boost",
    }));
    slots.push({
        id: "joystick",
        action: "steer",
        x: 375,
        y: 220 + shift,
        visibleDiameter: 220,
        hitRadius: 155,
        visible: true,
    });
    return slots;
}

export class SnakeHandednessPreference {
    private value: SnakeHandedness = "right";

    constructor(
        private readonly port: HandednessPreferencePort,
        private readonly diagnose: (message: string, error?: unknown) => void = () => {},
    ) {}

    load(): SnakeHandedness {
        try {
            const stored = this.port.read(SNAKE_HANDEDNESS_STORAGE_KEY);
            this.value = stored === "left" || stored === "right" ? stored : "right";
            if (stored !== null && stored !== "left" && stored !== "right") {
                this.diagnose("snake handedness value is invalid; using right");
            }
        } catch (error) {
            this.value = "right";
            this.diagnose("snake handedness read failed; using right", error);
        }
        return this.value;
    }

    get current(): SnakeHandedness { return this.value; }

    /** 先持久化后应用；失败时当局立即且持续回退 right。 */
    set(candidate: SnakeHandedness): boolean {
        try {
            this.port.write(SNAKE_HANDEDNESS_STORAGE_KEY, candidate);
            this.value = candidate;
            return true;
        } catch (error) {
            this.value = "right";
            this.diagnose("snake handedness write failed; rolled back to right", error);
            return false;
        }
    }
}

export interface SnakePointerCallbacks {
    steer(x: number, y: number, knobX: number, knobY: number): void;
    centerJoystick(): void;
    setBoost(active: boolean): void;
    activate(action: Exclude<SnakeControlAction, "steer" | "boost">): void;
}

export class SnakePointerRouter {
    private layout: readonly SnakeControlGeometry[];
    private readonly pointerOwners = new Map<number, SnakeControlId>();
    private readonly controlOwners = new Map<SnakeControlId, number>();

    constructor(
        handedness: SnakeHandedness,
        safeBottom: number,
        private readonly callbacks: SnakePointerCallbacks,
    ) {
        this.layout = snakeControlLayout(handedness, safeBottom);
    }

    setLayout(handedness: SnakeHandedness, safeBottom: number): void {
        this.cancelAll();
        this.layout = snakeControlLayout(handedness, safeBottom);
    }

    get controls(): readonly SnakeControlGeometry[] { return this.layout; }
    get ownerCount(): number { return this.pointerOwners.size; }

    start(pointerId: number, x: number, y: number): SnakeControlId | null {
        if (this.pointerOwners.has(pointerId)) return this.pointerOwners.get(pointerId) ?? null;
        const order: readonly SnakeControlId[] = ["s1", "s2", "s3", "s4", "joystick"];
        for (const id of order) {
            const control = this.layout.find((entry) => entry.id === id);
            if (!control?.visible || this.controlOwners.has(id) || !inside(control, x, y)) continue;
            this.pointerOwners.set(pointerId, id);
            this.controlOwners.set(id, pointerId);
            if (control.action === "boost") this.callbacks.setBoost(true);
            else if (control.action === "steer") this.steer(control, x, y);
            return id;
        }
        return null;
    }

    move(pointerId: number, x: number, y: number): void {
        const id = this.pointerOwners.get(pointerId);
        if (id !== "joystick") return;
        const control = this.layout.find((entry) => entry.id === id);
        if (control) this.steer(control, x, y);
    }

    end(pointerId: number, x: number, y: number): void {
        const id = this.pointerOwners.get(pointerId);
        if (!id) return;
        const control = this.layout.find((entry) => entry.id === id);
        this.pointerOwners.delete(pointerId);
        this.controlOwners.delete(id);
        if (!control) return;
        if (control.action === "boost") this.callbacks.setBoost(false);
        else if (control.action === "steer") this.callbacks.centerJoystick();
        else if (inside(control, x, y)) this.callbacks.activate(control.action);
    }

    cancel(pointerId: number): void {
        const id = this.pointerOwners.get(pointerId);
        if (!id) return;
        const control = this.layout.find((entry) => entry.id === id);
        this.pointerOwners.delete(pointerId);
        this.controlOwners.delete(id);
        if (control?.action === "boost") this.callbacks.setBoost(false);
        if (control?.action === "steer") this.callbacks.centerJoystick();
    }

    cancelAll(): void {
        const hadBoost = this.layout.some((control) => control.action === "boost"
            && this.controlOwners.has(control.id));
        const hadJoystick = this.controlOwners.has("joystick");
        this.pointerOwners.clear();
        this.controlOwners.clear();
        if (hadBoost) this.callbacks.setBoost(false);
        if (hadJoystick) this.callbacks.centerJoystick();
    }

    private steer(control: SnakeControlGeometry, x: number, y: number): void {
        const dx = x - control.x;
        const dy = y - control.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 12) return;
        const directionX = dx / distance;
        const directionY = dy / distance;
        const capped = Math.min(110, distance);
        this.callbacks.steer(directionX, directionY, directionX * capped, directionY * capped);
    }
}

function inside(control: SnakeControlGeometry, x: number, y: number): boolean {
    return Math.hypot(x - control.x, y - control.y) <= control.hitRadius;
}
