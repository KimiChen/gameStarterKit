/**
 * 选角页（`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源；形态同 ArenaBoardView 的手搓粗糙版：纯色底板 + Label 按钮）。
 * 槽位列表（角色 → 进入 / 空槽 → 建角 / 孤儿 → 提示）+ 一行提示；布局按 layerWidth/layerHeight 相对定位。
 * 分工（铁律 9）：本文件只管节点与事件；模型与闸在 ../logic/MmoCharacterSelectLogic.ts；宿主接线自 ../logic/mmoRuntime.ts 读取。
 */
import { Color, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { MAX_CHARACTER_SLOTS } from "../api/characters/index";
import { MmoCharacterSelectLogic } from "../logic/MmoCharacterSelectLogic";
import { getMmoRuntime } from "../logic/mmoRuntime";

const SCRIM = new Color(6, 9, 18, 190);
const PANEL = new Color(24, 30, 44, 245);
const ROW = new Color(36, 44, 62, 255);
const ROW_OFF = new Color(30, 34, 44, 255);
const ACCENT = new Color(70, 130, 210, 255);
const CREATE = new Color(90, 160, 110, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);
const OK = new Color(120, 210, 140, 255);

export class MmoCharacterSelectView extends CocosView {
    private logic: MmoCharacterSelectLogic | null = null;
    private body: Node | null = null;
    private bodyWidth = 0;
    private bodyHeight = 0;

    protected onOpen(): void {
        const logic = new MmoCharacterSelectLogic(getMmoRuntime());
        logic.onChanged = () => this.render();
        this.logic = logic;
        this.buildChrome(logic);
        this.render();
        this.observeAsync(() => logic.refresh(), "mmo-refresh");
    }

    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
        this.body = null;
    }

    private readonly swallowTouch = (): void => {};

    private buildChrome(logic: MmoCharacterSelectLogic): void {
        for (const child of [...this.root.children]) { child.removeFromParent(); child.destroy(); }
        const width = this.layerWidth;
        const height = this.layerHeight;
        const scrim = this.plate(this.root, width, height, SCRIM, 0, 0, "scrim");
        scrim.on(Node.EventType.TOUCH_END, this.swallowTouch, this);
        const panelWidth = width * 0.92;
        const panelHeight = height * 0.7;
        const panel = this.node("panel", this.root, panelWidth, panelHeight);
        this.plate(panel, panelWidth, panelHeight, PANEL, 0, 0);
        const titleY = panelHeight * 0.5 - panelHeight * 0.07;
        this.label(panel, "选择角色", Math.round(width * 0.048), TEXT, -panelWidth * 0.5 + panelWidth * 0.06, titleY, "left");
        this.button(panel, "关闭", panelWidth * 0.18, panelHeight * 0.08, panelWidth * 0.5 - panelWidth * 0.12, titleY, () => this.observeAsync(async () => logic.close(), "mmo-close"));
        this.button(panel, "刷新", panelWidth * 0.18, panelHeight * 0.08, panelWidth * 0.5 - panelWidth * 0.32, titleY, () => this.observeAsync(() => logic.refresh(), "mmo-refresh"));
        this.bodyWidth = panelWidth * 0.9;
        this.bodyHeight = panelHeight * 0.78;
        const body = this.node("body", panel, this.bodyWidth, this.bodyHeight);
        body.setPosition(0, -panelHeight * 0.07, 0);
        this.body = body;
    }

    /** 主体整块重建：槽位行 + 一行提示（每次模型变化才重建）。 */
    private render(): void {
        const body = this.body;
        const logic = this.logic;
        if (!body || !logic) return;
        for (const child of [...body.children]) { child.removeFromParent(); child.destroy(); }
        const width = this.bodyWidth;
        const height = this.bodyHeight;
        const line = Math.round(width * 0.042);
        const rowHeight = Math.min(height * 0.78 / MAX_CHARACTER_SLOTS, line * 3.2);
        let y = height * 0.5 - rowHeight * 0.5;
        for (const slot of logic.slots()) {
            const row = this.node(`slot-${slot.slot}`, body, width, rowHeight * 0.92);
            row.setPosition(0, y, 0);
            this.plate(row, width, rowHeight * 0.92, slot.kind === "empty" ? ROW_OFF : ROW, 0, 0);
            if (slot.kind === "character") {
                const enabled = logic.canEnter(slot.character.characterId);
                this.label(row, logic.describe(slot.character), Math.round(line * 0.8), TEXT, -width * 0.5 + line * 0.6, 0, "left");
                this.button(row, "进入", width * 0.2, rowHeight * 0.6, width * 0.5 - width * 0.13, 0,
                    () => this.observeAsync(() => logic.enter(slot.character.characterId), "mmo-enter"), ACCENT, !enabled);
            } else if (slot.kind === "orphan") {
                this.label(row, `槽 ${slot.slot + 1}：残留 persona（${slot.personaId.slice(0, 8)}…）`, Math.round(line * 0.8), DIM, -width * 0.5 + line * 0.6, 0, "left");
            } else {
                this.label(row, `槽 ${slot.slot + 1}：空`, Math.round(line * 0.8), DIM, -width * 0.5 + line * 0.6, 0, "left");
                this.button(row, "建角", width * 0.2, rowHeight * 0.6, width * 0.5 - width * 0.13, 0,
                    () => this.observeAsync(() => logic.create(slot.slot), "mmo-create"), CREATE, !logic.canCreate(slot.slot));
            }
            y -= rowHeight;
        }
        const notice = logic.currentNotice();
        const color = notice.kind === "success" ? OK : (notice.kind === "error" ? WARN : DIM);
        this.label(body, `${notice.text}${logic.isBusy() ? " · 处理中…" : ""}`, Math.round(line * 0.85), color, -width * 0.5, -height * 0.5 + line, "left");
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

    private label(parent: Node, text: string, size: number, color: Color, x: number, y: number, align: "left" | "center" = "center"): Label {
        const node = this.node("label", parent, size * Math.max(1, text.length), size * 1.4);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size;
        label.color = color;
        if (align === "left") {
            const transform = node.getComponent(UITransform);
            if (transform) transform.anchorX = 0;
            label.horizontalAlign = Label.HorizontalAlign.LEFT;
        }
        return label;
    }

    private button(parent: Node, text: string, width: number, height: number, x: number, y: number, onTap: () => void, color: Color = ACCENT, grayed = false): Node {
        const node = this.node(`btn-${text}`, parent, width, height);
        node.setPosition(x, y, 0);
        this.plate(node, width, height, grayed ? ROW_OFF : color, 0, 0);
        this.label(node, text, Math.round(height * 0.44), grayed ? DIM : TEXT, 0, 0);
        if (!grayed) node.on(Node.EventType.TOUCH_END, onTap, this);
        return node;
    }
}
