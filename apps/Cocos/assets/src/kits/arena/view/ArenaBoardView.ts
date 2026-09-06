/**
 * 竞技场棋盘页（`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源；形态同 RedeemView 的手搓粗糙版：纯色底板 + Label 按钮）。
 * 4×4 格按钮 + 奖杯 / 排名 / 一行提示；布局按 layerWidth/layerHeight 相对定位。
 *
 * 分工（铁律 9）：本文件只管节点与事件；棋盘模型、占领闸与错误翻译在 ../logic/ArenaBoardLogic.ts。
 * 宿主接线自 ../logic/arenaRuntime.ts 读取（kit module install 时注入）。
 */
import { Color, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { ARENA_GRID_SIZE, type ArenaTileView } from "../api/board/index";
import { ArenaBoardLogic } from "../logic/ArenaBoardLogic";
import { getArenaRuntime } from "../logic/arenaRuntime";

const SCRIM = new Color(6, 9, 18, 190);
const PANEL = new Color(24, 30, 44, 245);
const ROW_OFF = new Color(30, 34, 44, 255);
const EMPTY = new Color(48, 56, 78, 255);
const SELF = new Color(70, 130, 210, 255);
const ENEMY = new Color(190, 80, 70, 255);
const ACCENT = new Color(70, 130, 210, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);
const OK = new Color(120, 210, 140, 255);

export class ArenaBoardView extends CocosView {
    private logic: ArenaBoardLogic | null = null;
    private body: Node | null = null;
    private bodyWidth = 0;
    private bodyHeight = 0;

    /** 节点在 onOpen 里搭（layerWidth/layerHeight 挂载后才有值，同 RedeemView 注释）。 */
    protected onOpen(): void {
        const logic = new ArenaBoardLogic(getArenaRuntime());
        logic.onChanged = () => this.render();
        this.logic = logic;
        this.buildChrome(logic);
        this.render();
        this.observeAsync(() => logic.refresh(), "arena-refresh");
    }

    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
        this.body = null;
    }

    private readonly swallowTouch = (): void => {};

    private buildChrome(logic: ArenaBoardLogic): void {
        for (const child of [...this.root.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const width = this.layerWidth;
        const height = this.layerHeight;
        const scrim = this.plate(this.root, width, height, SCRIM, 0, 0, "scrim");
        scrim.on(Node.EventType.TOUCH_END, this.swallowTouch, this);

        const panelWidth = width * 0.92;
        const panelHeight = height * 0.78;
        const panel = this.node("panel", this.root, panelWidth, panelHeight);
        this.plate(panel, panelWidth, panelHeight, PANEL, 0, 0);

        const titleY = panelHeight * 0.5 - panelHeight * 0.06;
        this.label(panel, "竞技场", Math.round(width * 0.048), TEXT, -panelWidth * 0.5 + panelWidth * 0.06, titleY, "left");
        this.button(panel, "关闭", panelWidth * 0.18, panelHeight * 0.07,
            panelWidth * 0.5 - panelWidth * 0.12, titleY,
            () => this.observeAsync(async () => logic.close(), "arena-close"));
        this.button(panel, "刷新", panelWidth * 0.18, panelHeight * 0.07,
            panelWidth * 0.5 - panelWidth * 0.32, titleY,
            () => this.observeAsync(() => logic.refresh(), "arena-refresh"));

        this.bodyWidth = panelWidth * 0.9;
        this.bodyHeight = panelHeight * 0.82;
        const body = this.node("body", panel, this.bodyWidth, this.bodyHeight);
        body.setPosition(0, -panelHeight * 0.06, 0);
        this.body = body;
    }

    /** 主体整块重建：奖杯行 + 4×4 格按钮 + 排名 + 一行提示（每次模型变化才重建）。 */
    private render(): void {
        const body = this.body;
        const logic = this.logic;
        if (!body || !logic) return;
        for (const child of [...body.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const width = this.bodyWidth;
        const height = this.bodyHeight;
        const line = Math.round(width * 0.045);
        const top = height * 0.5;
        this.label(body, `奖杯 ${logic.myTrophies()}${logic.isBusy() ? " · 处理中…" : ""}`, line, TEXT, -width * 0.5, top - line, "left");

        const cell = Math.min(width / ARENA_GRID_SIZE, height * 0.55 / ARENA_GRID_SIZE);
        const gridTop = top - line * 2.6;
        const gridLeft = -cell * ARENA_GRID_SIZE / 2;
        for (const tile of logic.board()) {
            const x = gridLeft + cell * (tile.col + 0.5);
            const y = gridTop - cell * (tile.row + 0.5);
            this.tileButton(body, tile, cell * 0.92, x, y, () => this.observeAsync(() => logic.capture(tile.tile), "arena-capture"), logic.canCapture(tile.tile));
        }

        let y = gridTop - cell * ARENA_GRID_SIZE - line;
        for (const row of logic.ranking()) {
            this.label(body, row, Math.round(line * 0.85), DIM, -width * 0.5, y, "left");
            y -= line * 1.3;
        }
        const notice = logic.currentNotice();
        const color = notice.kind === "success" ? OK : (notice.kind === "error" ? WARN : DIM);
        this.label(body, notice.text, Math.round(line * 0.85), color, -width * 0.5, -height * 0.5 + line, "left");
    }

    private tileButton(parent: Node, tile: ArenaTileView, size: number, x: number, y: number, onTap: () => void, enabled: boolean): Node {
        const node = this.node(`tile-${tile.label}`, parent, size, size);
        node.setPosition(x, y, 0);
        const color = tile.ownership === "self" ? SELF : (tile.ownership === "enemy" ? ENEMY : EMPTY);
        this.plate(node, size, size, enabled ? color : ROW_OFF, 0, 0);
        this.label(node, tile.label, Math.round(size * 0.26), enabled ? TEXT : DIM, 0, size * 0.18);
        this.label(node, tile.ownership === "empty" ? "无主" : String(tile.power), Math.round(size * 0.22), enabled ? TEXT : DIM, 0, -size * 0.2);
        if (enabled) node.on(Node.EventType.TOUCH_END, onTap, this);
        return node;
    }

    // ── 小件（与 RedeemView 同形；粗糙版不抽公共基类，等 FGUI 出图后整体替换） ──

    private node(name: string, parent: Node, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        const transform = node.addComponent(UITransform);
        transform.width = width;
        transform.height = height;
        parent.addChild(node);
        return node;
    }

    private plate(
        parent: Node, width: number, height: number, color: Color, x: number, y: number, name = "plate",
    ): Node {
        // 共用白图 Sprite（可合批），⛔ 不用每块一个 Graphics（判据见 view/uiPlate.ts）。
        return createSolidPlate(parent, width, height, color, x, y, name);
    }

    /** align="left" 时 x 是文字左边缘（锚点 (0,0.5) + 左对齐）；缺省 "center" 时 x 是中心。 */
    private label(
        parent: Node, text: string, size: number, color: Color, x: number, y: number, align: "left" | "center" = "center",
    ): Label {
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

    private button(
        parent: Node, text: string, width: number, height: number, x: number, y: number,
        onTap: () => void, color: Color = ACCENT, grayed = false,
    ): Node {
        const node = this.node(`btn-${text}`, parent, width, height);
        node.setPosition(x, y, 0);
        this.plate(node, width, height, grayed ? ROW_OFF : color, 0, 0);
        this.label(node, text, Math.round(height * 0.44), grayed ? DIM : TEXT, 0, 0);
        if (!grayed) node.on(Node.EventType.TOUCH_END, onTap, this);
        return node;
    }
}
