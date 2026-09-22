/**
 * 独立的全屏英雄招募场景。它使用 Cocos 节点即时搭建，避免依赖 FGUI 资源；页面行为与
 * 招募规则全部留在 HeroRecruitLogic，View 仅做节点创建、事件绑定和状态搬运。
 */
import { Color, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { HeroRecruitLogic } from "../logic/HeroRecruitLogic";
import { getHeroRecruitRuntime } from "../logic/heroRecruitRuntime";

const BACKGROUND = new Color(9, 14, 28, 255);
const PANEL = new Color(25, 35, 58, 255);
const CARD = new Color(39, 53, 83, 255);
const DISABLED = new Color(55, 63, 80, 255);
const ACCENT = new Color(63, 134, 224, 255);
const TEXT = new Color(240, 245, 255, 255);
const DIM = new Color(164, 177, 202, 255);
const SUCCESS = new Color(128, 220, 151, 255);
const WARN = new Color(246, 183, 100, 255);

export class HeroRecruitSceneView extends CocosView {
  private logic: HeroRecruitLogic | null = null;
  private content: Node | null = null;
  private contentWidth = 0;
  private contentHeight = 0;

  protected onOpen(): void {
    const logic = new HeroRecruitLogic(getHeroRecruitRuntime());
    logic.onChanged = () => this.render();
    this.logic = logic;
    this.buildScene(logic);
    this.render();
    this.observeAsync(() => logic.refresh(), "heroRecruit-load");
  }

  protected onCloseLifecycle(): void {
    if (this.logic) this.logic.onChanged = () => {};
    this.logic = null;
    this.content = null;
  }

  private buildScene(logic: HeroRecruitLogic): void {
    for (const child of [...this.root.children]) {
      child.removeFromParent();
      child.destroy();
    }
    const width = this.layerWidth;
    const height = this.layerHeight;
    this.plate(
      this.root,
      width,
      height,
      BACKGROUND,
      0,
      0,
      "hero-recruit-background",
    );

    const panelWidth = width * 0.9;
    const panelHeight = height * 0.8;
    const panel = this.node(
      "hero-recruit-panel",
      this.root,
      panelWidth,
      panelHeight,
    );
    this.plate(panel, panelWidth, panelHeight, PANEL, 0, 0);
    const titleY = panelHeight * 0.5 - panelHeight * 0.08;
    this.label(
      panel,
      "英雄招募",
      Math.round(width * 0.052),
      TEXT,
      -panelWidth * 0.44,
      titleY,
      "left",
    );
    this.button(
      panel,
      "刷新",
      panelWidth * 0.17,
      panelHeight * 0.085,
      panelWidth * 0.25,
      titleY,
      () => this.observeAsync(() => logic.refresh(), "heroRecruit-refresh"),
    );
    this.button(
      panel,
      "返回",
      panelWidth * 0.17,
      panelHeight * 0.085,
      panelWidth * 0.43,
      titleY,
      () => this.observeAsync(async () => logic.close(), "heroRecruit-close"),
    );

    this.contentWidth = panelWidth * 0.88;
    this.contentHeight = panelHeight * 0.74;
    const content = this.node(
      "hero-recruit-content",
      panel,
      this.contentWidth,
      this.contentHeight,
    );
    content.setPosition(0, -panelHeight * 0.08, 0);
    this.content = content;
  }

  private render(): void {
    const content = this.content;
    const logic = this.logic;
    if (!content || !logic) return;
    for (const child of [...content.children]) {
      child.removeFromParent();
      child.destroy();
    }
    const width = this.contentWidth;
    const height = this.contentHeight;
    const font = Math.round(width * 0.045);
    let y = height * 0.5 - font;
    this.label(
      content,
      `铜币：${logic.copper()}`,
      font,
      TEXT,
      -width * 0.5,
      y,
      "left",
    );
    y -= font * 1.7;

    if (logic.catalog().length === 0) {
      this.label(
        content,
        logic.isBusy() ? "正在读取英雄目录…" : "暂时没有可招募英雄",
        font,
        DIM,
        -width * 0.5,
        y,
        "left",
      );
    }
    for (const hero of logic.catalog()) {
      const cardHeight = font * 2.8;
      const owned = logic.owns(hero.heroId);
      const enabled = logic.canBuy(hero);
      this.plate(content, width, cardHeight * 0.92, CARD, 0, y);
      this.label(
        content,
        `${hero.name} · ${hero.title} · ${"★".repeat(hero.rarity)}`,
        Math.round(font * 0.88),
        TEXT,
        -width * 0.48,
        y + font * 0.42,
        "left",
      );
      this.label(
        content,
        owned ? "已拥有" : `${hero.copperPrice} 铜币`,
        Math.round(font * 0.76),
        owned ? SUCCESS : DIM,
        -width * 0.48,
        y - font * 0.48,
        "left",
      );
      this.button(
        content,
        owned ? "已拥有" : `招募 ${hero.copperPrice}`,
        width * 0.27,
        cardHeight * 0.58,
        width * 0.34,
        y,
        () =>
          this.observeAsync(() => logic.buy(hero.heroId), "heroRecruit-buy"),
        owned ? DISABLED : ACCENT,
        !enabled,
      );
      y -= cardHeight;
    }
    const notice = logic.currentNotice();
    const color =
      notice.kind === "success"
        ? SUCCESS
        : notice.kind === "error"
          ? WARN
          : DIM;
    this.label(
      content,
      logic.isBusy() ? "处理中…" : notice.text,
      Math.round(font * 0.78),
      color,
      -width * 0.5,
      -height * 0.5 + font * 0.5,
      "left",
    );
  }

  private node(
    name: string,
    parent: Node,
    width: number,
    height: number,
  ): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    const transform = node.addComponent(UITransform);
    transform.width = width;
    transform.height = height;
    parent.addChild(node);
    return node;
  }

  private plate(
    parent: Node,
    width: number,
    height: number,
    color: Color,
    x: number,
    y: number,
    name = "plate",
  ): Node {
    return createSolidPlate(parent, width, height, color, x, y, name);
  }

  private label(
    parent: Node,
    text: string,
    size: number,
    color: Color,
    x: number,
    y: number,
    align: "left" | "center" = "center",
  ): Label {
    const node = this.node(
      "label",
      parent,
      size * Math.max(1, text.length),
      size * 1.4,
    );
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
    parent: Node,
    text: string,
    width: number,
    height: number,
    x: number,
    y: number,
    onTap: () => void,
    color: Color = ACCENT,
    disabled = false,
  ): Node {
    const node = this.node(`button-${text}`, parent, width, height);
    node.setPosition(x, y, 0);
    this.plate(node, width, height, disabled ? DISABLED : color, 0, 0);
    this.label(
      node,
      text,
      Math.round(height * 0.4),
      disabled ? DIM : TEXT,
      0,
      0,
    );
    if (!disabled) node.on(Node.EventType.TOUCH_END, onTap, this);
    return node;
  }
}
