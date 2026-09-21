import { Color, type EventTouch, Label, Node, UITransform, Vec3, view } from "cc";
import {
    JoystickSession, cooldownLabel, hudLayout, packForMap, wheelSlotPositions,
    type IMmoHud, type IMmoHudContext, type MmoWorldViewModel,
} from "../../../kits/mmo/api/content/index";
import { createSolidPlate } from "../../../view/uiPlate";
import { holdOwnerLabel, MmoHoldHudLogic } from "../logic/MmoHoldHudLogic";

const INK = new Color(13, 24, 37, 235);
const TEXT = new Color(241, 239, 219, 255);
const DIM = new Color(170, 184, 197, 255);
const DAWN = new Color(233, 170, 61, 255);
const DUSK = new Color(120, 133, 237, 255);
const BUTTON = new Color(43, 62, 78, 245);

/** 据点专属 HUD：世界实体层由 kit 绘制，本类完全接管控制、比分和据点导航。 */
export class MmoHoldHudView implements IMmoHud {
    private root: Node | null = null;
    private board: Node | null = null;
    private wheel: Node | null = null;
    private knob: Node | null = null;
    private status: Label | null = null;
    private joystick: JoystickSession | null = null;
    private lastBoard = "";
    private lastWheel = "";
    private readonly logic: MmoHoldHudLogic;
    private readonly layout;

    constructor(private readonly context: IMmoHudContext) {
        this.logic = new MmoHoldHudLogic(context.subscribeScriptState);
        const safe = (view as unknown as { getSafeAreaRect?: () => { y: number } }).getSafeAreaRect?.();
        this.layout = hudLayout(context.width, context.height, Math.max(0, safe?.y ?? 0));
    }

    mount(): void {
        if (this.root) return;
        const { width: w, height: h } = this.context;
        const root = this.node("MmoHoldHudView", this.context.host, w, h);
        this.root = root;
        this.board = this.node("hold-scoreboard", root, w * 0.94, h * 0.16);
        this.board.setPosition(0, h * 0.5 - h * 0.095, 0);
        this.board.on(Node.EventType.TOUCH_END, () => {});
        this.button(root, "前往 A", w * 0.25, h * 0.045, -w * 0.3, h * 0.29, () => this.goTo("pointA"));
        this.button(root, "前往 B", w * 0.25, h * 0.045, 0, h * 0.29, () => this.goTo("pointB"));
        this.button(root, "离开", w * 0.25, h * 0.045, w * 0.3, h * 0.29, () => this.context.dispatchInput({ type: "leave" }));
        this.status = this.label(root, "", w * 0.026, DIM, 0, -h * 0.5 + w * 0.51, "hold-status");
        const j = this.layout.joystick;
        const pad = createSolidPlate(root, j.radius * 2, j.radius * 2, BUTTON, j.x, j.y, "hold-joystick");
        this.knob = createSolidPlate(pad, j.knobRadius * 2, j.knobRadius * 2, DAWN, 0, 0, "knob");
        pad.on(Node.EventType.TOUCH_START, this.joystickStart, this);
        pad.on(Node.EventType.TOUCH_MOVE, this.joystickMove, this);
        pad.on(Node.EventType.TOUCH_END, this.joystickEnd, this);
        pad.on(Node.EventType.TOUCH_CANCEL, this.joystickEnd, this);
        const a = this.layout.actionSize;
        this.button(root, "停", a, a, this.layout.actionX, this.layout.bottom + a * 0.7, () => this.context.dispatchInput({ type: "stop" }));
        this.button(root, "拾取", a, a, this.layout.actionX, this.layout.bottom + a * 1.9, () => this.context.dispatchInput({ type: "pickup" }));
        this.wheel = this.node("hold-wheel", root, w, h);
        this.logic.onChanged = () => this.renderBoard();
        this.logic.mount();
        this.renderBoard();
    }

    render(model: MmoWorldViewModel): void {
        if (this.status) this.status.string = `HP ${model.hp}/${model.hpMax} · MP ${model.mp}/${model.mpMax}\n${model.notice || (model.targetId ? "已选目标 · 点击技能施放" : "点选目标 / 点地移动 · 摇杆争夺据点")}`;
        const key = JSON.stringify([model.spells, model.spells.map((id) => cooldownLabel(model.cooldowns[id])), model.dropping]);
        if (this.wheel && key !== this.lastWheel) {
            this.lastWheel = key;
            this.clear(this.wheel);
            const w = this.layout.wheel;
            const positions = wheelSlotPositions(model.spells.length, w.radius, w.slotSize);
            model.spells.forEach((spell, index) => {
                const at = positions[index]!;
                const cooldown = cooldownLabel(model.cooldowns[spell]);
                this.button(this.wheel!, `${spell}\n${cooldown || "就绪"}`, w.slotSize, w.slotSize, w.x + at.x, w.y + at.y,
                    () => this.context.dispatchInput({ type: "cast", spellId: spell }), cooldown || model.dropping ? BUTTON : DUSK);
            });
        }
    }

