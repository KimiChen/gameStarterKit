/**
 * mmoWorld presentation（Cocos 纯节点 2D 公告板，挂在玩法 presentation host 节点下；坐标以 host 中心为原点）——3d.md SD9 = C 首版：
 * 世界视图 = 相机跟随本人的正交投影，实体 = 按 presentationId 取色的方块 + 名字（本人套黄环、被选目标套红环）。
 * 竖屏操作模型（MG1-B1）：左下**摇杆**（节点级触摸：按下 / 移动 / 抬手 → move / stop；几何与限频在 logic/rooms/mmoWorld/hudControls.ts）、
 * 世界层**轻点**（按下与抬起 ≤ 12 px）选目标 / 再点清除 / 点空地走过去、右下**技能轮盘**（职业技能弧形分槽 + 冷却秒数 + 就绪变色）；
 * 动作钮：停 / 拾取（底部中列）、传送 / 离开（右上）。状态条：图 / HP / MP / 实体数 / 目标 / 提示 / 附近聊天两行 / 背包摘要。
 * 分工（铁律 9）：本文件只管节点与触摸；视图模型来自 logic/rooms/mmoWorld/MmoWorldGameplay.ts 的 model()。
 * ⚠ HUD 画在世界节点内（3d.md SC1-B9 前的退路）：钮 / 摇杆 / 轮盘槽 / 状态条是 hud 层的节点级监听（同层兄弟不冒泡，先命中的吞掉），世界层监听只收落空的触摸。
 * 手搓粗糙版（同 ArenaCaptureView 口径）：按模型键重建实体层 / 状态条 / 轮盘槽；摇杆与钮只在 mount 建一次。
 */
import { Color, type EventTouch, Label, Node, UITransform, Vec3, view } from "cc";
import type { MmoWorldInput, MmoWorldPresentation, MmoWorldViewModel } from "../../../logic/rooms/mmoWorld/MmoWorldGameplay";
import {
    JoystickSession, MMO_HUD_WORLD_SCALE, cooldownLabel, hudLayout, isTap, resolveWorldTap, screenToWorld, wheelSlotPositions, worldToScreen, type HudLayout,
} from "../../../logic/rooms/mmoWorld/hudControls";
import type { IVec2 } from "../../../kits/mmo/api/movement/index";
import { createSolidPlate } from "../../uiPlate";

const BG = new Color(18, 24, 20, 255);
const GROUND = new Color(40, 56, 44, 255);
const PANEL = new Color(30, 36, 52, 230);
const PAD = new Color(30, 36, 52, 150);
const KNOB = new Color(200, 210, 230, 235);
const HUB = new Color(52, 60, 84, 235);
const READY = new Color(70, 130, 210, 235);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);
const SELF_RING = new Color(255, 230, 120, 255);
const TARGET_RING = new Color(235, 90, 80, 255);

export class MmoWorldView implements MmoWorldPresentation {
    private layer: Node | null = null;
    private world: Node | null = null;
    private hud: Node | null = null;
    private wheel: Node | null = null;
    private knob: Node | null = null;
    private layout: HudLayout | null = null;
    private width = 0;
    private height = 0;
    private lastKey = "";
    private lastWheelKey = "";
    /** 最近一次渲染的模型（触摸解析时读：实体表 / 目标 / 相机中心 / 技能栏） */
    private lastModel: MmoWorldViewModel | null = null;
    private joystick: JoystickSession | null = null;
    private tapStart: IVec2 | null = null;

    constructor(
        private readonly host: Node,
        private readonly dispatchInput: (input: MmoWorldInput) => void,
    ) {}

