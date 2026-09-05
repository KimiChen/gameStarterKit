/**
 * tally presentation（Cocos 纯节点，挂在玩法 presentation host 节点下；坐标以 host 中心为原点）。
 * 分工（铁律 9）：本文件只管节点与触摸；视图模型来自 logic/rooms/tally/TallyGameplay.ts 的 model()。
 * 手搓粗糙版（同 SettingsView 口径）：Graphics 色块 + Label，每帧按模型重建状态区。
 */
import { Color, Graphics, Label, Node, UITransform, view } from "cc";
import type { TallyInput, TallyPresentation, TallyViewModel } from "../../../logic/rooms/tally/TallyGameplay";
import { GamePhase } from "../../../shared/index";

const BG = new Color(18, 22, 34, 255);
const PANEL = new Color(30, 36, 52, 255);
const ACCENT = new Color(70, 130, 210, 255);
const TAP = new Color(232, 120, 64, 255);
const TEXT = new Color(238, 243, 255, 255);
const DIM = new Color(132, 143, 166, 255);
const OK = new Color(120, 210, 140, 255);
const WARN = new Color(240, 176, 96, 255);

export class TallyView implements TallyPresentation {
    private layer: Node | null = null;
    private status: Node | null = null;
    private width = 0;
    private height = 0;
    private lastKey = "";

    constructor(
        private readonly host: Node,
        private readonly dispatchInput: (input: TallyInput) => void,
    ) {}

    mount(): void {
        if (this.layer) return;
        const size = view.getVisibleSize();
        this.width = size.width;
        this.height = size.height;
        const layer = this.node("TallyLayer", this.host, this.width, this.height);
        this.layer = layer;
        this.plate(layer, this.width, this.height, BG, 0, 0, "bg");
        this.label(layer, "点数赛 · tally", Math.round(this.width * 0.06), TEXT, 0, this.height * 0.4);
        // 大按钮：TAP
        const tapSize = Math.min(this.width, this.height) * 0.42;
        this.button(layer, "TAP", tapSize, tapSize, 0, -this.height * 0.08, () => this.dispatchInput({ type: "tap" }), TAP);
        // 左下：离开
        this.button(layer, "离开", this.width * 0.26, this.height * 0.06, -this.width * 0.5 + this.width * 0.18, -this.height * 0.42,
            () => this.dispatchInput({ type: "leave" }), PANEL);
        const status = this.node("status", layer, this.width, this.height * 0.3);
        status.setPosition(0, this.height * 0.2, 0);
        this.status = status;
    }

    render(model: TallyViewModel): void {
        const status = this.status;
        if (!status) return;
        // 仅在模型可见部分变化时重建（每帧 render，⛔ 不每帧重建节点树）。
        const key = JSON.stringify([model.phase, model.tapGoal, model.selfTaps, model.winnerName, model.selfWon, Math.ceil(model.lingerLeft ?? -1),
            model.players.map((player) => [player.name, player.taps, player.isSelf])]);
        if (key === this.lastKey) return;
        this.lastKey = key;
        for (const child of [...status.children]) {
            child.removeFromParent();
            child.destroy();
        }
        const w = this.width;
        const h = this.height * 0.3;
        const line = Math.round(this.width * 0.045);
        const settled = model.phase === GamePhase.Settle;
        const headline = settled
            ? (model.selfWon ? "你赢了！" : `${model.winnerName ?? "对手"} 获胜`)
            : model.phase === GamePhase.Playing ? `目标 ${model.tapGoal} 次 · 你已点 ${model.selfTaps}` : "等待开局…";
        this.label(status, headline, Math.round(line * 1.2), settled ? (model.selfWon ? OK : WARN) : TEXT, 0, h * 0.35);
        if (model.lingerLeft !== null) {
            this.label(status, `${Math.ceil(model.lingerLeft)} 秒后回大厅`, line, DIM, 0, h * 0.1);
        }
        let y = -h * 0.12;
        for (const player of model.players.slice(0, 4)) {
            this.label(status, `${player.isSelf ? "▶ " : ""}${player.name}  ${player.taps}`, line, player.isSelf ? ACCENT : DIM, -w * 0.4, y, "left");
            y -= line * 1.5;
        }
    }

    unmount(): void {
        const layer = this.layer;
        this.layer = null;
        this.status = null;
        this.lastKey = "";
        if (!layer) return;
        try {
            layer.removeFromParent();
            layer.destroy();
        } catch (error) {
            console.error("[tally] 卸载 presentation 失败", error);
        }
    }

    // ── 小件（同 SettingsView/RedeemView 形态） ──

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
        const node = this.node(name, parent, width, height);
        node.setPosition(x, y, 0);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        return node;
    }

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

    private button(parent: Node, text: string, width: number, height: number, x: number, y: number, onTap: () => void, color: Color): Node {
        const node = this.node(`btn-${text}`, parent, width, height);
        node.setPosition(x, y, 0);
        this.plate(node, width, height, color, 0, 0);
        this.label(node, text, Math.round(Math.min(width, height) * 0.3), TEXT, 0, 0);
        node.on(Node.EventType.TOUCH_END, onTap, this);
        return node;
    }
}
