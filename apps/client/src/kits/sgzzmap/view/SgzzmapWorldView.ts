/**
 * 大地图全屏路由：前景多指输入 + 合并网格 + 选中格操作条。
 *
 * ⚠ 只有一台正交 UI 相机（docs/3d.md 零实施）：一切经 UIMeshRenderer 走 2D UI 管线，
 * 深度**只有兄弟序**，⛔ 不要指望 z。
 * ⚠ 实心矩形一律走 createSolidPlate，⛔ 不要每块一个 Graphics（docs/CLIENT.md §3）。
 */
import { Color, EventMouse, EventTouch, Game, game, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { SGZZ_LOD_MAX } from "../../../shared/kits/sgzzmap/api/hexmap/index";
import { SgzzmapWorldLogic } from "../logic/SgzzmapWorldLogic";
import { sgzzIsNearField } from "../logic/sgzzLayers";
import { getSgzzRuntime } from "../logic/sgzzRuntime";
import { sgzzPassableAt, sgzzTerrainIdAt } from "../logic/sgzzTerrain";
import { SGZZ_TERRAIN_PALETTE } from "../../../shared/kits/sgzzmap/content/terrain.data";
import { SgzzMapRenderer } from "./SgzzMapRenderer";

const BACK = new Color(22, 26, 24, 255);
const PANEL = new Color(24, 30, 28, 255);
const TEXT = new Color(236, 243, 237, 255);
const MUTED = new Color(150, 176, 168, 255);
const MARK = new Color(255, 224, 119, 255);
const ACCENT = new Color(46, 84, 74, 255);

export class SgzzmapWorldView extends CocosView {
    private logic: SgzzmapWorldLogic | null = null;
    private world: Node | null = null;
    private selection: Node | null = null;
    private renderer: SgzzMapRenderer | null = null;
    private details: Label | null = null;
    private status: Label | null = null;
    private title: Label | null = null;
    private offTick: (() => void) | null = null;
    private active = false;
    private mapTop = 0;
    private mapBottom = 0;
    private lastRevision = -1;
    private lastCameraVersion = -1;

    protected onOpen(): void {
        this.active = true;
        const width = this.layerWidth, height = this.layerHeight;
        const header = Math.min(150, height * 0.14), footer = Math.min(270, height * 0.26);
        this.mapBottom = -height / 2 + footer;
        this.mapTop = height / 2 - header;

        const runtime = getSgzzRuntime();
        if (!runtime) return;
        this.logic = new SgzzmapWorldLogic(runtime, width, this.mapTop - this.mapBottom);

        createSolidPlate(this.root, width, height, BACK, 0, 0, "sgzz-scrim");
        const world = this.node("sgzz-world", this.root, width, this.mapTop - this.mapBottom);
        world.setPosition(0, (this.mapBottom + this.mapTop) / 2);
        this.world = world;
        const selection = this.node("sgzz-selection", this.root, 8, 8);
        selection.active = false;
        this.selection = selection;
        for (const [w, h, x, y] of [[64, 3, 0, 15], [64, 3, 0, -15], [3, 30, -31, 0], [3, 30, 31, 0]]) {
            createSolidPlate(selection, w, h, MARK, x, y);
        }

        createSolidPlate(this.root, width, header, PANEL, 0, height / 2 - header / 2);
        createSolidPlate(this.root, width, footer, PANEL, 0, -height / 2 + footer / 2);
        this.title = this.label("大地图", 25, TEXT, 0, height / 2 - header * 0.35, width * 0.55);
        this.button("关闭", width * 0.14, 44, width * 0.39, height / 2 - header * 0.35, () => runtime.close());
        this.button("回中", width * 0.14, 44, -width * 0.39, height / 2 - header * 0.35,
            () => this.logic?.locate(Math.floor(this.logic.mapRows / 2), Math.floor(this.logic.mapCols / 2)));
        this.label("拖动平移 · 双指/滚轮缩放 · 点选地块", 18, MUTED, 0, height / 2 - header * 0.77, width * 0.9);

        this.details = this.label("点选地图中的一格", 22, TEXT, 0, this.mapBottom - footer * 0.18, width * 0.94);
        this.button("占领 / 加固", width * 0.42, 54, -width * 0.24, this.mapBottom - footer * 0.52,
            () => this.observeAsync(async () => { await this.logic?.occupySelected(); this.render(true); }, "sgzz-occupy"));
        this.button("放弃", width * 0.28, 54, width * 0.26, this.mapBottom - footer * 0.52,
            () => this.observeAsync(async () => { await this.logic?.abandonSelected(); this.render(true); }, "sgzz-abandon"));
        this.status = this.label("", 17, MUTED, 0, -height / 2 + footer * 0.17, width * 0.94);

        this.renderer = new SgzzMapRenderer(world);
        this.bindInput(true);
        this.offTick = runtime.tick((dt) => {
            const logic = this.logic;
            if (!logic || !this.active) return;
            logic.update(dt);
            this.render(false);
        });
        this.render(true);
    }

    protected onCloseLifecycle(): void {
        this.active = false;
        this.bindInput(false);
        this.offTick?.(); this.offTick = null;
        this.renderer?.dispose(); this.renderer = null;
        this.logic = null;
    }

    /** 只有相机真动过或数据真变过才重建网格，⛔ 不要每帧重建。 */
    private render(force: boolean): void {
        const logic = this.logic;
        if (!logic || !this.world || !this.renderer) return;
        const moved = logic.camera.version !== this.lastCameraVersion;
        const changed = logic.revision !== this.lastRevision;
        if (!force && !moved && !changed) return;
        this.lastCameraVersion = logic.camera.version;
        this.lastRevision = logic.revision;

        // 世界节点：平移 + 缩放；网格本身建在世界坐标里，⛔ 平移不重建
        const scale = logic.camera.scale;
        this.world.setScale(scale, scale, 1);
        this.world.setPosition(-logic.camera.x * scale, -logic.camera.y * scale + (this.mapBottom + this.mapTop) / 2, 0);

        if (sgzzIsNearField(logic.camera.lod)) {
            this.renderer.render(logic);
            this.world.active = true;
        } else {
            // 远档先不铺逐格网格（底图与聚合色块见 README 的 P6 余留项）
            this.world.active = false;
        }

        const sel = logic.selection;
        if (this.selection) {
            this.selection.active = sel !== null;
            if (sel) {
                const rect = SgzzMapRenderer.selectionRect(sel.row, sel.col, scale);
                const screen = logic.camera.screenAt(rect.x, rect.y);
                this.selection.setPosition(
                    screen.x - this.layerWidth / 2,
                    (this.mapBottom + this.mapTop) / 2 + (this.logicHeight() / 2 - screen.y), 0);
                this.selection.setScale(scale, scale, 1);
            }
        }

        if (this.title) this.title.string = `大地图 · LOD ${logic.camera.lod}/${SGZZ_LOD_MAX}`;
        if (this.details) this.details.string = this.describe();
        if (this.status) this.status.string = logic.notice;
    }

    private logicHeight(): number { return this.mapTop - this.mapBottom; }

    // ── 小工具（CocosView 只提供 root / layerWidth / layerHeight） ─────────────
    private node(name: string, parent: Node, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        const transform = node.addComponent(UITransform);
        transform.width = width; transform.height = height;
        parent.addChild(node);
        return node;
    }
    private label(text: string, size: number, color: Color, x: number, y: number,
                  width: number, parent: Node = this.root): Label {
        const node = this.node("label", parent, width, size * 2.5);
        node.setPosition(x, y);
        const label = node.addComponent(Label);
        label.string = text; label.fontSize = size; label.lineHeight = size * 1.25;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }
    private button(text: string, width: number, height: number, x: number, y: number, onTap: () => void): Node {
        const node = createSolidPlate(this.root, width, height, ACCENT, x, y, `sgzz-${text}`);
        this.label(text, 22, TEXT, 0, 0, width * 0.95, node);
        node.on(Node.EventType.TOUCH_END, onTap, this);
        return node;
    }

    private describe(): string {
        const logic = this.logic;
        if (!logic) return "";
        const sel = logic.selection;
        if (!sel) return "点选地图中的一格";
        const terrain = SGZZ_TERRAIN_PALETTE[sgzzTerrainIdAt(sel.row, sel.col)];
        const owner = sel.tile.ownerUid === "" ? "无主" : `${sel.tile.ownerUid}（守军 ${sel.tile.durability}）`;
        const pass = sgzzPassableAt(sel.row, sel.col) ? "" : " · 不可通行";
        return `(${sel.row}, ${sel.col}) ${terrain?.cn ?? "?"}${pass} · ${owner}`;
    }

    // ── 输入 ─────────────────────────────────────────────────────────────────
    private bindInput(on: boolean): void {
        const node = this.root;
        const method = on ? "on" : "off";
        node[method](Node.EventType.TOUCH_START, this.onTouchStart, this);
        node[method](Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        node[method](Node.EventType.TOUCH_END, this.onTouchEnd, this);
        node[method](Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        node[method](Node.EventType.MOUSE_WHEEL, this.onWheel, this);
        if (on) game.on(Game.EVENT_HIDE, this.onHide, this);
        else game.off(Game.EVENT_HIDE, this.onHide, this);
    }
    private toLocal(x: number, y: number): { x: number; y: number } | null {
        if (!this.logic) return null;
        // 屏幕（y 向上、中心原点）→ 地图区局部（左上原点、y 向下）
        return { x: x + this.layerWidth / 2, y: this.mapTop - y };
    }
    /** ⚠ Node 的 TOUCH_* 是**逐触点**派发的：一次事件一根手指，⛔ 别去找 getTouches()。 */
    private onTouchStart(event: EventTouch): void {
        const logic = this.logic;
        if (!logic) return;
        const p = this.toLocal(event.getUILocation().x, event.getUILocation().y);
        if (p) logic.camera.start(event.getID(), p.x, p.y, this.now());
    }
    private onTouchMove(event: EventTouch): void {
        const logic = this.logic;
        if (!logic) return;
        const p = this.toLocal(event.getUILocation().x, event.getUILocation().y);
        if (p) logic.camera.move(event.getID(), p.x, p.y, this.now());
        this.render(false);
    }
    private onTouchEnd(event: EventTouch): void {
        const logic = this.logic;
        if (!logic) return;
        const tapped = logic.camera.end(event.getID(), this.now());
        if (tapped) logic.select(tapped.row, tapped.col);
        this.render(true);
    }
    private onTouchCancel(): void { this.logic?.camera.cancel(); }
    private onHide(): void { this.logic?.camera.cancel(); }
    private now(): number { return getSgzzRuntime()?.now() ?? 0; }
    private onWheel(event: EventMouse): void {
        const logic = this.logic;
        if (!logic) return;
        const p = this.toLocal(event.getUILocation().x, event.getUILocation().y);
        logic.camera.zoom(event.getScrollY() > 0 ? 1.12 : 1 / 1.12, p?.x, p?.y);
        this.render(false);
    }
}