    mount(): void {
        if (this.layer) return;
        const size = view.getVisibleSize();
        this.width = size.width;
        this.height = size.height;
        const layer = this.node("MmoWorldLayer", this.host, this.width, this.height);
        this.layer = layer;
        this.plate(layer, this.width, this.height, BG, 0, 0, "bg");
        const world = this.node("world", layer, this.width, this.height);
        this.world = world;
        world.on(Node.EventType.TOUCH_START, this.onWorldTouchStart, this);
        world.on(Node.EventType.TOUCH_END, this.onWorldTouchEnd, this);
        world.on(Node.EventType.TOUCH_CANCEL, this.onWorldTouchCancel, this);
        const hud = this.node("hud", layer, this.width, this.height);
        this.hud = hud;
        const layout = hudLayout(this.width, this.height, this.readSafeBottom());
        this.layout = layout;
        this.buildJoystick(hud, layout);
        this.buildWheel(hud, layout);
        const a = layout.actionSize;
        this.button(hud, "停", a, a, layout.actionX, layout.bottom + a * 0.7, () => this.dispatchInput({ type: "stop" }));
        this.button(hud, "拾取", a, a, layout.actionX, layout.bottom + a * 1.9, () => this.dispatchInput({ type: "pickup" }));
        this.button(hud, "传送", this.width * 0.24, this.height * 0.055, this.width * 0.5 - this.width * 0.16, this.height * 0.5 - this.height * 0.19, () => this.dispatchInput({ type: "transfer" }));
        this.button(hud, "离开", this.width * 0.24, this.height * 0.055, this.width * 0.5 - this.width * 0.16, this.height * 0.5 - this.height * 0.255, () => this.dispatchInput({ type: "leave" }));
        this.lastKey = "";
        this.lastWheelKey = "";
    }

    render(model: MmoWorldViewModel): void {
        const world = this.world;
        const hud = this.hud;
        if (!world || !hud) return;
        this.lastModel = model;
        const cooldownSeconds = Object.fromEntries(model.spells.map((spell) => [spell, cooldownLabel(model.cooldowns[spell])]));
        const key = JSON.stringify([
            model.entities.map((entity) => [entity.id, Math.round(entity.x), Math.round(entity.y), entity.hp]), model.hp, model.mp, model.synced, model.dropping, model.notice,
            model.bagSummary, model.targetId, model.spells, cooldownSeconds, model.casting?.spellId ?? null, model.chat.length,
        ]);
        if (key === this.lastKey) return;
        this.lastKey = key;
        for (const child of [...world.children]) { child.removeFromParent(); child.destroy(); }
        const center = this.cameraCenter(model);
        const groundAt = worldToScreen({ x: model.mapSize.w * 0.5, y: model.mapSize.h * 0.5 }, center);
        this.plate(world, model.mapSize.w * MMO_HUD_WORLD_SCALE, model.mapSize.h * MMO_HUD_WORLD_SCALE, GROUND, groundAt.x, groundAt.y, "ground");
        for (const entity of model.entities) {
            const { x, y } = worldToScreen(entity, center);
            const [r, g, b, a] = entity.presentation.color;
            const size = entity.presentation.size;
            if (entity.isSelf) this.plate(world, size + 8, size + 8, SELF_RING, x, y, "self-ring");
            if (entity.id === model.targetId) this.plate(world, size + 12, size + 12, TARGET_RING, x, y, "target-ring");
            this.plate(world, size, size, new Color(r, g, b, a), x, y, entity.id);
            this.label(world, entity.kind === "loot" ? `${entity.name}×${entity.count ?? 1}` : `${entity.name} ${entity.hp}/${entity.hpMax}`, Math.round(size * 0.42), TEXT, x, y + size * 0.85);
        }
        this.renderStatus(hud, model);
        this.renderWheel(model, cooldownSeconds);
    }

    unmount(): void {
        const layer = this.layer;
        this.layer = null;
        this.world = null;
        this.hud = null;
        this.wheel = null;
        this.knob = null;
        this.layout = null;
        this.lastModel = null;
        this.joystick = null;
        this.tapStart = null;
        if (!layer) return;
        layer.removeFromParent();
        layer.destroy();
    }

    // ── 状态条 ──

