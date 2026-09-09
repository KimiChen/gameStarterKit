/**
 * 纯 Cocos 代码设置页：系统卡片在上、玩法入口在下，通用设置收纳音频偏好。
 * 圆角、图标与渐变均由 settingsArt 在运行时生成；无需 FGUI 或图片资源。
 * 行高只随面板宽度缩放，超出视口走原生 ScrollView，不因入口增加而压缩文字。
 */
import { Color, Label, Mask, Node, ScrollView, UITransform, Vec2 } from "cc";
import { CocosView } from "./CocosView";
import type { SettingsLogic } from "../logic/page/SettingsLogic";
import { createSolidPlate } from "./uiPlate";
import { createSettingsIcon, createSettingsSurface } from "./settingsArt";

const INK = new Color(55, 45, 72);
const PURPLE = new Color(104, 81, 148);
const MUTED = new Color(150, 141, 160);
const WHITE = new Color(255, 253, 255);
const NOTICE = new Color(167, 85, 57);

/** 面向玩家说明当前可用性，技术原因仍由 Logic 保留。 */
const UNAVAILABLE_TEXT: Readonly<Record<string, string>> = {
    language: "暂不支持切换", push: "暂不支持通知", terms: "暂未提供条款",
    privacy: "暂未提供政策", logUpload: "暂不支持上报",
};

export class SettingsView extends CocosView {
    onClose: () => void | Promise<void> = () => {};
    private logic: SettingsLogic | null = null;
    private content: Node | null = null;
    private scroll: ScrollView | null = null;
    private titleLabel: Label | null = null;
    private noticeLabel: Label | null = null;
    private hintLabel: Label | null = null;
    private backButton: Node | null = null;
    private scrollThumb: Node | null = null;
    private scrollTrack: Node | null = null;
    private resizeParent: Node | null = null;
    private generalOpen = false;
    private menuOffset = 0;
    private unit = 1;
    private contentWidth = 0;
    private viewportHeight = 0;

    protected onOpen(): void {
        this.generalOpen = false;
        this.menuOffset = 0;
        this.buildChrome();
        this.render();
        this.resizeParent = this.root.parent;
        this.resizeParent?.on(Node.EventType.SIZE_CHANGED, this.resize, this);
    }

