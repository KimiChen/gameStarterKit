/**
 * 设置面板（`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源）。
 *
 * ⚠ 手搓粗糙版：FGUI 编辑器当前不可用，这版用 Cocos 节点直接堆（先例
 * SnakeWorldView）。目标是**能跑能点**，视觉后续出图再换 FGUI 实现——所以这里没有
 * 九宫、没有字体、没有滚动容器，只有纯色底板 + Label。
 *
 * 布局取 750×1624 设计基线的**相对定位**：一切坐标由 `layerWidth/layerHeight` 按比例
 * 算出（CocosView 挂载时按层容器尺寸铺满），⛔ 不写死像素、不贴边（留安全区）。
 * 行数超过面板高度时按行数等分行高——⛔ 没有滚动，这是本版已知的粗糙点。
 *
 * 分工（铁律 9）：本文件只管节点与事件；两个区块的数据、排序、可用性叠加与
 * 失败回滚全在 logic/page/SettingsLogic.ts。
 */
import { Color, Label, Node, UITransform } from "cc";
import { CocosView } from "./CocosView";
import type { SettingsLogic } from "../logic/page/SettingsLogic";
import { createSolidPlate } from "./uiPlate";

const SCRIM = new Color(6, 9, 18, 190);
const PANEL = new Color(24, 30, 44, 245);
const ROW = new Color(38, 46, 66, 255);
const ROW_OFF = new Color(30, 34, 44, 255);
const ACCENT = new Color(70, 130, 210, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);

export class SettingsView extends CocosView {
    /** 关闭按钮回调（opener 注入 handle.close()）。 */
    onClose: () => void | Promise<void> = () => {};

    private content: Node | null = null;
    private contentWidth = 0;
    private contentHeight = 0;
    private logic: SettingsLogic | null = null;

    /**
     * ⚠ 节点在 **onOpen** 里搭，不在 onCreate：ViewMgr 的事务序是
     * runCreate → mount → runOpen，`layerWidth/layerHeight` 要挂载后才有值。
     */
    protected onOpen(): void {
        this.buildChrome();
        this.render();
    }

