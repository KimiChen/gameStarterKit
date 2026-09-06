/**
 * 衣柜面板（`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源——仓内没有衣柜 FGUI 包，首版取手搓形态，
 * 同 RedeemView / SettingsView）。布局按 layerWidth/layerHeight 相对定位。
 *
 * 分工（铁律 9）：本文件只管节点与事件；筛选、提交闸、错误翻译与红点在 ../logic/WardrobeLogic.ts。
 * 宿主接线自 ../logic/snakeCosmeticRuntime.ts 读取（plugin module install 时注入）。
 */
import { Color, Label, Node, Rect, Sprite, SpriteFrame, Texture2D, UITransform, resources } from "cc";
import { CocosView } from "../../../view/CocosView";
import { getClientSnakeSkinPresentation } from "../../../logic/rooms/snake/SnakePresentationCatalog";
import { WardrobeLogic, type WardrobeFilter, type WardrobeRow } from "../logic/WardrobeLogic";
import { getSnakeCosmeticRuntime } from "../logic/snakeCosmeticRuntime";
import { createSolidPlate } from "../../../view/uiPlate";

const SCRIM = new Color(6, 9, 18, 190);
const PANEL = new Color(24, 30, 44, 245);
const ROW = new Color(32, 38, 54, 255);
const ROW_OFF = new Color(30, 34, 44, 255);
const ACCENT = new Color(70, 130, 210, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);
const OK = new Color(120, 210, 140, 255);
const NEW_DOT = new Color(226, 88, 88, 255);

/** 原作 6 档稀有度配色（0..5）；第 4/5 档原作同色，这里如实保留。 */
const RARITY_COLORS: readonly Color[] = [
    new Color(50, 139, 59, 255),
    new Color(0, 134, 232, 255),
    new Color(82, 11, 229, 255),
    new Color(205, 86, 0, 255),
    new Color(215, 93, 1, 255),
    new Color(215, 93, 1, 255),
];

const FILTERS: readonly { readonly id: WardrobeFilter; readonly label: string }[] = [
    { id: "all", label: "全部" },
    { id: "owned", label: "已拥有" },
    { id: "unowned", label: "未拥有" },
    { id: "craftable", label: "可合成" },
];

const VISIBLE_ROWS = 6;

/**
 * 预览图裁剪：S1 生成的 420×160 技术图顶部有 28px 的 `SKIN <id> NORMAL` 标题条，
 * 衣柜里要裁掉它只留下方的 tail+body+head 合成条。
 * ⚠ 该图底色是**不透明深蓝**（烘死在 PNG 里），贴在行底板上会有一块矩形色差——
 * 要透明底得改 `tools/snake-s1-assets/core.mjs` 重出 16 张 PNG，那会动 S1 证据字节，
 * 不在本步范围。⛔ 别把这块色差当渲染 bug 修。
 */
const PREVIEW_SOURCE_WIDTH = 420;
const PREVIEW_BANNER_HEIGHT = 28;
const PREVIEW_BODY_HEIGHT = 160 - PREVIEW_BANNER_HEIGHT;

export class WardrobeView extends CocosView {
    private logic: WardrobeLogic | null = null;
    private body: Node | null = null;
    /** skinId → 预览帧；`null` = 已尝试过且失败或在途，⛔ 不重复 load。 */
    private readonly previewFrames = new Map<number, SpriteFrame | null>();
    private bodyWidth = 0;
    private bodyHeight = 0;
    private scrollTop = 0;