    unmount(): void {
        this.joystickEnd();
        this.logic.onChanged = () => {};
        this.logic.unmount();
        this.root?.removeFromParent();
        this.root?.destroy();
        this.root = this.board = this.wheel = this.knob = null;
        this.status = null;
        this.lastBoard = this.lastWheel = "";
    }

    private renderBoard(): void {
        const board = this.board;
        if (!board) return;
        const state = this.logic.state();
        const key = JSON.stringify(state);
        if (key === this.lastBoard) return;
        this.lastBoard = key;
        this.clear(board);
        const w = this.context.width, h = this.context.height;
        createSolidPlate(board, w * 0.94, h * 0.16, INK, 0, 0);
        this.label(board, `山脊争夺 · ${this.logic.headline()}`, w * 0.033, TEXT, 0, h * 0.054, "hold-phase");
        this.label(board, state.ready ? `曙光  ${state.dawn} / 100` : "曙光  —", w * 0.041, DAWN, -w * 0.23, h * 0.012, "hold-dawn-score");
        this.label(board, state.ready ? `暮光  ${state.dusk} / 100` : "暮光  —", w * 0.041, DUSK, w * 0.23, h * 0.012, "hold-dusk-score");
        for (const [x, score, color] of [[-w * 0.23, state.dawn, DAWN], [w * 0.23, state.dusk, DUSK]] as const) {
            createSolidPlate(board, w * 0.38, h * 0.006, BUTTON, x, -h * 0.014);
            if (score > 0) createSolidPlate(board, w * 0.38 * score / 100, h * 0.006, color, x - w * 0.19 + w * 0.19 * score / 100, -h * 0.014);
        }
        this.label(board, state.ready ? `A 据点 · ${holdOwnerLabel(state.pointA)}       B 据点 · ${holdOwnerLabel(state.pointB)}` : "等待服务器据点状态", w * 0.032, TEXT, 0, -h * 0.045, "hold-owners");
    }

    private goTo(regionId: string): void {
        const region = packForMap(this.context.mapId)?.pack.regions.find((entry) => entry.mapId === this.context.mapId && entry.regionId === regionId);
        if (!region) return;
        const shape = region.shape;
        const pos = shape.kind === "circle" ? shape.center : { x: (shape.min.x + shape.max.x) * 0.5, y: (shape.min.y + shape.max.y) * 0.5 };
        this.context.dispatchInput({ type: "moveTo", x: pos.x, y: pos.y });
    }
    private joystickStart(event: EventTouch): void {
        const j = this.layout.joystick;
        this.joystick = new JoystickSession({ x: j.x, y: j.y }, j.radius);
        this.joystickMove(event);
    }
    private joystickMove(event: EventTouch): void {
        if (!this.joystick || !this.root) return;
        const touch = event.getUILocation();
        const point = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(touch.x, touch.y, 0));
        const result = this.joystick.move(point, Date.now());
        this.knob?.setPosition(result.knob.x - this.joystick.origin.x, result.knob.y - this.joystick.origin.y, 0);
        if (result.send) this.context.dispatchInput({ type: "move", dir: result.send });
    }
    private joystickEnd(): void {
        if (this.joystick?.end()) this.context.dispatchInput({ type: "stop" });
        this.joystick = null;
        this.knob?.setPosition(0, 0, 0);
    }
    private clear(node: Node): void { for (const child of [...node.children]) { child.removeFromParent(); child.destroy(); } }
    private node(name: string, parent: Node, width: number, height: number): Node {
        const node = new Node(name); node.layer = parent.layer;
        node.addComponent(UITransform).setContentSize(width, height); parent.addChild(node); return node;
    }
    private label(parent: Node, text: string, size: number, color: Color, x: number, y: number, name = "label"): Label {
        const node = this.node(name, parent, this.context.width * 0.92, size * 2.5);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label); label.string = text; label.fontSize = Math.round(size); label.lineHeight = Math.round(size * 1.3); label.color = color;
        return label;
    }
    private button(parent: Node, title: string, width: number, height: number, x: number, y: number, action: () => void, color = BUTTON): void {
        const button = createSolidPlate(parent, width, height, color, x, y, `btn-${title.split("\n")[0]}`);
        const label = this.label(button, title, Math.min(width * 0.24, height * 0.34), TEXT, 0, 0);
        label.node.getComponent(UITransform)!.setContentSize(width, height);
        button.on(Node.EventType.TOUCH_END, action, this);
    }
}
