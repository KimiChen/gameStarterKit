/**
 * 宣传首屏（`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源）。
 *
 * ⚠ 手搓粗糙版：FGUI 编辑器当前不可用，这版用 Cocos 节点直接堆。目标是**能跑能点**，
 * 视觉后续出图再换 FGUI 实现。
 *
 * ⛔ **不摆玩法入口**（docs/PLUGIN.md §6）：本页只有标题、副标题、运行时身份行、
 * 会话摘要行和右上角设置按钮；玩法/插件入口全在设置面板。因此本文件 ⛔ 不 import
 * 任何 menu contribution / launch 通道——机检见 apps/client/test/promoHome.test.ts。
 *
 * 布局取 750×1624 设计基线的**相对定位**：坐标由 `layerWidth/layerHeight` 按比例算出，
 * ⛔ 不写死像素；四周留 6% 安全区，右上角按钮不贴边。
 */
import { Color, Graphics, Label, Node, UITransform } from "cc";
import { CocosView } from "./CocosView";
import type { PromoHomeLogic } from "../logic/page/PromoHomeLogic";

/** 安全区留白比例（⛔ 不贴边）。 */
const SAFE = 0.06;

const BG = new Color(14, 18, 30, 255);
const CARD = new Color(26, 33, 50, 255);
const ACCENT = new Color(70, 130, 210, 255);
const TITLE = new Color(240, 246, 255, 255);
const TEXT = new Color(198, 209, 230, 255);
const DIM = new Color(140, 152, 176, 255);

export class PromoHomeView extends CocosView {
    private logic: PromoHomeLogic | null = null;
    private built = false;

    private titleLabel: Label | null = null;
    private subtitleLabel: Label | null = null;
    private runtimeLabel: Label | null = null;
    private sessionLabel: Label | null = null;
    private settingsLabel: Label | null = null;

    /**
     * ⚠ 节点在 **onOpen** 里搭，不在 onCreate：ViewMgr 的事务序是
     * runCreate → mount → runOpen，`layerWidth/layerHeight` 要挂载后才有值。
     */
    protected onOpen(): void {
        this.build();
        this.render();
    }

    /** 接线（opener 调用）：注入已装好会话摘要与设置回调的 Logic。 */
    setup(logic: PromoHomeLogic): void {
        this.logic = logic;
        this.render();
    }

    protected onCloseLifecycle(): void {
        this.logic = null;
    }

    private build(): void {
        if (this.built) return;
        this.built = true;
        const width = this.layerWidth;
        const height = this.layerHeight;
        const inset = width * SAFE;

        this.plate(this.root, width, height, BG, 0, 0);

        // 主卡片：横向留安全区，纵向居中偏上。
        const cardWidth = width - inset * 2;
        const cardHeight = height * 0.34;
        const card = this.node("card", this.root, cardWidth, cardHeight);
        card.setPosition(0, height * 0.06, 0);
        this.plate(card, cardWidth, cardHeight, CARD, 0, 0);

        this.titleLabel = this.label(card, "", Math.round(width * 0.072), TITLE, 0, cardHeight * 0.26);
        this.subtitleLabel = this.label(card, "", Math.round(width * 0.036), TEXT, 0, cardHeight * 0.02);
        this.runtimeLabel = this.label(card, "", Math.round(width * 0.03), DIM, 0, -cardHeight * 0.2);
        this.sessionLabel = this.label(card, "", Math.round(width * 0.03), DIM, 0, -cardHeight * 0.34);

        // 右上角设置按钮：以安全区内缘定位（⛔ 不贴屏幕边）。
        const buttonWidth = width * 0.2;
        const buttonHeight = height * 0.045;
        const button = this.node("btn-settings", this.root, buttonWidth, buttonHeight);
        button.setPosition(width * 0.5 - inset - buttonWidth * 0.5, height * 0.5 - inset - buttonHeight * 0.5, 0);
        this.plate(button, buttonWidth, buttonHeight, ACCENT, 0, 0);
        this.settingsLabel = this.label(button, "设置", Math.round(buttonHeight * 0.46), TITLE, 0, 0);
        button.on(Node.EventType.TOUCH_END, this.handleSettings, this);
    }

    private readonly handleSettings = (): void => {
        this.observeAsync(() => this.logic?.openSettings(), "promo-open-settings");
    };

    private render(): void {
        const logic = this.logic;
        if (!logic || !this.built) return;
        const model = logic.model();
        if (this.titleLabel) this.titleLabel.string = model.title;
        if (this.subtitleLabel) this.subtitleLabel.string = model.subtitle;
        if (this.runtimeLabel) this.runtimeLabel.string = model.runtimeLine;
        if (this.sessionLabel) this.sessionLabel.string = model.sessionLine;
        if (this.settingsLabel) this.settingsLabel.string = model.settingsLabel;
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

    private plate(parent: Node, width: number, height: number, color: Color, x: number, y: number): Node {
        const node = this.node("plate", parent, width, height);
        node.setPosition(x, y, 0);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        return node;
    }

    private label(parent: Node, text: string, size: number, color: Color, x: number, y: number): Label {
        const node = this.node("label", parent, size * 16, size * 1.4);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.color = color;
        return label;
    }
}
