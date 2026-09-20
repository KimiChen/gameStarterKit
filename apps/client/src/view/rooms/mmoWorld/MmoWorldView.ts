/**
 * mmoWorld presentation（Cocos 纯节点 2D 公告板，挂在玩法 presentation host 节点下；坐标以 host 中心为原点）——3d.md SD9 = C 首版：
 * 世界视图 = 相机跟随本人的正交投影，实体 = 按 presentationId 取色的方块 + 名字；最小 HUD = HP / MP 文本 + 四向按钮 + 停 / 传送 / 离开。
 * 分工（铁律 9）：本文件只管节点与触摸；视图模型来自 logic/rooms/mmoWorld/MmoWorldGameplay.ts 的 model()。
 * ⚠ HUD 与世界的输入归属等 3d.md SC1-B9（本版 HUD 画在世界节点内，即退路）。手搓粗糙版（同 ArenaCaptureView 口径），每帧按模型重建实体层。
 */
import { Color, Label, Node, UITransform, view } from "cc";
import type { MmoWorldInput, MmoWorldPresentation, MmoWorldViewModel } from "../../../logic/rooms/mmoWorld/MmoWorldGameplay";
import { createSolidPlate } from "../../uiPlate";

const BG = new Color(18, 24, 20, 255);
const GROUND = new Color(40, 56, 44, 255);
const PANEL = new Color(30, 36, 52, 230);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);
const SELF_RING = new Color(255, 230, 120, 255);
/** 世界单位 → 屏幕像素 */
const WORLD_SCALE = 0.35;