    protected onOpen(): void {
        const storage = typeof localStorage === "undefined" ? null : localStorage;
        const logic = new WardrobeLogic(getSnakeCosmeticRuntime(), storage);
        logic.onChanged = () => this.render();
        this.logic = logic;
        this.buildChrome(logic);
        this.render();
        // 打开即拉快照——这同时是服务端 profile 的预热入口。
        this.observeAsync(() => logic.load(), "wardrobe-load");
    }

    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
        this.body = null;
        this.previewFrames.clear();
    }

    /**
     * 懒加载预览帧。首次返回 null，load 完成后触发一次重绘。
     * ⛔ 失败不回退到默认皮肤——`resolveClientSnakeSkinPresentation` 的「退皮肤 1」语义在战斗里
     * 正确，但在衣柜里会把皮肤 1 的形象画在别的皮肤行上，是**错误信息**。这里的 fallback 是「不画图」。
     */
    private ensurePreview(skinId: number): SpriteFrame | null {
        const cached = this.previewFrames.get(skinId);
        if (cached !== undefined) return cached;
        const asset = getClientSnakeSkinPresentation(skinId)?.previewAsset;
        if (!asset) {
            this.previewFrames.set(skinId, null);
            return null;
        }
        this.previewFrames.set(skinId, null); // 占位防重入
        resources.load(`${asset}/texture`, Texture2D, (error, texture) => {
            // 关页后落地的回调直接丢弃（onCloseLifecycle 已把 logic 置 null，这是仓内既有的陈旧信号）。
            if (!this.logic) return;
            if (error || !texture) {
                console.warn(`[wardrobe] preview texture missing ${asset}`, error);
                return;
            }
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.rect = new Rect(0, PREVIEW_BANNER_HEIGHT, PREVIEW_SOURCE_WIDTH, PREVIEW_BODY_HEIGHT);
            this.previewFrames.set(skinId, frame);
            this.render();
        });
        return null;
    }

    private readonly swallowTouch = (): void => {};

    private buildChrome(logic: WardrobeLogic): void {
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
        this.label(panel, "衣柜", Math.round(width * 0.048), TEXT,
            -panelWidth * 0.5 + panelWidth * 0.05, titleY, "left");
        this.button(panel, "关闭", panelWidth * 0.18, panelHeight * 0.07,
            panelWidth * 0.5 - panelWidth * 0.12, titleY,
            () => this.observeAsync(async () => logic.close(), "wardrobe-close"));

        // 筛选栏
        const filterY = titleY - panelHeight * 0.09;
        const filterWidth = panelWidth * 0.21;
        FILTERS.forEach((filter, index) => {
            const x = -panelWidth * 0.5 + panelWidth * 0.055 + index * (filterWidth + panelWidth * 0.015) + filterWidth * 0.5;
            this.button(panel, filter.label, filterWidth, panelHeight * 0.065, x, filterY,
                () => this.observeAsync(async () => logic.setFilter(filter.id), "wardrobe-filter"),
                logic.currentFilter() === filter.id ? ACCENT : ROW_OFF);
        });

        this.bodyWidth = panelWidth * 0.9;
        this.bodyHeight = panelHeight * 0.68;
        const body = this.node("body", panel, this.bodyWidth, this.bodyHeight);
        body.setPosition(0, -panelHeight * 0.09, 0);
        this.body = body;
    }

    /** 整块重建：筛选栏状态在 chrome 上，故一并重建 chrome。 */
    private render(): void {
        const logic = this.logic;
        if (!logic) return;
        // 筛选高亮属于 chrome，切筛选时也要重画。
        if (!this.body) return;
        this.buildChrome(logic);
        const body = this.body;
        if (!body) return;
        for (const child of [...body.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const width = this.bodyWidth;
        const height = this.bodyHeight;
        const notice = logic.currentNotice();
        const noticeColor = notice.kind === "success" ? OK : (notice.kind === "error" ? WARN : DIM);
        this.label(body, notice.text, Math.round(height * 0.045), noticeColor,
            -width * 0.5, height * 0.5 - height * 0.03, "left");

        if (!logic.isLoaded()) {
            this.label(body, logic.isBusy() ? "加载中…" : "未加载", Math.round(height * 0.05), DIM, 0, 0);
            return;
        }

        const rows = logic.rows();
        if (rows.length === 0) {
            this.label(body, "该筛选下没有皮肤", Math.round(height * 0.05), DIM, 0, 0);
            return;
        }
        const rowHeight = height * 0.13;
        const start = Math.min(this.scrollTop, Math.max(0, rows.length - VISIBLE_ROWS));
        const shown = rows.slice(start, start + VISIBLE_ROWS);
        shown.forEach((row, index) => {
            const y = height * 0.5 - height * 0.09 - rowHeight * 0.5 - index * (rowHeight * 1.06);
            this.rowNode(body, logic, row, width, rowHeight, y);
        });
        if (rows.length > VISIBLE_ROWS) {
            this.label(body, `${start + 1}-${start + shown.length} / ${rows.length}`,
                Math.round(height * 0.04), DIM, width * 0.5, -height * 0.5 + height * 0.02, "center");
        }
    }

    private rowNode(
        parent: Node, logic: WardrobeLogic, row: WardrobeRow, width: number, height: number, y: number,
    ): void {
        const node = this.node(`skin-${row.skinId}`, parent, width, height);
        node.setPosition(0, y, 0);
        this.plate(node, width, height, row.equipped ? ACCENT : ROW, 0, 0);

        // 稀有度色条
        this.plate(node, width * 0.012, height * 0.7, RARITY_COLORS[row.rarity] ?? DIM,
            -width * 0.5 + width * 0.014, 0, "rarity");

        const previewWidth = width * 0.24;
        const previewHeight = previewWidth * PREVIEW_BODY_HEIGHT / PREVIEW_SOURCE_WIDTH;
        const frame = this.ensurePreview(row.skinId);
        if (frame) {
            const preview = this.node(`preview-${row.skinId}`, node, previewWidth, previewHeight);
            preview.setPosition(-width * 0.5 + width * 0.035 + previewWidth * 0.5, 0, 0);
            const sprite = preview.addComponent(Sprite);
            // ⚠ 顺序即契约（S5-05 F7）：sizeMode 必须在赋 spriteFrame **之前**设成 CUSTOM。
            // 赋值那一刻若仍是默认的 TRIMMED，引擎会在 _applySpriteFrame → _applySpriteSize 里
            // 用 frame.rect 覆写 UITransform 尺寸（420×132）；而事后再设 CUSTOM ⛔ 不会回滚——
            // 它只抑制后续的自动改尺寸。原来的写法正是这个顺序，于是预览条半宽从 74.5 涨到 210，
            // 向左溢出面板 79px、并压住「皮肤 N」与稀有度行约 120px。
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            // ⚠ 再钉一次尺寸：不依赖上面那条顺序在未来引擎版本里继续成立。
            const transform = preview.getComponent(UITransform);
            if (transform) {
                transform.width = previewWidth;
                transform.height = previewHeight;
            }
        }
        // 给预览让位；预览缺失时文字仍从这里起排，⛔ 不做两套布局。
        const nameX = -width * 0.5 + width * 0.30;
        const size = Math.round(height * 0.28);
        this.label(node, row.displayName, size, row.owned ? TEXT : DIM, nameX, height * 0.16, "left");
        const detail = row.fragments
            ? `${row.rarityName} · ${row.acquisitionText} ${row.fragments.balance}/${row.fragments.threshold}`
            : `${row.rarityName} · ${row.acquisitionText}`;
        this.label(node, detail, Math.round(height * 0.2), DIM, nameX, -height * 0.18, "left");

        if (row.isNew) {
            this.plate(node, width * 0.02, width * 0.02, NEW_DOT, nameX + width * 0.32, height * 0.2, "new-dot");
        }

        const buttonWidth = width * 0.2;
        const buttonX = width * 0.5 - buttonWidth * 0.6;
        if (row.equipped) {
            this.label(node, "已装备", Math.round(height * 0.24), TEXT, buttonX, 0);
        } else if (row.canEquip) {
            this.button(node, "装备", buttonWidth, height * 0.5, buttonX, 0,
                () => this.observeAsync(() => logic.equip(row.skinId), "wardrobe-equip"));
        } else if (row.canCraft) {
            this.button(node, "合成", buttonWidth, height * 0.5, buttonX, 0,
                () => this.observeAsync(() => logic.craft(row.skinId), "wardrobe-craft"), OK);
        } else {
            this.button(node, row.owned ? "装备" : "未拥有", buttonWidth, height * 0.5, buttonX, 0,
                () => undefined, ROW_OFF, true);
        }
    }

    // ── 小件（与 RedeemView / SettingsView 同形；粗糙版不抽公共基类，等 FGUI 出图后整体替换） ──

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

    /** align="left" 时 x 是文字左边缘（锚点 (0,0.5) + 左对齐）；缺省 "center" 时 x 是中心。 */
    private label(
        parent: Node, text: string, size: number, color: Color, x: number, y: number,
        align: "left" | "center" = "center",
    ): Label {
        const node = this.node("label", parent, size * Math.max(1, text.length), size * 1.4);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
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
