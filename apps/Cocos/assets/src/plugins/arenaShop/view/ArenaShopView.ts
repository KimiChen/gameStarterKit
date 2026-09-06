/**
 * 竞技场商店面板（`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源；形态同 RedeemView 的手搓粗糙版：纯色底板 + Label 按钮）。
 * 列出自己占领的格，每格一个「+守备」按钮；一行提示。布局按 layerWidth/layerHeight 相对定位。
 *
 * 分工（铁律 9）：本文件只管节点与事件；棋盘过滤、购买闸与错误翻译在 ../logic/ArenaShopLogic.ts。
 * 宿主接线自 ../logic/arenaShopRuntime.ts 读取（plugin module install 时注入）。
 */
import { Color, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { formatTile } from "../../../kits/arena/api/board/index";
import { ArenaShopLogic } from "../logic/ArenaShopLogic";
import { getArenaShopRuntime } from "../logic/arenaShopRuntime";

const SCRIM = new Color(6, 9, 18, 190);
const PANEL = new Color(24, 30, 44, 245);
const ROW = new Color(38, 46, 66, 255);
const ROW_OFF = new Color(30, 34, 44, 255);
const ACCENT = new Color(70, 130, 210, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);
const OK = new Color(120, 210, 140, 255);

export class ArenaShopView extends CocosView {
    private logic: ArenaShopLogic | null = null;
    private body: Node | null = null;
    private bodyWidth = 0;
    private bodyHeight = 0;

    /** 节点在 onOpen 里搭（layerWidth/layerHeight 挂载后才有值，同 RedeemView 注释）。 */
    protected onOpen(): void {
        const logic = new ArenaShopLogic(getArenaShopRuntime());
        logic.onChanged = () => this.render();
        this.logic = logic;
        this.buildChrome(logic);
        this.render();
        this.observeAsync(() => logic.refresh(), "arenaShop-refresh");
    }

    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
        this.body = null;
    }

    private readonly swallowTouch = (): void => {};

    private buildChrome(logic: ArenaShopLogic): void {
        for (const child of [...this.root.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const width = this.layerWidth;
        const height = this.layerHeight;
        const scrim = this.plate(this.root, width, height, SCRIM, 0, 0, "scrim");
        scrim.on(Node.EventType.TOUCH_END, this.swallowTouch, this);

        const panelWidth = width * 0.88;
        const panelHeight = height * 0.6;
        const panel = this.node("panel", this.root, panelWidth, panelHeight);
        this.plate(panel, panelWidth, panelHeight, PANEL, 0, 0);

        const titleY = panelHeight * 0.5 - panelHeight * 0.08;
        this.label(panel, "竞技场商店", Math.round(width * 0.048), TEXT, -panelWidth * 0.5 + panelWidth * 0.06, titleY, "left");
        this.button(panel, "关闭", panelWidth * 0.2, panelHeight * 0.09,
            panelWidth * 0.5 - panelWidth * 0.13, titleY,
            () => this.observeAsync(async () => logic.close(), "arenaShop-close"));
        this.button(panel, "刷新", panelWidth * 0.2, panelHeight * 0.09,
            panelWidth * 0.5 - panelWidth * 0.36, titleY,
            () => this.observeAsync(() => logic.refresh(), "arenaShop-refresh"));

        this.bodyWidth = panelWidth * 0.88;
        this.bodyHeight = panelHeight * 0.76;
        const body = this.node("body", panel, this.bodyWidth, this.bodyHeight);
        body.setPosition(0, -panelHeight * 0.08, 0);
        this.body = body;
    }

    /** 主体整块重建：自己的格列表（每行一个购买按钮）+ 一行提示。 */
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
        const own = logic.ownTiles();
        if (own.length === 0) {
            this.label(body, logic.isLoaded() ? "你还没有格子，先去竞技场占领" : "读取中…", line, DIM, -width * 0.5, y, "left");
        }
        for (const tile of own.slice(0, 8)) {
            const enabled = logic.canBuy(tile.tile);
            this.plate(body, width, rowHeight * 0.9, ROW, 0, y);
            this.label(body, formatTile(tile), line, TEXT, -width * 0.5 + line * 0.5, y, "left");
            this.button(body, `+守备 (${logic.boostCost()} 金)`, width * 0.36, rowHeight * 0.7, width * 0.5 - width * 0.2, y,
                () => this.observeAsync(() => logic.buy(tile.tile), "arenaShop-buy"), ACCENT, !enabled);
            y -= rowHeight;
        }
        const notice = logic.currentNotice();
        const color = notice.kind === "success" ? OK : (notice.kind === "error" ? WARN : DIM);
        const balance = logic.lastBalance();
        const text = balance === null ? notice.text : `${notice.text}（余额 ${balance}）`;
        this.label(body, logic.isBusy() ? "处理中…" : text, Math.round(line * 0.85), color, -width * 0.5, -height * 0.5 + line, "left");
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
