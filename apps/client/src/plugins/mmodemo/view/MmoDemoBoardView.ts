/**
 * 头狼战报面板（MG1-B2 可选域页面；`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源；形态同 ArenaShopView 的手搓粗糙版：纯色底板 + Label）。
 * 列出 demoVale 各分线的头狼击杀（最多显示 8 行，其余折成一行）+ 合计 + 一行提示。布局按 layerWidth/layerHeight 相对定位。
 * 分工（铁律 9）：本文件只管节点与事件；加载 / 排序 / 文案在 ../logic/MmoDemoBoardLogic.ts。宿主接线自 ../logic/mmoDemoRuntime.ts 读取（plugin module install 时注入）。
 */
import { Color, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { MmoDemoBoardLogic } from "../logic/MmoDemoBoardLogic";
import { getMmoDemoRuntime } from "../logic/mmoDemoRuntime";

const SCRIM = new Color(6, 9, 18, 190);
const PANEL = new Color(24, 30, 44, 245);
const ROW = new Color(38, 46, 66, 255);
const ACCENT = new Color(70, 130, 210, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);
const OK = new Color(120, 210, 140, 255);
const KILL = new Color(235, 120, 90, 255);
/** 主体最多画几行（其余折成「…还有 N 条分线」） */
const MAX_ROWS = 8;

export class MmoDemoBoardView extends CocosView {
    private logic: MmoDemoBoardLogic | null = null;
    private body: Node | null = null;
    private bodyWidth = 0;
    private bodyHeight = 0;

    /** 节点在 onOpen 里搭（layerWidth/layerHeight 挂载后才有值，同 ArenaShopView 注释）。 */
    protected onOpen(): void {
        const logic = new MmoDemoBoardLogic(getMmoDemoRuntime());
        logic.onChanged = () => this.render();
        this.logic = logic;
        this.buildChrome(logic);
        this.render();
        this.observeAsync(() => logic.refresh(), "mmodemo-refresh");
    }

    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
        this.body = null;
    }

    private readonly swallowTouch = (): void => {};

    private buildChrome(logic: MmoDemoBoardLogic): void {
        for (const child of [...this.root.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const width = this.layerWidth;
        const height = this.layerHeight;
        const scrim = this.plate(this.root, width, height, SCRIM, 0, 0, "scrim");
        scrim.on(Node.EventType.TOUCH_END, this.swallowTouch, this);

        const panelWidth = width * 0.88;
        const panelHeight = height * 0.62;
        const panel = this.node("panel", this.root, panelWidth, panelHeight);
        this.plate(panel, panelWidth, panelHeight, PANEL, 0, 0);

        const titleY = panelHeight * 0.5 - panelHeight * 0.08;
        this.label(panel, `头狼战报 · ${logic.mapId()}`, Math.round(width * 0.048), TEXT, -panelWidth * 0.5 + panelWidth * 0.06, titleY, "left");
        this.button(panel, "关闭", panelWidth * 0.2, panelHeight * 0.09, panelWidth * 0.5 - panelWidth * 0.13, titleY,
            () => this.observeAsync(async () => logic.close(), "mmodemo-close"));
        this.button(panel, "刷新", panelWidth * 0.2, panelHeight * 0.09, panelWidth * 0.5 - panelWidth * 0.36, titleY,
            () => this.observeAsync(() => logic.refresh(), "mmodemo-refresh"));

        this.bodyWidth = panelWidth * 0.88;
        this.bodyHeight = panelHeight * 0.76;
        const body = this.node("body", panel, this.bodyWidth, this.bodyHeight);
        body.setPosition(0, -panelHeight * 0.08, 0);
        this.body = body;
    }

    /** 主体整块重建：分线行（击杀降序）+ 合计 + 一行提示。 */
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
        const rowHeight = line * 2;
        let y = height * 0.5 - rowHeight * 0.5;
        const rows = logic.rows();
        if (rows.length === 0) {
            this.label(body, logic.isLoaded() ? `${logic.mapId()} 还没有开过分线` : "读取中…", line, DIM, -width * 0.5, y, "left");
        }
        for (const row of rows.slice(0, MAX_ROWS)) {
            this.plate(body, width, rowHeight * 0.9, ROW, 0, y, `line-${row.instanceId}`);
            this.label(body, row.label, line, TEXT, -width * 0.5 + line * 0.5, y + line * 0.45, "left");
            this.label(body, `检查点 rev ${row.rev} · ${row.uptime}`, Math.round(line * 0.75), DIM, -width * 0.5 + line * 0.5, y - line * 0.5, "left");
            this.label(body, `击杀 ${row.bossKills}`, line, KILL, width * 0.5 - line * 3.6, y, "left");
            y -= rowHeight;
        }
        if (rows.length > MAX_ROWS) {
            this.label(body, `…还有 ${rows.length - MAX_ROWS} 条分线`, Math.round(line * 0.8), DIM, -width * 0.5, y, "left");
            y -= rowHeight;
        }
        this.label(body, `合计击杀 ${logic.totalKills()}`, line, TEXT, -width * 0.5, -height * 0.5 + line * 2.4, "left");
        const notice = logic.currentNotice();
        const color = notice.kind === "success" ? OK : (notice.kind === "error" ? WARN : DIM);
        this.label(body, logic.isBusy() ? "读取中…" : notice.text, Math.round(line * 0.85), color, -width * 0.5, -height * 0.5 + line, "left");
    }

    // ── 小件（与 ArenaShopView 同形；粗糙版不抽公共基类，等 FGUI 出图后整体替换） ──

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

    /** align="left" 时 x 是文字左边缘（锚点 (0,0.5) + 左对齐）；缺省 "center" 时 x 是中心。 */
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

    private button(parent: Node, text: string, width: number, height: number, x: number, y: number, onTap: () => void, color: Color = ACCENT): Node {
        const node = this.node(`btn-${text}`, parent, width, height);
        node.setPosition(x, y, 0);
        this.plate(node, width, height, color, 0, 0);
        this.label(node, text, Math.round(height * 0.44), TEXT, 0, 0);
        node.on(Node.EventType.TOUCH_END, onTap, this);
        return node;
    }
}
