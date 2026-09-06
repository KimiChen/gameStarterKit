/**
 * 入口分组页（`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源；形态与 SettingsView 逐行同源：
 * 遮罩 + 面板 + 标题 + 关闭 + 若干行）。
 *
 * 它是宿主 placement 里一个分组的二级页：设置面板只显示「竞技场」一行，点进来才见
 * 棋盘 / 占领赛 / 决斗 / 商店四条入口（docs/PLUGIN.md §6.1）。⛔ 本页 ⛔ 不认识
 * 任何具体插件——组名与成员全部来自注入的 Logic，换一组内容不用改这里一个字。
 *
 * 分工（铁律 9）：本文件只管节点与事件；成员序、可用性叠加与 launch 通道在
 * logic/page/EntryGroupLogic.ts。
 */
import { Color, Label, Node, UITransform } from "cc";
import { CocosView } from "./CocosView";
import type { EntryGroupLogic } from "../logic/page/EntryGroupLogic";
import { createSolidPlate } from "./uiPlate";

const SCRIM = new Color(6, 9, 18, 190);
const PANEL = new Color(24, 30, 44, 245);
const ROW = new Color(38, 46, 66, 255);
const ROW_OFF = new Color(30, 34, 44, 255);
const ACCENT = new Color(70, 130, 210, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);

export class EntryGroupView extends CocosView {
    /** 关闭按钮回调（opener 注入 handle.close()）。 */
    onClose: () => void | Promise<void> = () => {};

    private content: Node | null = null;
    private contentWidth = 0;
    private contentHeight = 0;
    private title = "";
    private logic: EntryGroupLogic | null = null;

    /** 节点在 onOpen 里搭：layerWidth/layerHeight 要挂载后才有值（同 SettingsView）。 */
    protected onOpen(): void {
        this.buildChrome();
        this.render();
    }

    /** 接线：标题取自分组 placement，行数据取自 Logic。 */
    setup(logic: EntryGroupLogic): void {
        this.logic = logic;
        this.title = logic.groupTitle();
        logic.onChanged = () => this.render();
        this.buildChrome();
        this.render();
    }

    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
    }

    // ── 节点搭建 ──────────────────────────────────────────────────────────

    /** 遮罩的空回调：只为参与命中测试（同 SettingsView），⛔ 不做任何事。 */
    private readonly swallowTouch = (): void => {};

    private buildChrome(): void {
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

        const titleY = panelHeight * 0.5 - panelHeight * 0.07;
        this.label(panel, this.title || "入口", Math.round(width * 0.048), TEXT,
            -panelWidth * 0.5 + panelWidth * 0.06, titleY, "left");
        this.button(panel, "关闭", panelWidth * 0.2, panelHeight * 0.09,
            panelWidth * 0.5 - panelWidth * 0.13, titleY,
            () => this.observeAsync(() => this.onClose(), "entry-group-close"));

        this.contentWidth = panelWidth;
        this.contentHeight = panelHeight * 0.78;
        const content = this.node("content", panel, this.contentWidth, this.contentHeight);
        content.setPosition(0, -panelHeight * 0.07, 0);
        this.content = content;
    }

    /** 每次数据变化整块重建行（同 SettingsView 的粗糙版取舍：⛔ 无差量更新）。 */
    private render(): void {
        const content = this.content;
        const logic = this.logic;
        if (!content) return;
        for (const child of [...content.children]) {
            child.removeFromParent();
            child.destroy();
        }
        if (!logic) return;

        const entries = logic.entries();
        const rows = 1 + Math.max(1, entries.length);
        const width = this.contentWidth;
        const height = this.contentHeight;
        const rowHeight = height / rows;
        const rowWidth = width * 0.88;
        let index = 0;
        const nextY = (): number => height * 0.5 - rowHeight * (index++ + 0.5);

        this.sectionLabel(content, "本组入口（宿主 placement 声明序）", rowWidth, nextY());
        if (entries.length === 0) {
            this.label(content, "（这一组当前没有入口）", Math.round(rowHeight * 0.32), DIM, 0, nextY());
        }
        for (const entry of entries) {
            const y = nextY();
            const row = this.row(content, rowWidth, rowHeight, y, entry.enabled ? ROW : ROW_OFF, "entry");
            this.label(row, `${entry.label}  ·  ${entry.pluginId}`, Math.round(rowHeight * 0.36),
                entry.enabled ? TEXT : DIM, -rowWidth * 0.5 + rowWidth * 0.05,
                entry.enabled ? 0 : rowHeight * 0.16, "left", rowWidth * 0.62);
            if (entry.enabled) {
                this.button(row, "进入", rowWidth * 0.22, rowHeight * 0.62, rowWidth * 0.5 - rowWidth * 0.15, 0,
                    () => this.observeAsync(() => logic.activate(entry.entryId), "entry-group-launch"), ACCENT);
            } else {
                this.label(row, entry.disabledReason ?? "不可用", Math.round(rowHeight * 0.24), WARN,
                    -rowWidth * 0.5 + rowWidth * 0.05, -rowHeight * 0.18, "left", rowWidth * 0.62);
                this.button(row, "重试", rowWidth * 0.22, rowHeight * 0.62, rowWidth * 0.5 - rowWidth * 0.15, 0,
                    () => this.observeAsync(() => logic.retry(entry.entryId), "entry-group-retry"), WARN);
            }
        }
    }

    // ── 小件（与 SettingsView 同形；⛔ 不共享私有实现，两页各自独立演化） ──

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
        return createSolidPlate(parent, width, height, color, x, y, name);
    }

    private row(parent: Node, width: number, height: number, y: number, color: Color, kind: string): Node {
        const node = this.node(`row-${kind}`, parent, width, height * 0.86);
        node.setPosition(0, y, 0);
        this.plate(node, width, height * 0.86, color, 0, 0);
        return node;
    }

    private sectionLabel(parent: Node, text: string, width: number, y: number): void {
        this.label(parent, text, Math.round(width * 0.042), ACCENT, -width * 0.5 + width * 0.02, y, "left");
    }

    /** align="left" 时 x 是文字**左边缘**（同 SettingsView 的实测结论）。 */
    private label(
        parent: Node, text: string, size: number, color: Color, x: number, y: number, align: "left" | "center" = "center",
        maxWidth?: number,
    ): Label {
        const naturalWidth = size * Math.max(1, text.length);
        const node = this.node("label", parent, maxWidth === undefined ? naturalWidth : Math.min(naturalWidth, maxWidth), size * 1.4);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size;
        label.color = color;
        if (maxWidth !== undefined) {
            label.enableWrapText = false;
            label.overflow = Label.Overflow.SHRINK;
        }
        if (align === "left") {
            const transform = node.getComponent(UITransform);
            if (transform) transform.anchorX = 0;
            label.horizontalAlign = Label.HorizontalAlign.LEFT;
        }
        return label;
    }

    private button(
        parent: Node, text: string, width: number, height: number, x: number, y: number,
        onTap: () => void, color: Color = ACCENT,
    ): Node {
        const node = this.node(`btn-${text}`, parent, width, height);
        node.setPosition(x, y, 0);
        this.plate(node, width, height, color, 0, 0);
        this.label(node, text, Math.round(height * 0.44), TEXT, 0, 0);
        node.on(Node.EventType.TOUCH_END, onTap, this);
        return node;
    }
}
