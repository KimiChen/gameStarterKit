/**
 * 大地图全屏路由：前景多指输入 + 合并网格 + 选中格操作条。
 *
 * ⚠ 只有一台正交 UI 相机（docs/3d.md 零实施）：一切经 UIMeshRenderer 走 2D UI 管线，
 * 深度**只有兄弟序**，⛔ 不要指望 z。
 * ⚠ 实心矩形一律走 createSolidPlate，⛔ 不要每块一个 Graphics（docs/CLIENT.md §3）。
 */
import { Color, EventMouse, EventTouch, Game, game, Label, Node, UITransform, Vec3 } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { SGZZ_LOD_MAX } from "../../../shared/kits/sgzzmap/api/hexmap/index";
import { SgzzGridState } from "../../../shared/kits/sgzzmap/api/territory/index";
import { SgzzmapWorldLogic } from "../logic/SgzzmapWorldLogic";
import { sgzzCameraToRootLocal, sgzzInMapBand, sgzzRootLocalToCamera } from "../logic/sgzzCamera";
import { sgzzIsNearField } from "../logic/sgzzLayers";
import { getSgzzRuntime } from "../logic/sgzzRuntime";
import { sgzzPassableAt, sgzzTerrainIdAt } from "../logic/sgzzTerrain";
import { SGZZ_TERRAIN_PALETTE } from "../../../shared/kits/sgzzmap/content/terrain.data";
import { SgzzMapRenderer } from "./SgzzMapRenderer";
import { SgzzFarRenderer } from "./SgzzFarRenderer";
import { SgzzMarchRenderer } from "./SgzzMarchRenderer";
import { SgzzMinimap } from "./SgzzMinimap";
import { loadSgzzArtResources, type SgzzArtResources } from "./SgzzArtResources";

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
    private farRenderer: SgzzFarRenderer | null = null;
    private marchRenderer: SgzzMarchRenderer | null = null;
    private minimap: SgzzMinimap | null = null;
    private art: SgzzArtResources | null = null;
    /** 资源加载的代际：路由关掉后晚到的加载结果必须自己 release，⛔ 不能挂上去。 */
    private assetGeneration = 0;
    private details: Label | null = null;
    private status: Label | null = null;
    private title: Label | null = null;
    private offTick: (() => void) | null = null;
    private active = false;
    private homeButton: Node | null = null;
    private homeLabel: Label | null = null;
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

        // ⚠ 这两块底板要有名字：重放据此实测地图可点区，⛔ 不再按百分比猜（猜错 32px = 差一格）
        createSolidPlate(this.root, width, header, PANEL, 0, height / 2 - header / 2, "sgzz-header");
        createSolidPlate(this.root, width, footer, PANEL, 0, -height / 2 + footer / 2, "sgzz-footer");
        this.title = this.label("大地图", 25, TEXT, 0, height / 2 - header * 0.35, width * 0.55);
        this.button("关闭", width * 0.14, 44, width * 0.39, height / 2 - header * 0.35, () => runtime.close());
        // ⚠ 有地时这颗按钮是「回领地」：225 万格上关掉再进来，自己的地可能在几百格外，
        //   没有这个入口就真的找不回去了。无地时退回「回中」（回地图中心）。
        this.homeButton = this.button("回中", width * 0.18, 44, -width * 0.37, height / 2 - header * 0.35,
            () => { this.logic?.locateHome(); this.render(true); });
        // 名字要稳定：文案会在 回中/回领地 之间翻转，⛔ 别让节点名跟着变
        this.homeButton.name = "sgzz-home";
        this.homeLabel = this.homeButton.getComponentInChildren(Label);
        this.label("拖动平移 · 双指/滚轮缩放 · 点选地块", 18, MUTED, 0, height / 2 - header * 0.77, width * 0.9);

        this.details = this.label("点选地图中的一格", 22, TEXT, 0, this.mapBottom - footer * 0.18, width * 0.94);
        this.button("占领 / 加固", width * 0.42, 54, -width * 0.24, this.mapBottom - footer * 0.52,
            () => this.observeAsync(async () => { await this.logic?.occupySelected(); this.render(true); }, "sgzz-occupy"));
        this.button("放弃", width * 0.28, 54, width * 0.26, this.mapBottom - footer * 0.52,
            () => this.observeAsync(async () => { await this.logic?.abandonSelected(); this.render(true); }, "sgzz-abandon"));
        this.status = this.label("", 17, MUTED, 0, -height / 2 + footer * 0.17, width * 0.94);

        this.renderer = new SgzzMapRenderer(world);
        this.marchRenderer = new SgzzMarchRenderer(world);
        this.bindInput(true);
        void this.loadArt();
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
        this.assetGeneration += 1;
        this.bindInput(false);
        this.offTick?.(); this.offTick = null;
        this.renderer?.dispose(); this.renderer = null;
        this.farRenderer?.dispose(); this.farRenderer = null;
        this.marchRenderer?.dispose(); this.marchRenderer = null;
        this.minimap?.dispose(); this.minimap = null;
        this.art?.release(); this.art = null;
        this.logic = null;
    }

    /** 远档底图与缩略图的素材。⚠ 加载完才建远档渲染器与缩略图；失败也照常跑（只是没底图）。 */
    private async loadArt(): Promise<void> {
        const generation = ++this.assetGeneration;
        const art = await loadSgzzArtResources();
        if (!this.active || generation !== this.assetGeneration || !this.world) {
            art.release();   // ★ 晚到的结果自己收，⛔ 不泄露引用
            return;
        }
        this.art = art;
        this.farRenderer = new SgzzFarRenderer(this.world, art);
        const size = Math.min(140, this.layerWidth * 0.32);
        this.minimap = new SgzzMinimap(this.root, size,
            this.layerWidth / 2 - size / 2 - 12, this.mapTop - size / 2 - 14, art,
            (row, col) => { this.logic?.locate(row, col); this.render(true); });
        this.render(true);
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
        // 按钮语义随「有没有地」翻转。⚠ 文案是重放的判据之一，改字要同改 tools/creator-preview/sgzzmap.mjs
        if (this.homeLabel) {
            const want = logic.hasHome ? "回领地" : "回中";
            if (this.homeLabel.string !== want) this.homeLabel.string = want;
        }

        // 世界节点：平移 + 缩放；网格本身建在世界坐标里，⛔ 平移不重建
        const scale = logic.camera.scale;
        this.world.setScale(scale, scale, 1);
        this.world.setPosition(-logic.camera.x * scale, -logic.camera.y * scale + (this.mapBottom + this.mapTop) / 2, 0);

        this.world.active = true;
        if (sgzzIsNearField(logic.camera.lod)) {
            this.renderer.render(logic);
            this.farRenderer?.clear();
        } else {
            // 远档：整幅底图 + 鸟瞰聚合色块，逐格网格整批撤掉
            this.renderer.clear();
            this.farRenderer?.render(logic);
        }
        this.marchRenderer?.render(logic);
        this.minimap?.update(logic);

        const sel = logic.selection;
        if (this.selection) {
            this.selection.active = sel !== null;
            if (sel) {
                const rect = SgzzMapRenderer.selectionRect(sel.row, sel.col, scale);
                const screen = logic.camera.screenAt(rect.x, rect.y);
                const at = sgzzCameraToRootLocal(screen.x, screen.y, this.layerWidth, this.mapTop, this.mapBottom);
                this.selection.setPosition(at.x, at.y, 0);
                this.selection.setScale(scale, scale, 1);
            }
        }

        if (this.title) this.title.string = `大地图 · LOD ${logic.camera.lod}/${SGZZ_LOD_MAX}`;
        if (this.details) this.details.string = this.describe();
        if (this.status) this.status.string = logic.notice;
    }

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
        const pass = sgzzPassableAt(sel.row, sel.col) ? "" : " · 不可通行";
        // ⚠ 按**关系**说话，⛔ 不要把原始 uid 甩给玩家（也让重放能判「这格是不是我的」）
        if (sel.pending) return `(${sel.row}, ${sel.col}) ${terrain?.cn ?? "?"}${pass} · 读取中…`;
        const owner = sel.tile.ownerUid === "" ? "无主"
            : `${sgzzOwnerWord(sel.state)}（守军 ${sel.tile.durability}）`;
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
    /**
     * `getUILocation()` → 相机坐标。
     * ⚠ UI 坐标的原点在**左下**、x∈[0,W]（⛔ 不是居中的），先经 convertToNodeSpaceAR 落到根局部，
     * 再交给纯函数换算 —— 早先直接 `x + layerWidth/2` 把它当居中坐标，结果点哪都选到屏幕外的格。
     */
    private toLocal(x: number, y: number): { x: number; y: number } | null {
        if (!this.logic) return null;
        const local = this.root.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(x, y, 0));
        const lx = local?.x ?? (x - this.layerWidth / 2);
        const ly = local?.y ?? (y - this.layerHeight / 2);
        // ⚠ 手势绑在 root（整页）上，事件会从页眉/页脚的按钮**冒泡**上来。
        // 不挡住地图区之外的点，点「占领」那一下会顺手把选中格换成按钮底下那一格 ——
        // 真机重放里点选到的是 (749,748)、结束时屏幕上却是 (736,778)，就是这么来的。
        if (!sgzzInMapBand(ly, this.mapTop, this.mapBottom)) return null;
        return sgzzRootLocalToCamera(lx, ly, this.layerWidth, this.mapTop, this.mapBottom);
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
        // ⚠ 只对「在地图区起手」的触点收尾：页脚按钮上的 TOUCH_END 冒泡上来时 camera 里没有这个 id，
        // end() 自然回 null，⛔ 不会误判成一次点选。
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

/** 关系态 → 归属说法。与领地着色同一套语义。 */
function sgzzOwnerWord(state: number): string {
    switch (state) {
        case SgzzGridState.MY: case SgzzGridState.MY_ADDITION_LAND: return "我方";
        case SgzzGridState.GANG_MASTER: return "盟主";
        case SgzzGridState.UNION: return "同盟";
        case SgzzGridState.GANG_FRIEND: return "友盟";
        case SgzzGridState.UNION_CAPTURE: case SgzzGridState.FRIEND_UNION_CAPTURE: return "攻占中";
        default: return "敌方";
    }
}
