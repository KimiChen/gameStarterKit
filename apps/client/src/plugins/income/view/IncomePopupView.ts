/**
 * 离线收益弹窗（`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源；形态同 RedeemView 的手搓粗糙版：
 * 纯色底板 + Label + 一个确定按钮）。布局按 layerWidth/layerHeight 相对定位。
 *
 * 分工（铁律 9）：本文件只管节点与事件；文案、领取闸与错误翻译在 ../logic/IncomeLogic.ts。
 * 宿主接线自 ../logic/incomeRuntime.ts 读取（plugin module install 时注入）。
 *
 * ⚠ 模态：sidecar 声明 `interactive:true`（ViewMgr 据此关掉下层 FGUI 输入），本页自己再挂
 * `BlockInputEvents` + 全屏 scrim 吞点击，两层一起保证弹窗期间下层收不到输入。
 */
import { BlockInputEvents, Color, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { IncomeLogic } from "../logic/IncomeLogic";
import { getIncomeRuntime } from "../logic/incomeRuntime";

const SCRIM = new Color(6, 9, 18, 190);
const PANEL = new Color(24, 30, 44, 245);
const ACCENT = new Color(70, 130, 210, 255);
const ROW_OFF = new Color(30, 34, 44, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);
const OK = new Color(120, 210, 140, 255);

export class IncomePopupView extends CocosView {
    private logic: IncomeLogic | null = null;
    private body: Node | null = null;
    private balance: Node | null = null;
    private notice: Node | null = null;
    private action: Node | null = null;
    private contentWidth = 0;

    /** 节点在 onOpen 里搭（layerWidth/layerHeight 挂载后才有值，同 RedeemView 注释）。 */
    protected onCreate(): void {
        // 计划/字体仍在加载时也要挡住下层输入（CocosView 模态页的屏障要求）。
        this.root.addComponent(BlockInputEvents);
    }

    protected onOpen(): void {
        const logic = new IncomeLogic(getIncomeRuntime());
        logic.onChanged = () => this.render();
        this.logic = logic;
        this.buildChrome();
        // 手动入口（设置面板里的菜单项）打开时还没有快照：先拉一次只读预览。
        if (logic.snapshotOf() === null) {
            this.observeAsync(() => logic.refresh(), "income-refresh");
        }
        this.render();
    }

    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
        this.body = null;
        this.balance = null;
        this.notice = null;
        this.action = null;
    }

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

        const panelWidth = width * 0.86;
        const panelHeight = height * 0.4;
        const panel = this.node("panel", this.root, panelWidth, panelHeight);
        this.plate(panel, panelWidth, panelHeight, PANEL, 0, 0);

        const contentWidth = panelWidth * 0.88;
        this.contentWidth = contentWidth;
        const left = -contentWidth * 0.5;
        const titleY = panelHeight * 0.5 - panelHeight * 0.12;
        this.label(panel, "离线收益", Math.round(width * 0.048), TEXT, left, titleY, "left");

        // 正文/余额/提示三行都按内容重建（文案长度随快照变化），故先建空壳再在 render 里填。
        this.body = this.node("body", panel, contentWidth, panelHeight * 0.3);
        // 三个 host 保持在面板中心，内部 Label 再以 -contentWidth / 2 作为左边缘。
        // ⛔ 不要把 host 也放到 left：那会把左移应用两次，正文整体落进面板外的裁剪区。
        this.body.setPosition(0, panelHeight * 0.06, 0);
        this.balance = this.node("balance", panel, contentWidth, panelHeight * 0.16);
        this.balance.setPosition(0, -panelHeight * 0.12, 0);
        this.notice = this.node("notice", panel, contentWidth, panelHeight * 0.14);
        this.notice.setPosition(0, -panelHeight * 0.23, 0);
        this.action = this.node("action", panel, contentWidth, panelHeight * 0.2);
        this.action.setPosition(0, -panelHeight * 0.4 + panelHeight * 0.02, 0);
    }

    /** 整块重建可变区：正文 / 余额 / 提示 / 按钮。 */
    private render(): void {
        const logic = this.logic;
        if (!logic) return;
        this.fillBody(logic);
        this.fillLine(this.balance, logic.balanceText(), Math.round(this.layerWidth * 0.034), DIM);
        const notice = logic.currentNotice();
        const noticeColor = notice.kind === "success" ? OK : (notice.kind === "error" ? WARN : DIM);
        this.fillLine(this.notice, notice.text, Math.round(this.layerWidth * 0.032), noticeColor);
        this.fillAction(logic);
    }

    private fillBody(logic: IncomeLogic): void {
        const host = this.body;
        if (!host) return;
        this.clear(host);
        const size = Math.round(this.layerWidth * 0.036);
        const label = this.wrappedLabel(host, logic.body(), size, logic.hasOffline() ? TEXT : DIM);
        label.node.setPosition(-this.contentWidth * 0.5, 0, 0);
    }

    private fillLine(host: Node | null, text: string, size: number, color: Color): void {
        if (!host) return;
        this.clear(host);
        if (text === "") return;
        this.label(host, text, size, color, -this.contentWidth * 0.5, 0, "left");
    }

    private fillAction(logic: IncomeLogic): void {
        const host = this.action;
        if (!host) return;
        this.clear(host);
        const canClaim = logic.canClaim();
        const text = logic.isBusy() ? "领取中…" : (canClaim ? "确定" : "关闭");
        this.button(host, text, this.contentWidth * 0.52, host.getComponent(UITransform)!.height * 0.8,
            0, 0,
            () => this.observeAsync(async () => {
                if (!logic.canClaim()) {
                    logic.close();
                    return;
                }
                await logic.claim();
                // 领取失败时快照仍是待领状态 ⇒ 不关窗，让玩家看到错误后重试。
                if (!logic.hasOffline()) logic.close();
            }, "income-confirm"),
            ACCENT, logic.isBusy());
    }

    private clear(host: Node): void {
        for (const child of [...host.children]) {
            child.removeFromParent();
            child.destroy();
        }
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
        // ⛔ 这里曾经是「每块底板一个 Graphics」，实测每个固定占约 2.25MB 显存缓冲
        // 且各自一个 draw call；改走共用的白图 Sprite（可合批）。判据见 view/uiPlate.ts。
        return createSolidPlate(parent, width, height, color, x, y, name);
    }

    /** align="left" 时 x 是文字左边缘（锚点 (0,0.5) + 左对齐）；缺省 "center" 时 x 是中心（同 RedeemView）。 */
    private label(
        parent: Node, text: string, size: number, color: Color, x: number, y: number, align: "left" | "center" = "center",
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

    /** 定宽自动换行（RESIZE_HEIGHT 按内容长高，锚点 (0,0.5) 左对齐）——正文比单行小件长得多。 */
    private wrappedLabel(parent: Node, text: string, size: number, color: Color): Label {
        const node = this.node("body-label", parent, this.contentWidth, size * 1.4);
        const transform = node.getComponent(UITransform);
        if (transform) transform.anchorX = 0;
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = Math.round(size * 1.5);
        label.color = color;
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = true;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
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
