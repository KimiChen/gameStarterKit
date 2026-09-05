/**
 * 兑换码面板（`kind:"cocos"` 纯节点页，⛔ 无 FGUI 资源；形态同 SettingsView 的手搓粗糙版：
 * Graphics 色块 + Label + 一个 EditBox）。布局按 layerWidth/layerHeight 相对定位。
 *
 * 分工（铁律 9）：本文件只管节点与事件；输入规范化、提交闸与错误翻译在 ../logic/RedeemLogic.ts。
 * 宿主接线自 ../logic/redeemRuntime.ts 读取（feature module install 时注入）。
 */
import { Color, EditBox, Graphics, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { RedeemLogic } from "../logic/RedeemLogic";
import { getRedeemRuntime } from "../logic/redeemRuntime";

const SCRIM = new Color(6, 9, 18, 190);
const PANEL = new Color(24, 30, 44, 245);
const FIELD = new Color(38, 46, 66, 255);
const ROW_OFF = new Color(30, 34, 44, 255);
const ACCENT = new Color(70, 130, 210, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const WARN = new Color(240, 176, 96, 255);
const OK = new Color(120, 210, 140, 255);

export class RedeemView extends CocosView {
    private logic: RedeemLogic | null = null;
    private editBox: EditBox | null = null;
    private status: Node | null = null;
    private statusWidth = 0;
    private statusHeight = 0;

    /** 节点在 onOpen 里搭（layerWidth/layerHeight 挂载后才有值，同 SettingsView 注释）。 */
    protected onOpen(): void {
        const logic = new RedeemLogic(getRedeemRuntime());
        logic.onChanged = () => this.render();
        this.logic = logic;
        this.buildChrome(logic);
        this.render();
    }

    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
        this.editBox = null;
        this.status = null;
    }

    private readonly swallowTouch = (): void => {};

    private buildChrome(logic: RedeemLogic): void {
        for (const child of [...this.root.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const width = this.layerWidth;
        const height = this.layerHeight;
        const scrim = this.plate(this.root, width, height, SCRIM, 0, 0, "scrim");
        scrim.on(Node.EventType.TOUCH_END, this.swallowTouch, this);

        const panelWidth = width * 0.88;
        const panelHeight = height * 0.4;
        const panel = this.node("panel", this.root, panelWidth, panelHeight);
        this.plate(panel, panelWidth, panelHeight, PANEL, 0, 0);

        const titleY = panelHeight * 0.5 - panelHeight * 0.12;
        this.label(panel, "兑换码", Math.round(width * 0.048), TEXT, -panelWidth * 0.5 + panelWidth * 0.06, titleY, "left");
        this.button(panel, "关闭", panelWidth * 0.2, panelHeight * 0.14,
            panelWidth * 0.5 - panelWidth * 0.13, titleY,
            () => this.observeAsync(async () => logic.close(), "redeem-close"));

        // 输入框：底板（Graphics）里嵌一个略窄的 EditBox 节点当内边距；EditBox 事件在其节点上派发
        // （EditBox.EventType.TEXT_CHANGED = "text-changed"）。
        const fieldWidth = panelWidth * 0.88;
        const fieldHeight = panelHeight * 0.18;
        const field = this.plate(panel, fieldWidth, fieldHeight, FIELD, 0, panelHeight * 0.1, "field");
        const padding = fieldWidth * 0.04;
        const boxNode = this.node("editbox", field, fieldWidth - padding * 2, fieldHeight);
        const editBox = boxNode.addComponent(EditBox);
        // 代码创建的 EditBox 没有 prefab 里的两个 Label：显式给 textLabel/placeholderLabel，锚点 (0,1)、
        // 尺寸随输入框（EditBox._resizeChildNodes 按这个约定摆位），左对齐 + 垂直居中。
        // Creator 预览实测：不给的话文字会出现在输入框左上外侧并被切掉。
        const fieldLabel = (name: string, color: Color): Label => {
            const node = this.node(name, boxNode, fieldWidth - padding * 2, fieldHeight);
            const transform = node.getComponent(UITransform);
            if (transform) {
                transform.anchorX = 0;
                transform.anchorY = 1;
            }
            node.setPosition(-(fieldWidth - padding * 2) / 2, fieldHeight / 2, 0);
            const label = node.addComponent(Label);
            label.fontSize = Math.round(fieldHeight * 0.26);
            label.color = color;
            label.horizontalAlign = Label.HorizontalAlign.LEFT;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            return label;
        };
        editBox.textLabel = fieldLabel("text", TEXT);
        editBox.placeholderLabel = fieldLabel("placeholder", DIM);
        // addComponent 时 EditBox 已在活动节点上跑过 _init，自建了 TEXT_LABEL/PLACEHOLDER_LABEL 两个中心锚的
        // 子节点（PLACEHOLDER_LABEL 还带 Label 缺省字符串 "label"）；引用被换成上面两个后它们成了孤儿，须删掉。
        for (const strayName of ["TEXT_LABEL", "PLACEHOLDER_LABEL"]) {
            const stray = boxNode.getChildByName(strayName);
            if (stray) {
                stray.removeFromParent();
                stray.destroy();
            }
        }
        editBox.placeholder = "输入兑换码（4～32 位字母/数字）";
        editBox.maxLength = 32;
        boxNode.on(EditBox.EventType.TEXT_CHANGED, () => logic.setInput(editBox.string), this);
        boxNode.on(EditBox.EventType.EDITING_RETURN, () => this.observeAsync(() => logic.submit(), "redeem-submit"), this);
        this.editBox = editBox;

        this.statusWidth = fieldWidth;
        this.statusHeight = panelHeight * 0.44;
        const status = this.node("status", panel, this.statusWidth, this.statusHeight);
        status.setPosition(0, -panelHeight * 0.24, 0);
        this.status = status;
    }

    /** 状态区整块重建：兑换按钮（灰/可点）+ 一行提示。EditBox 常驻，只回写字符串。 */
    private render(): void {
        const status = this.status;
        const logic = this.logic;
        if (!status || !logic) return;
        for (const child of [...status.children]) {
            child.removeFromParent();
            child.destroy();
        }
        if (this.editBox && this.editBox.string.trim().toUpperCase() !== logic.inputCode()) {
            this.editBox.string = logic.inputCode();
        }
        const width = this.statusWidth;
        const height = this.statusHeight;
        const notice = logic.currentNotice();
        const color = notice.kind === "success" ? OK : (notice.kind === "error" ? WARN : DIM);
        this.label(status, notice.text, Math.round(height * 0.16), color, -width * 0.5 + width * 0.02, height * 0.3, "left");
        const buttonText = logic.isBusy() ? "兑换中…" : "兑换";
        this.button(status, buttonText, width * 0.4, height * 0.36, 0, -height * 0.18,
            () => this.observeAsync(() => logic.submit(), "redeem-submit"), ACCENT, !logic.canSubmit());
    }

    // ── 小件（与 SettingsView 同形；粗糙版不抽公共基类，等 FGUI 出图后整体替换） ──

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
        const node = this.node(name, parent, width, height);
        node.setPosition(x, y, 0);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        return node;
    }

    /** align="left" 时 x 是文字左边缘（锚点 (0,0.5) + 左对齐）；缺省 "center" 时 x 是中心（同 SettingsView）。 */
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