    /** 接线：渲染两个区块，并把 Logic 的重绘通知接到本视图。 */
    setup(logic: SettingsLogic): void {
        this.logic = logic;
        logic.onChanged = () => this.render();
        this.render();
    }

    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
    }

    // ── 节点搭建 ──────────────────────────────────────────────────────────

    /** 遮罩的空回调：只为参与命中测试（见 buildChrome 注释），⛔ 不做任何事。 */
    private readonly swallowTouch = (): void => {};

    private buildChrome(): void {
        for (const child of [...this.root.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const width = this.layerWidth;
        const height = this.layerHeight;
        // 全屏压暗层：注册一个空 TOUCH_END 让它参与命中测试，指针就停在本层，⛔ 不会
        // 穿到底下首屏的设置按钮上。⚠ Cocos 只把触摸派发给命中的**最上层有监听**节点，
        // 没有监听的节点根本不进候选——所以「画一块全屏色块」本身挡不住任何东西。
        const scrim = this.plate(this.root, width, height, SCRIM, 0, 0, "scrim");
        scrim.on(Node.EventType.TOUCH_END, this.swallowTouch, this);

        const panelWidth = width * 0.88;
        const panelHeight = height * 0.84;
        const panel = this.node("panel", this.root, panelWidth, panelHeight);
        this.plate(panel, panelWidth, panelHeight, PANEL, 0, 0);

        const titleY = panelHeight * 0.5 - panelHeight * 0.05;
        this.label(panel, "设置", Math.round(width * 0.048), TEXT, -panelWidth * 0.5 + panelWidth * 0.06, titleY, "left");
        this.button(panel, "关闭", panelWidth * 0.2, panelHeight * 0.07,
            panelWidth * 0.5 - panelWidth * 0.13, titleY,
            () => this.observeAsync(() => this.onClose(), "settings-close"));

        this.contentWidth = panelWidth;
        this.contentHeight = panelHeight * 0.84;
        const content = this.node("content", panel, this.contentWidth, this.contentHeight);
        content.setPosition(0, -panelHeight * 0.05, 0);
        this.content = content;
    }

    /** 每次数据变化整块重建行（粗糙版取舍：⛔ 无差量更新，面板行数很少）。 */
    private render(): void {
        const content = this.content;
        const logic = this.logic;
        if (!content || !logic) return;
        for (const child of [...content.children]) {
            child.removeFromParent();
            child.destroy();
        }

        const toggles = logic.audioToggles();
        const placeholders = logic.placeholders();
        const entries = logic.pluginEntries();
        const notice = logic.noticeText();
        // 行数 = 2 个区块标题 + 音频开关 + 占位项 + 插件入口（空列表也占一行提示）+ 提示行
        const rows = 2 + toggles.length + placeholders.length + Math.max(1, entries.length) + 1;
        const width = this.contentWidth;
        const height = this.contentHeight;
        const rowHeight = height / rows;
        const rowWidth = width * 0.88;
        let index = 0;
        const nextY = (): number => height * 0.5 - rowHeight * (index++ + 0.5);

        this.sectionLabel(content, "宿主固定项（⛔ 插件不可提供）", rowWidth, nextY());
        for (const toggle of toggles) {
            const y = nextY();
            const row = this.row(content, rowWidth, rowHeight, y, toggle.pending ? ROW_OFF : ROW, "audio");
            this.label(row, toggle.label, Math.round(rowHeight * 0.42), TEXT, -rowWidth * 0.5 + rowWidth * 0.05, 0, "left");
            const state = toggle.pending ? "保存中…" : (toggle.on ? "开" : "关");
            this.button(row, state, rowWidth * 0.24, rowHeight * 0.72, rowWidth * 0.5 - rowWidth * 0.16, 0,
                () => this.observeAsync(() => logic.toggleAudio(toggle.key), "settings-audio"),
                toggle.on ? ACCENT : ROW_OFF, toggle.pending);
        }
        for (const item of placeholders) {
            const y = nextY();
            // 置灰占位：⛔ 不注册任何点击回调——点不动就是「没实现」最诚实的表达。
            const row = this.row(content, rowWidth, rowHeight, y, ROW_OFF, "placeholder");
            this.label(row, item.label, Math.round(rowHeight * 0.4), DIM, -rowWidth * 0.5 + rowWidth * 0.05, rowHeight * 0.16, "left");
            this.label(row, item.reason, Math.round(rowHeight * 0.26), DIM, -rowWidth * 0.5 + rowWidth * 0.05, -rowHeight * 0.18, "left", rowWidth * 0.9);
        }

        this.sectionLabel(content, "插件入口（pluginId 字母序）", rowWidth, nextY());
        if (entries.length === 0) {
            this.label(content, "（当前没有登记任何插件入口）", Math.round(rowHeight * 0.32), DIM, 0, nextY());
        }
        for (const entry of entries) {
            const y = nextY();
            const row = this.row(content, rowWidth, rowHeight, y, entry.enabled ? ROW : ROW_OFF, "entry");
            this.label(row, `${entry.label}  ·  ${entry.pluginId}`, Math.round(rowHeight * 0.4),
                entry.enabled ? TEXT : DIM, -rowWidth * 0.5 + rowWidth * 0.05, entry.enabled ? 0 : rowHeight * 0.16, "left", rowWidth * 0.62);
            if (entry.enabled) {
                this.button(row, "进入", rowWidth * 0.22, rowHeight * 0.72, rowWidth * 0.5 - rowWidth * 0.15, 0,
                    () => this.observeAsync(() => logic.activate(entry.entryId), "settings-launch"), ACCENT);
            } else {
                this.label(row, entry.disabledReason ?? "不可用", Math.round(rowHeight * 0.26), WARN,
                    -rowWidth * 0.5 + rowWidth * 0.05, -rowHeight * 0.18, "left", rowWidth * 0.62);
                // 不可用条目置灰但保留显式「重试」——走的仍是同一条 launch 通道。
                this.button(row, "重试", rowWidth * 0.22, rowHeight * 0.72, rowWidth * 0.5 - rowWidth * 0.15, 0,
                    () => this.observeAsync(() => logic.retry(entry.entryId), "settings-retry"), WARN);
            }
        }

        this.label(content, notice, Math.round(rowHeight * 0.32), WARN, 0, nextY());
    }

    // ── 小件 ─────────────────────────────────────────────────────────────

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
        // ⛔ 这里曾经是「每块底板一个 Graphics」，实测每个固定占约 2.25MB 显存缓冲
        // 且各自一个 draw call；改走共用的白图 Sprite（可合批）。判据见 view/uiPlate.ts。
        return createSolidPlate(parent, width, height, color, x, y, name);
    }

    private row(parent: Node, width: number, height: number, y: number, color: Color, kind: string): Node {
        const node = this.node(`row-${kind}`, parent, width, height * 0.86);
        node.setPosition(0, y, 0);
        this.plate(node, width, height * 0.86, color, 0, 0);
        return node;
    }

    private sectionLabel(parent: Node, text: string, width: number, y: number): void {
        this.label(parent, text, Math.round(width * 0.045), ACCENT, -width * 0.5 + width * 0.02, y, "left");
    }

    /**
     * align="left" 时 x 是文字**左边缘**（节点锚点 (0,0.5) + 左对齐）；缺省 "center" 时 x 是中心。
     * Creator 预览实测：此前一律中心锚，把左边缘坐标当中心用，行标签/提示语被面板左缘切掉一半。
     */
    private label(
        parent: Node, text: string, size: number, color: Color, x: number, y: number, align: "left" | "center" = "center",
        maxWidth?: number,
    ): Label {
        // maxWidth 给定时节点宽度封顶并按 SHRINK 单行缩排（Creator 预览实测：长说明文字曾溢出面板右缘）。
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