export class MmoWorldView implements MmoWorldPresentation {
    private layer: Node | null = null;
    private world: Node | null = null;
    private hud: Node | null = null;
    private width = 0;
    private height = 0;
    private lastKey = "";

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
        this.world = this.node("world", layer, this.width, this.height);
        const hud = this.node("hud", layer, this.width, this.height);
        this.hud = hud;
        const pad = Math.min(this.width, this.height) * 0.12;
        const bx = -this.width * 0.5 + pad * 1.6;
        const by = -this.height * 0.5 + pad * 1.8;
        this.button(hud, "↑", pad, pad, bx, by + pad, () => this.dispatchInput({ type: "move", dir: { x: 0, y: -1 } }));
        this.button(hud, "↓", pad, pad, bx, by - pad, () => this.dispatchInput({ type: "move", dir: { x: 0, y: 1 } }));
        this.button(hud, "←", pad, pad, bx - pad, by, () => this.dispatchInput({ type: "move", dir: { x: -1, y: 0 } }));
        this.button(hud, "→", pad, pad, bx + pad, by, () => this.dispatchInput({ type: "move", dir: { x: 1, y: 0 } }));
        this.button(hud, "停", pad, pad, bx, by, () => this.dispatchInput({ type: "stop" }));
        this.button(hud, "传送", this.width * 0.24, this.height * 0.055, this.width * 0.5 - this.width * 0.16, -this.height * 0.5 + this.height * 0.13, () => this.dispatchInput({ type: "transfer" }));
        // 战斗（MK2-B1）：技能栏第 1 / 2 格（职业技能表来自 model.spells，点击时按当前模型取）
        this.button(hud, "技1", pad, pad, this.width * 0.5 - pad * 1.6, by, () => { const spell = this.lastSpells[0]; if (spell) this.dispatchInput({ type: "cast", spellId: spell }); });
        this.button(hud, "技2", pad, pad, this.width * 0.5 - pad * 2.7, by, () => { const spell = this.lastSpells[1]; if (spell) this.dispatchInput({ type: "cast", spellId: spell }); });
        this.button(hud, "离开", this.width * 0.24, this.height * 0.055, this.width * 0.5 - this.width * 0.16, -this.height * 0.5 + this.height * 0.06, () => this.dispatchInput({ type: "leave" }));
        this.lastKey = "";
    }

    /** 最近一次渲染的技能栏（按钮点击时读） */
    private lastSpells: readonly string[] = [];

    render(model: MmoWorldViewModel): void {
        const world = this.world;
        const hud = this.hud;
        if (!world || !hud) return;
        const key = JSON.stringify([model.entities.map((entity) => [entity.id, Math.round(entity.x), Math.round(entity.y), entity.hp]), model.hp, model.mp, model.synced, model.dropping, model.notice]);
        if (key === this.lastKey) return;
        this.lastKey = key;
        for (const child of [...world.children]) { child.removeFromParent(); child.destroy(); }
        const centerX = model.self?.x ?? model.mapSize.w * 0.5;
        const centerY = model.self?.y ?? model.mapSize.h * 0.5;
        this.plate(world, model.mapSize.w * WORLD_SCALE, model.mapSize.h * WORLD_SCALE, GROUND,
            (model.mapSize.w * 0.5 - centerX) * WORLD_SCALE, -(model.mapSize.h * 0.5 - centerY) * WORLD_SCALE, "ground");
        for (const entity of model.entities) {
            const x = (entity.x - centerX) * WORLD_SCALE;
            const y = -(entity.y - centerY) * WORLD_SCALE;
            const [r, g, b, a] = entity.presentation.color;
            const size = entity.presentation.size;
            if (entity.isSelf) this.plate(world, size + 8, size + 8, SELF_RING, x, y, "self-ring");
            this.plate(world, size, size, new Color(r, g, b, a), x, y, entity.id);
            this.label(world, `${entity.name} ${entity.hp}/${entity.hpMax}`, Math.round(size * 0.42), TEXT, x, y + size * 0.85);
        }
        const status = hud.getChildByName("status");
        if (status) { status.removeFromParent(); status.destroy(); }
        const panel = this.node("status", hud, this.width, this.height * 0.12);
        panel.setPosition(0, this.height * 0.5 - this.height * 0.07, 0);
        this.plate(panel, this.width * 0.96, this.height * 0.1, PANEL, 0, 0);
        const line = Math.round(this.width * 0.04);
        this.label(panel, `${model.mapId}  HP ${model.hp}/${model.hpMax}  MP ${model.mp}/${model.mpMax}  实体 ${model.entities.length}${model.synced ? "" : "  同步中…"}`, line, TEXT, 0, line * 0.5);
        this.lastSpells = model.spells;
        const target = model.targetId === null ? null : model.entities.find((entity) => entity.id === model.targetId) ?? null;
        const combat = `${target ? `目标 ${target.name} ${target.hp}/${target.hpMax}` : "无目标"}  ${model.spells.map((spell) => `${spell}${model.cooldowns[spell] ? `(${Math.ceil(model.cooldowns[spell]! / 1000)}s)` : ""}`).join(" ")}${model.casting ? `  施法 ${model.casting.spellId}` : ""}`;
        this.label(panel, model.dropping ? "连接中断，重连中…" : model.notice || combat, Math.round(line * 0.85), model.dropping ? WARN : DIM, 0, -line * 0.7);
        // 附近聊天最近两行（MK1-B5；完整聊天 UI 归内容插件 / FGUI HUD）
        if (model.chat.length > 0) this.label(panel, model.chat.slice(-2).map((entry) => `${entry.from}: ${entry.text}`).join("   "), Math.round(line * 0.75), DIM, 0, -line * 1.6);
    }

    unmount(): void {
        const layer = this.layer;
        this.layer = null;
        this.world = null;
        this.hud = null;
        if (!layer) return;
        layer.removeFromParent();
        layer.destroy();
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

    private button(parent: Node, text: string, width: number, height: number, x: number, y: number, onTap: () => void): Node {
        const node = this.node(`btn-${text}`, parent, width, height);
        node.setPosition(x, y, 0);
        this.plate(node, width, height, PANEL, 0, 0);
        this.label(node, text, Math.round(Math.min(width, height) * 0.4), TEXT, 0, 0);
        node.on(Node.EventType.TOUCH_END, onTap, this);
        return node;
    }
}
