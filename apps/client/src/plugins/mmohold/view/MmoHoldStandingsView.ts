/** 据点战比分 / 入场面板。分页、建角和进入判定归 Logic；纯色板使用 uiPlate。 */
import { Color, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { MmoHoldEntryLogic } from "../logic/MmoHoldEntryLogic";
import { describeHoldOwner, MmoHoldStandingsLogic } from "../logic/MmoHoldStandingsLogic";
import { getMmoHoldRuntime } from "../logic/mmoHoldRuntime";

const TEXT = new Color(238, 244, 248, 255);
const DIM = new Color(157, 174, 182, 255);
const DAWN = new Color(225, 169, 71, 255);
const DUSK = new Color(126, 164, 224, 255);
const PANEL = new Color(22, 36, 40, 252);
const ROW = new Color(37, 54, 58, 255);
const BUTTON = new Color(52, 87, 91, 255);

export class MmoHoldStandingsView extends CocosView {
    private logic: MmoHoldStandingsLogic | null = null;
    private entry: MmoHoldEntryLogic | null = null;
    protected onOpen(): void {
        this.logic = new MmoHoldStandingsLogic(getMmoHoldRuntime());
        this.entry = new MmoHoldEntryLogic(getMmoHoldRuntime());
        this.logic.onChanged = () => this.render();
        this.entry.onChanged = () => this.render();
        this.render();
        this.observeAsync(() => this.refresh(), "mmohold-open");
    }
    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        if (this.entry) this.entry.onChanged = () => {};
        this.logic = null;
        this.entry = null;
    }
    private async refresh(): Promise<void> {
        const logic = this.logic;
        const entry = this.entry;
        if (logic && entry) await Promise.all([logic.refresh(), entry.refresh()]);
    }
    private render(): void {
        const logic = this.logic;
        const entry = this.entry;
        if (!logic || !entry) return;
        for (const child of [...this.root.children]) { child.removeFromParent(); child.destroy(); }
        const scrim = createSolidPlate(this.root, this.layerWidth, this.layerHeight, new Color(6, 12, 14, 210), 0, 0, "scrim");
        scrim.on(Node.EventType.TOUCH_END, () => {}, this);
        const w = this.layerWidth * 0.92;
        const h = this.layerHeight * 0.91;
        const panel = createSolidPlate(this.root, w, h, PANEL, 0, 0, "hold-standings");
        const left = -w * 0.45;
        const font = Math.round(Math.min(w * 0.044, h * 0.026));
        this.label(panel, "据点争夺 · 争旗山脊", left, h * 0.445, w * 0.56, font * 1.2, TEXT);
        this.button(panel, "刷新", w * 0.20, h * 0.444, w * 0.15, h * 0.047, () => this.observeAsync(() => this.refresh(), "mmohold-refresh"));
        this.button(panel, "关闭", w * 0.375, h * 0.444, w * 0.15, h * 0.047, () => logic.close());
        const totals = logic.totalScores();
        this.label(panel, `曙光 ${totals.dawn}`, left, h * 0.382, w * 0.44, font * 1.35, DAWN);
        this.label(panel, `暮光 ${totals.dusk}`, w * 0.08, h * 0.382, w * 0.37, font * 1.35, DUSK);
        this.label(panel, "各分线当前轮次的检查点合计", left, h * 0.343, w * 0.9, font * 0.76, DIM);
        const rows = logic.rows();
        if (!rows.length) this.label(panel, logic.emptyText(), left, h * 0.265, w * 0.9, font, DIM);
        rows.forEach((row, index) => {
            const y = h * (0.274 - index * 0.089);
            createSolidPlate(panel, w * 0.9, h * 0.079, ROW, 0, y, `line-${row.instanceId}`);
            this.label(panel, row.label, left + w * 0.025, y + h * 0.019, w * 0.47, font * 0.84, TEXT);
            this.label(panel, `${row.scores.dawn} : ${row.scores.dusk}`, w * 0.14, y + h * 0.017, w * 0.26, font, row.leader === "dawn" ? DAWN : row.leader === "dusk" ? DUSK : TEXT);
            this.label(panel, `${row.ownership} · ${row.checkpoint}`, left + w * 0.025, y - h * 0.019, w * 0.85, font * 0.65, DIM);
        });
        this.button(panel, "上一页", -w * 0.30, h * 0.021, w * 0.24, h * 0.043, () => logic.movePage(-1));
        this.label(panel, `${logic.pageIndex() + 1} / ${logic.pageCount()}`, -w * 0.07, h * 0.021, w * 0.14, font * 0.8, DIM);
        this.button(panel, "下一页", w * 0.30, h * 0.021, w * 0.24, h * 0.043, () => logic.movePage(1));
        this.label(panel, logic.isBusy() ? "刷新战况中…" : logic.currentNotice().text, left, -h * 0.020, w * 0.9, font * 0.7, DIM);
        this.label(panel, "进入争夺", left, -h * 0.071, w * 0.9, font, TEXT);
        entry.characters().forEach((character, index) => {
            const y = -h * (0.120 + index * 0.054);
            this.label(panel, `${character.name} · ${describeHoldOwner(character.factionId)}`, left, y, w * 0.65, font * 0.85, character.factionId === "dawn" ? DAWN : DUSK);
            const enabled = entry.canEnter(character.characterId);
            this.button(panel, character.status === "active" ? "进入" : "停用", w * 0.345, y, w * 0.20, h * 0.043,
                () => { if (enabled) this.observeAsync(() => entry.enter(character.characterId), "mmohold-enter"); }, enabled ? BUTTON : ROW, `enter-${character.characterId}`);
        });
        if (entry.canCreate()) {
            this.button(panel, "建曙光角色", -w * 0.235, -h * 0.370, w * 0.43, h * 0.052, () => this.observeAsync(() => entry.create("dawn"), "mmohold-create-dawn"), BUTTON, "create-dawn");
            this.button(panel, "建暮光角色", w * 0.235, -h * 0.370, w * 0.43, h * 0.052, () => this.observeAsync(() => entry.create("dusk"), "mmohold-create-dusk"), BUTTON, "create-dusk");
        }
        this.label(panel, entry.isBusy() ? "角色操作中…" : entry.notice(), left, -h * 0.439, w * 0.9, font * 0.75, DIM);
    }
    private label(parent: Node, text: string, x: number, y: number, width: number, size: number, color: Color): void {
        const node = new Node("label");
        node.layer = parent.layer;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, size * 1.6);
        transform.anchorX = 0;
        node.setPosition(x, y, 0);
        parent.addChild(node);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size * 1.2;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.overflow = Label.Overflow.SHRINK;
    }
    private button(parent: Node, text: string, x: number, y: number, width: number, height: number, action: () => void, color = BUTTON, name = text): void {
        const node = createSolidPlate(parent, width, height, color, x, y, `btn-${name}`);
        this.label(node, text, -width * 0.40, 0, width * 0.80, height * 0.42, TEXT);
        node.on(Node.EventType.TOUCH_END, action, this);
    }
}