    private renderStatus(hud: Node, model: MmoWorldViewModel): void {
        const status = hud.getChildByName("status");
        if (status) { status.removeFromParent(); status.destroy(); }
        const panel = this.node("status", hud, this.width, this.height * 0.12);
        panel.setPosition(0, this.height * 0.5 - this.height * 0.07, 0);
        panel.on(Node.EventType.TOUCH_END, this.swallowTouch, this);
        this.plate(panel, this.width * 0.96, this.height * 0.1, PANEL, 0, 0);
        const line = Math.round(this.width * 0.04);
        this.label(panel, `${model.mapId}  HP ${model.hp}/${model.hpMax}  MP ${model.mp}/${model.mpMax}  实体 ${model.entities.length}${model.synced ? "" : "  同步中…"}`, line, TEXT, 0, line * 0.5);
        const target = model.targetId === null ? null : model.entities.find((entity) => entity.id === model.targetId) ?? null;
        const combat = `${target ? `目标 ${target.name} ${target.hp}/${target.hpMax}（再点清除）` : "无目标（点实体选目标，点空地走过去）"}${model.casting ? `  施法 ${model.casting.spellId}` : ""}`;
        this.label(panel, model.dropping ? "连接中断，重连中…" : model.notice || combat, Math.round(line * 0.85), model.dropping ? WARN : DIM, 0, -line * 0.7);
        // 附近聊天最近两行（MK1-B5；完整聊天 UI 归内容插件 / FGUI HUD）
        if (model.chat.length > 0) this.label(panel, model.chat.slice(-2).map((entry) => `${entry.from}: ${entry.text}`).join("   "), Math.round(line * 0.75), DIM, 0, -line * 1.6);
        if (model.bagSummary) this.label(panel, model.bagSummary, Math.round(line * 0.7), DIM, 0, -line * 2.4);
    }

    private readonly swallowTouch = (): void => {};

    // ── 摇杆（MG1-B1）──

    private buildJoystick(hud: Node, layout: HudLayout): void {
        const { x, y, radius, knobRadius } = layout.joystick;
        const pad = this.node("joystick", hud, radius * 2, radius * 2);
        pad.setPosition(x, y, 0);
        this.plate(pad, radius * 2, radius * 2, PAD, 0, 0, "pad");
        this.plate(pad, radius * 0.5, radius * 0.5, PANEL, 0, 0, "pad-center");
        this.knob = this.plate(pad, knobRadius * 2, knobRadius * 2, KNOB, 0, 0, "knob");
        pad.on(Node.EventType.TOUCH_START, this.onJoystickStart, this);
        pad.on(Node.EventType.TOUCH_MOVE, this.onJoystickMove, this);
        pad.on(Node.EventType.TOUCH_END, this.onJoystickEnd, this);
        pad.on(Node.EventType.TOUCH_CANCEL, this.onJoystickEnd, this);
    }

    private onJoystickStart(event: EventTouch): void {
        const layout = this.layout;
        const point = this.localPoint(event);
        if (!layout || !point) return;
        this.joystick = new JoystickSession({ x: layout.joystick.x, y: layout.joystick.y }, layout.joystick.radius);
        this.onJoystickMove(event);
    }

    private onJoystickMove(event: EventTouch): void {
        const session = this.joystick;
        const point = this.localPoint(event);
        if (!session || !point) return;
        const { knob, send } = session.move(point, Date.now());
        this.knob?.setPosition(knob.x - session.origin.x, knob.y - session.origin.y, 0);
        if (send) this.dispatchInput({ type: "move", dir: send });
    }

    private onJoystickEnd(): void {
        const session = this.joystick;
        this.joystick = null;
        this.knob?.setPosition(0, 0, 0);
        if (session?.end()) this.dispatchInput({ type: "stop" });
    }

    // ── 世界层轻点：选目标 / 清除 / 点地走（MG1-B1）──

    private onWorldTouchStart(event: EventTouch): void {
        this.tapStart = this.localPoint(event);
    }

    private onWorldTouchEnd(event: EventTouch): void {
        const start = this.tapStart;
        this.tapStart = null;
        const end = this.localPoint(event);
        const model = this.lastModel;
        if (!start || !end || !model || !isTap(start, end)) return;
        this.dispatchInput(resolveWorldTap(model.entities, model.targetId, screenToWorld(end, this.cameraCenter(model))));
    }