    setup(logic: SettingsLogic): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = logic;
        logic.onChanged = () => this.render();
        this.render();
    }

    protected onCloseLifecycle(): void {
        this.resizeParent?.off(Node.EventType.SIZE_CHANGED, this.resize, this);
        this.resizeParent = null;
        this.scroll?.stopAutoScroll();
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
    }

    private readonly resize = (): void => {
        const parent = this.root.parent?.getComponent(UITransform);
        if (!parent || parent.width <= 0 || parent.height <= 0) return;
        const offset = this.scroll?.getScrollOffset().y ?? 0;
        this.layerWidth = parent.width;
        this.layerHeight = parent.height;
        const transform = this.root.getComponent(UITransform)!;
        transform.width = parent.width;
        transform.height = parent.height;
        this.root.setPosition((0.5 - parent.anchorX) * parent.width, (0.5 - parent.anchorY) * parent.height);
        this.buildChrome();
        this.render(offset);
    };

    /** 遮罩必须参与命中测试；空白处触摸也不能落到首屏。 */
    private readonly swallowTouch = (): void => {};

    private buildChrome(): void {
        this.scroll?.stopAutoScroll();
        this.clear(this.root);
        const width = this.layerWidth;
        const height = this.layerHeight;
        const panelWidth = Math.min(width * 0.94, 760, height * 1.12);
        const u = this.unit = panelWidth / 720;
        const panelHeight = Math.min(height * 0.84, panelWidth * 1.43);
        const headerHeight = 88 * u;
        const scrim = createSolidPlate(this.root, width, height, new Color(8, 12, 29, 184), 0, 0, "scrim");
        scrim.on(Node.EventType.TOUCH_END, this.swallowTouch, this);
        const panel = createSettingsSurface(this.root, panelWidth, panelHeight, 0, 0, "panel", "panel");
        const titleY = panelHeight / 2 - headerHeight / 2;
        createSettingsSurface(panel, panelWidth - 4 * u, headerHeight, 0, titleY - u, "header", "header");
        this.titleLabel = this.label(panel, "设置", 38 * u, WHITE, 0, titleY, panelWidth - 180 * u);
        this.titleLabel.isBold = true;
        const close = this.node("btn-关闭", panel, 72 * u, 72 * u, panelWidth / 2 - 48 * u, titleY);
        createSettingsIcon(close, 42 * u, 0, 0, "close", WHITE);
        close.on(Node.EventType.TOUCH_END, () => this.observeAsync(() => this.onClose(), "settings-close"), this);
        this.backButton = this.node("btn-back", panel, 72 * u, 72 * u, -panelWidth / 2 + 48 * u, titleY);
        createSettingsIcon(this.backButton, 36 * u, 0, 0, "back", WHITE);
        this.backButton.on(Node.EventType.TOUCH_END, () => this.showGeneral(false), this);
        this.backButton.active = this.generalOpen;

        this.contentWidth = panelWidth - 48 * u;
        this.viewportHeight = panelHeight - headerHeight - 52 * u;
        const viewportY = -headerHeight / 2 + 8 * u;
        const viewport = this.node("viewport", panel, this.contentWidth, this.viewportHeight, 0, viewportY);
        viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        const content = this.node("content", viewport, this.contentWidth, this.viewportHeight, 0, this.viewportHeight / 2);
        content.getComponent(UITransform)!.anchorY = 1;
        this.content = content;
        const scroll = viewport.addComponent(ScrollView);
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.inertia = true;
        scroll.brake = 0.75;
        scroll.elastic = false;
        // 原生捕获监听在拖动超过阈值后向子卡片发 TOUCH_CANCEL，避免滑动时误进玩法。
        scroll.cancelInnerEvents = true;
        scroll.content = content;
        this.scroll = scroll;
        viewport.on("scrolling", this.updateScrollIndicator, this);
        const trackX = panelWidth / 2 - 11 * u;
        this.scrollTrack = createSolidPlate(panel, 4 * u, this.viewportHeight, new Color(223, 216, 225), trackX, viewportY, "scroll-track");
        this.scrollThumb = createSolidPlate(panel, 4 * u, 48 * u, new Color(171, 153, 190), trackX, viewportY, "scroll-thumb");
        this.hintLabel = this.label(panel, "", 16 * u, MUTED, 0, -panelHeight / 2 + 21 * u, this.contentWidth);
        this.noticeLabel = this.label(panel, "", 18 * u, NOTICE, 0, -panelHeight / 2 + 21 * u, this.contentWidth);
    }

    private showGeneral(open: boolean): void {
        if (open) this.menuOffset = this.scroll?.getScrollOffset().y ?? 0;
        this.generalOpen = open;
        this.render(open ? 0 : this.menuOffset);
    }

    private render(resetOffset?: number): void {
        if (!this.content || !this.logic || !this.scroll) return;
        const offset = resetOffset ?? this.scroll.getScrollOffset().y;
        this.scroll.stopAutoScroll();
        this.clear(this.content);
        if (this.titleLabel) this.titleLabel.string = this.generalOpen ? "通用设置" : "设置";
        if (this.backButton) this.backButton.active = this.generalOpen;
        const height = this.generalOpen ? this.renderAudio() : this.renderMenu();
        this.content.getComponent(UITransform)!.height = Math.max(this.viewportHeight, height);
        this.scroll.scrollToOffset(new Vec2(0, Math.max(0, Math.min(offset, height - this.viewportHeight))), 0);
        const notice = this.logic.noticeText();
        if (this.noticeLabel) this.noticeLabel.string = notice;
        if (this.hintLabel) this.hintLabel.string = !notice && height > this.viewportHeight ? "上下滑动查看更多" : "";
        this.updateScrollIndicator();
    }

    private renderMenu(): number {
        const content = this.content!;
        const logic = this.logic!;
        const u = this.unit;
        const gap = 18 * u;
        const cardHeight = 110 * u;
        const cardWidth = (this.contentWidth - gap) / 2;
        let top = 28 * u;
        this.section("系统设置", top);
        top += 30 * u;
        const system = [{ id: "general", label: "通用设置" }, ...logic.placeholders()];
        system.forEach((item, index) => {
            const x = (index % 2 === 0 ? -1 : 1) * (cardWidth + gap) / 2;
            const y = -top - Math.floor(index / 2) * (cardHeight + gap) - cardHeight / 2;
            const general = item.id === "general";
            const card = this.card(content, general ? "btn-general" : "row-placeholder", item.label,
                item.id, general ? "音乐 · 音效" : UNAVAILABLE_TEXT[item.id] ?? "暂未开放",
                cardWidth, cardHeight, x, y, !general);
            if (general) this.bindCard(card, () => this.showGeneral(true));
        });
        top += Math.ceil(system.length / 2) * (cardHeight + gap) + 6 * u;
        createSolidPlate(content, this.contentWidth - 4 * u, 3 * u, new Color(208, 199, 214), 0, -top, "section-divider");
        top += 32 * u;
        this.section("玩法入口", top);
        top += 30 * u;
        const entries = logic.pluginEntries();
        entries.forEach((entry, index) => {
            const x = (index % 2 === 0 ? -1 : 1) * (cardWidth + gap) / 2;
            const y = -top - Math.floor(index / 2) * (cardHeight + gap) - cardHeight / 2;
            const status = entry.disabledReason?.includes("停用") ? "已停用"
                : entry.disabledReason?.includes("失败") ? "加载失败" : "入口不可用";
            const card = this.card(content, `card-${entry.entryId}`, entry.label, entry.pluginId,
                entry.enabled ? "" : status, cardWidth, cardHeight, x, y, !entry.enabled);
            if (entry.enabled) {
                this.bindCard(card, () => this.observeAsync(() => logic.activate(entry.entryId), "settings-launch"));
            } else {
                // 失败卡片自身不可点击；重试保留明确的独立操作，走原 launch 通道。
                const retry = this.node("btn-重试", card, 90 * u, 40 * u, cardWidth / 2 - 58 * u, -27 * u);
                this.label(retry, "重试", 19 * u, PURPLE, 0, 0, 84 * u);
                retry.on(Node.EventType.TOUCH_END, () => this.observeAsync(() => logic.retry(entry.entryId), "settings-retry"), this);
            }
        });
        if (entries.length === 0) {
            this.label(content, "暂无玩法入口", 25 * u, MUTED, 0, -top - cardHeight / 2, this.contentWidth);
        }
        return top + Math.max(1, Math.ceil(entries.length / 2)) * (cardHeight + gap) + 8 * u;
    }

    private renderAudio(): number {
        const u = this.unit;
        const content = this.content!;
        const logic = this.logic!;
        this.section("声音设置", 30 * u);
        const toggles = logic.audioToggles();
        const pending = toggles.some((item) => item.pending);
        toggles.forEach((toggle, index) => {
            const width = this.contentWidth;
            const height = 116 * u;
            const y = -126 * u - index * 140 * u;
            const row = createSettingsSurface(content, width, height, 0, y, "card", "row-audio");
            createSettingsIcon(row, 48 * u, -width / 2 + 48 * u, 0, toggle.key, PURPLE);
            this.label(row, toggle.label, 28 * u, INK, -width / 2 + 126 * u, 0, 92 * u).isBold = true;
            const switchWidth = 104 * u;
            const control = createSettingsSurface(row, switchWidth, 52 * u, width / 2 - 80 * u, 0,
                toggle.on ? "switchOn" : "switchOff", `btn-${toggle.key}`);
            createSettingsSurface(control, 42 * u, 42 * u, (toggle.on ? 1 : -1) * 25 * u, 0, "knob", "knob");
            this.label(control, toggle.pending ? "…" : toggle.on ? "开" : "关", 19 * u,
                toggle.on ? WHITE : INK, (toggle.on ? -1 : 1) * 24 * u, 0, 36 * u);
            if (!pending) control.on(Node.EventType.TOUCH_END,
                () => this.observeAsync(() => logic.toggleAudio(toggle.key), "settings-audio"), this);
        });
        return 340 * u;
    }

    private readonly updateScrollIndicator = (): void => {
        if (!this.scroll || !this.scrollTrack || !this.scrollThumb) return;
        const max = this.scroll.getMaxScrollOffset().y;
        const visible = max > 1;
        this.scrollTrack.active = visible;
        this.scrollThumb.active = visible;
        if (!visible) return;
        const thumbHeight = Math.max(36 * this.unit, this.viewportHeight * this.viewportHeight / (this.viewportHeight + max));
        this.scrollThumb.getComponent(UITransform)!.height = thumbHeight;
        const fraction = Math.max(0, Math.min(1, this.scroll.getScrollOffset().y / max));
        this.scrollThumb.setPosition(this.scrollTrack.position.x,
            this.scrollTrack.position.y + (this.viewportHeight - thumbHeight) * (0.5 - fraction));
    };

    private card(parent: Node, name: string, title: string, icon: string, subtitle: string,
        width: number, height: number, x: number, y: number, disabled: boolean): Node {
        const u = this.unit;
        const card = createSettingsSurface(parent, width, height, x, y, disabled ? "cardDisabled" : "card", name);
        createSettingsSurface(card, 87 * u, height - 8 * u, -width / 2 + 47 * u, 0, "iconTile", "icon-tile");
        createSettingsIcon(card, 49 * u, -width / 2 + 48 * u, 0, icon, disabled ? MUTED : PURPLE);
        const textX = 42 * u;
        const labelWidth = width - 112 * u;
        this.label(card, title, 28 * u, disabled ? new Color(127, 119, 137) : INK,
            textX, subtitle ? 12 * u : 0, labelWidth).isBold = true;
        if (subtitle) {
            const retry = disabled && name.startsWith("card-");
            this.label(card, subtitle, 17 * u, MUTED, textX - (retry ? 42 * u : 0), -23 * u,
                labelWidth - (retry ? 86 * u : 0));
        }
        return card;
    }

    private bindCard(card: Node, onTap: () => void): void {
        // ScrollView 的 TOUCH_CANCEL 会复原按下反馈，并阻止 TOUCH_END 触发 launch。
        card.on(Node.EventType.TOUCH_START, () => card.setScale(0.985, 0.985, 1), this);
        card.on(Node.EventType.TOUCH_CANCEL, () => card.setScale(1, 1, 1), this);
        card.on(Node.EventType.TOUCH_END, () => { card.setScale(1, 1, 1); onTap(); }, this);
    }

    private section(text: string, top: number): void {
        const label = this.label(this.content!, text, 20 * this.unit, PURPLE,
            -this.contentWidth / 2 + 4 * this.unit, -top, this.contentWidth);
        label.node.getComponent(UITransform)!.anchorX = 0;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.isBold = true;
    }

    private clear(parent: Node): void {
        for (const child of [...parent.children]) { child.removeFromParent(); child.destroy(); }
    }

    private node(name: string, parent: Node, width: number, height: number, x = 0, y = 0): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        const transform = node.addComponent(UITransform);
        transform.width = width;
        transform.height = height;
        parent.addChild(node);
        node.setPosition(x, y, 0);
        return node;
    }

    private label(parent: Node, text: string, size: number, color: Color, x: number, y: number, width: number): Label {
        const node = this.node("label", parent, width, size * 1.55, x, y);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = Math.round(size);
        label.lineHeight = Math.round(size * 1.2);
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.enableWrapText = false;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }
}