    private onWorldTouchCancel(): void {
        this.tapStart = null;
    }

    // ── 技能轮盘（MG1-B1）──

    private buildWheel(hud: Node, layout: HudLayout): void {
        const { x, y, hubSize } = layout.wheel;
        const wheel = this.node("wheel", hud, hubSize, hubSize);
        wheel.setPosition(x, y, 0);
        this.wheel = wheel;
        const hub = this.plate(wheel, hubSize, hubSize, HUB, 0, 0, "hub");
        hub.on(Node.EventType.TOUCH_END, this.swallowTouch, this);
        this.label(wheel, "技能", Math.round(hubSize * 0.3), TEXT, 0, 0);
        this.node("slots", wheel, hubSize, hubSize);
    }

    /** 轮盘槽按（技能表 × 冷却秒数）键重建：就绪 = 高亮色，冷却中 = 面板色 + 秒数。 */
    private renderWheel(model: MmoWorldViewModel, cooldownSeconds: Readonly<Record<string, string>>): void {
        const wheel = this.wheel;
        const layout = this.layout;
        if (!wheel || !layout) return;
        const key = JSON.stringify([model.spells, cooldownSeconds]);
        if (key === this.lastWheelKey) return;
        this.lastWheelKey = key;
        const previous = wheel.getChildByName("slots");
        if (previous) { previous.removeFromParent(); previous.destroy(); }
        const slots = this.node("slots", wheel, layout.wheel.hubSize, layout.wheel.hubSize);
        const positions = wheelSlotPositions(model.spells.length, layout.wheel.radius, layout.wheel.slotSize);
        const size = layout.wheel.slotSize;
        model.spells.forEach((spell, index) => {
            const at = positions[index]!;
            const remaining = cooldownSeconds[spell] ?? "";
            const slot = this.button(slots, spell, size, size, at.x, at.y, () => this.dispatchInput({ type: "cast", spellId: spell }), remaining === "" ? READY : PANEL);
            if (remaining !== "") this.label(slot, remaining, Math.round(size * 0.3), WARN, 0, -size * 0.32);
        });
    }

    // ── 小件 ──

    /** 相机中心：本人（预测位置）或地图中心。 */
    private cameraCenter(model: MmoWorldViewModel): IVec2 {
        return { x: model.self?.x ?? model.mapSize.w * 0.5, y: model.self?.y ?? model.mapSize.h * 0.5 };
    }

    /** 触摸的 UI 坐标 → 世界层节点局部坐标（原点屏幕中心、y 向上）。 */
    private localPoint(event: EventTouch): IVec2 | null {
        const transform = this.layer?.getComponent(UITransform);
        if (!transform) return null;
        const ui = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
        return { x: local.x, y: local.y };
    }

    private readSafeBottom(): number {
        const safe = (view as unknown as { getSafeAreaRect?: () => { y: number } }).getSafeAreaRect?.();
        return Math.max(0, safe?.y ?? 0);
    }

    private node(name: string, parent: Node, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        const transform = node.addComponent(UITransform);
        transform.width = width;
        transform.height = height;
        parent.addChild(node);
        return node;
    }

    private plate(parent: Node, width: number, height: number, color: Color, x: number, y: number, name = "plate"): Node {
        return createSolidPlate(parent, width, height, color, x, y, name);
    }

    private label(parent: Node, text: string, fontSize: number, color: Color, x: number, y: number): Node {
        const node = this.node("label", parent, this.width, fontSize * 1.4);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.2);
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        return node;
    }

    private button(parent: Node, text: string, width: number, height: number, x: number, y: number, onTap: () => void, color: Color = PANEL): Node {
        const node = this.node(`btn-${text}`, parent, width, height);
        node.setPosition(x, y, 0);
        this.plate(node, width, height, color, 0, 0);
        this.label(node, text, Math.round(Math.min(width, height) * 0.4), TEXT, 0, 0);
        node.on(Node.EventType.TOUCH_END, onTap, this);
        return node;
    }
}
