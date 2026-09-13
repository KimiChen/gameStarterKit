/** Fullscreen map route: foreground multi-pointer input, chunk meshes, and a selected-tile action bar. */
import { Color, EventMouse, EventTouch, Game, game, Label, Node, UITransform, Vec3 } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { SLG_DEFAULT_MAP_ID, gridFromTileId, terrainAt, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";
import { SLG_FAR_LOD, slgFarOwnershipVersion } from "../logic/farLayerMesh";
import { SLG_GRID_PIXELS } from "../logic/mapCamera";
import { installSlgMapDebugGlobal, slgMapDebug } from "../logic/mapDebug";
import { SlgMapLogic } from "../logic/SlgMapLogic";
import { getSlgRuntime } from "../logic/slgRuntime";
import { SlgTilemapRenderer } from "./SlgTilemapRenderer";
import { SlgDecorationRenderer } from "./SlgDecorationRenderer";
import { SlgFarLayerRenderer } from "./SlgFarLayerRenderer";
import { SlgMapSwitcher } from "./SlgMapSwitcher";
import { SlgWorldOverview } from "./SlgWorldOverview";
import { loadSlgArtResources, type SlgArtResources } from "./SlgArtResources";

const BACK = new Color(19, 29, 32, 255);
const PANEL = new Color(19, 28, 38, 255);
const TEXT = new Color(236, 243, 237, 255);
const MUTED = new Color(150, 176, 180, 255);
const ACCENT = new Color(52, 115, 161, 255);
const MOUSE_POINTER = -1;

export class SlgMapView extends CocosView {
    private logic: SlgMapLogic | null = null;
    private world: Node | null = null;
    private terrainLayer: Node | null = null;
    private decorationLayer: Node | null = null;
    private selection: Node | null = null;
    private renderer: SlgTilemapRenderer | null = null;
    private decorationRenderer: SlgDecorationRenderer | null = null;
    private farRenderer: SlgFarLayerRenderer | null = null;
    private overview: SlgWorldOverview | null = null;
    private switcher: SlgMapSwitcher | null = null;
    private art: SlgArtResources | null = null;
    private terrain: ISlgTerrain | null = null;
    /** 会话级地图记忆：重进地图/切图后 reopen 保持上次所选。 */
    private static lastMapId = SLG_DEFAULT_MAP_ID;
    private mapId = SlgMapView.lastMapId;
    private details: Label | null = null;
    private status: Label | null = null;
    private title: Label | null = null;
    private action: Label | null = null;
    private offTick: (() => void) | null = null;
    private active = false;
    private resourceFailed = false;
    private mapBottom = 0;
    private mapTop = 0;
    private mapCenter = 0;
    private touchAt = -Infinity;
    private mouseDown = false;
    private assetGeneration = 0;
    private inputBlockedUntil = -Infinity;
    private farActive = false;
    private uninstallDebug: (() => void) | null = null;

    protected onOpen(): void {
        this.active = true;
        const width = this.layerWidth, height = this.layerHeight;
        const header = Math.min(150, height * 0.14), footer = Math.min(270, height * 0.26);
        this.mapBottom = -height / 2 + footer;
        this.mapTop = height / 2 - header;
        this.mapCenter = (this.mapBottom + this.mapTop) / 2;
        const runtime = getSlgRuntime();
        this.logic = new SlgMapLogic(runtime, this.mapId, width, this.mapTop - this.mapBottom);
        this.logic.onChanged = () => this.render();
        createSolidPlate(this.root, width, height, BACK, 0, 0, "slg-scrim");
        this.world = this.node("slg-world", this.root, 0, 0);
        this.terrainLayer = this.node("slg-terrain-layer", this.world, 0, 0);
        this.decorationLayer = this.node("slg-decoration-layer", this.world, 0, 0);
        this.selection = this.node("slg-selection", this.root, SLG_GRID_PIXELS, SLG_GRID_PIXELS);
        const edge = SLG_GRID_PIXELS / 2 - 1.5;
        for (const [w, h, x, y] of [[SLG_GRID_PIXELS, 3, 0, edge], [SLG_GRID_PIXELS, 3, 0, -edge],
            [3, SLG_GRID_PIXELS - 6, -edge, 0], [3, SLG_GRID_PIXELS - 6, edge, 0]]) {
            createSolidPlate(this.selection, w, h, new Color(255, 224, 119, 255), x, y);
        }
        createSolidPlate(this.root, width, header, PANEL, 0, height / 2 - header / 2);
        createSolidPlate(this.root, width, footer, PANEL, 0, -height / 2 + footer / 2);
        this.title = this.label("大地图 · 加载中", 25, TEXT, 0, height / 2 - header * 0.35, width * 0.55);
        this.button("关闭", width * 0.14, 44, width * 0.39, height / 2 - header * 0.35, () => this.logic?.runtime?.close());
        this.button("刷新", width * 0.14, 44, -width * 0.39, height / 2 - header * 0.35, () => {
            if (this.resourceFailed) void this.loadTerrain();
            this.logic?.refresh();
        });
        this.label("拖动平移  ·  双指 / 滚轮缩放", 18, MUTED, -width * 0.12, height / 2 - header * 0.77, width * 0.68);
        this.button("总览", width * 0.18, 38, width * 0.37, height / 2 - header * 0.77, () => {
            this.overview?.updateViewport(this.logic!.camera.visibleRect());
            this.overview?.setVisible(true);
        });
        // 右上角小地图预览（地图区内右上浮层）：常显当前图绘卷，点击展开五图切换面板。
        const miniSize = Math.min(96, width * 0.24);
        this.switcher = new SlgMapSwitcher(this.root, miniSize, width / 2 - miniSize / 2 - 10, this.mapTop - miniSize / 2 - 14,
            this.mapId, (mapId) => this.switchMap(mapId));
        this.details = this.label("点选地图中的一格", 22, TEXT, 0, this.mapBottom - footer * 0.18, width * 0.94);
        const actionNode = this.button("先点选一格", width * 0.66, 54, 0, this.mapBottom - footer * 0.52,
            () => { if (!this.inputBlocked()) this.observeAsync(async () => { await this.logic?.capture(); }, "slg-capture"); });
        this.action = actionNode.getComponentInChildren(Label);
        this.status = this.label("", 17, MUTED, 0, -height / 2 + footer * 0.17, width * 0.94);
        this.bindInput(true);
        this.uninstallDebug = installSlgMapDebugGlobal();
        this.offTick = runtime?.tick((dt) => {
            const logic = this.logic;
            if (!logic || this.overview?.visible) return;
            const before = logic.camera.version;
            logic.camera.step(dt);
            this.renderer?.update(dt * 1000);
            this.decorationRenderer?.update(dt * 1000);
            if (before !== logic.camera.version) logic.updateViewport();
        }) ?? null;
        this.render();
        void this.loadTerrain();
    }

    protected onCloseLifecycle(): void {
        this.active = false; this.assetGeneration += 1; this.bindInput(false); this.cancelInput(); this.offTick?.(); this.offTick = null;
        this.uninstallDebug?.(); this.uninstallDebug = null;
        this.switcher?.dispose(); this.switcher = null;
        this.logic?.dispose(); this.logic = null;
        this.disposeArt(); this.terrain = null;
        this.farActive = false;
        this.terrainLayer = null; this.decorationLayer = null;
        this.world = null; this.selection = null; this.details = null; this.status = null; this.title = null; this.action = null;
    }

    private async loadTerrain(): Promise<void> {
        const generation = ++this.assetGeneration;
        const mapId = this.mapId;
        this.resourceFailed = false;
        try {
            const art = await loadSlgArtResources(mapId);
            if (!this.active || generation !== this.assetGeneration || mapId !== this.mapId
                || !this.world || !this.terrainLayer || !this.decorationLayer || !this.logic) {
                art.release(); return;
            }
            this.disposeArt();
            this.art = art; this.terrain = art.terrain;
            this.renderer = new SlgTilemapRenderer(this.terrainLayer, this.terrain, art.tiles, art.tileIndex, art.tileset, art.sea);
            this.decorationRenderer = new SlgDecorationRenderer(this.decorationLayer, this.terrain, art.decorations, art.layout);
            this.farRenderer = new SlgFarLayerRenderer(this.world, this.terrain, art.layout, art.decorations, art.island, art.sea);
            this.overview = new SlgWorldOverview(this.root, this.terrain, art.layout.landmarks, art.island, art.overview, art.decorations,
                this.layerWidth, this.mapTop - this.mapBottom, (x, y) => {
                    if (!this.active || !this.logic) return;
                    this.logic.camera.locate(x, y);
                    this.logic.notice = `已定位至 (${x}, ${y})`;
                    this.logic.updateViewport(); this.logic.select(x, y);
                }, () => {
                    this.cancelInput(); this.inputBlockedUntil = this.now() + 350;
                    this.render();
                });
            this.overview.node.setPosition(0, this.mapCenter);
            this.switcher?.setCurrent(mapId);
            this.logic.setLandmarks(art.layout.landmarks);
            this.logic.updateViewport();
        } catch (error) {
            if (!this.active || generation !== this.assetGeneration || !this.logic) return;
            this.disposeArt(); this.terrain = null;
            this.resourceFailed = true;
            this.logic.notice = "地图资源加载失败，请点击刷新重试";
            console.error("[slg] terrain load failed", error);
            this.render();
        }
    }

    /** 小地图面板切图：释放旧图 bundle，重置模型与相机，按新图重载。 */
    private switchMap(mapId: string): void {
        if (!this.active || !this.logic || mapId === this.mapId) return;
        this.mapId = mapId;
        SlgMapView.lastMapId = mapId;
        this.cancelInput();
        this.inputBlockedUntil = this.now() + 350;
        this.disposeArt(); this.terrain = null;
        this.logic.switchMap(mapId);
        this.logic.notice = "地图加载中…";
        this.render();
        void this.loadTerrain();
    }

    private disposeArt(): void {
        this.overview?.dispose(); this.overview = null;
        this.farRenderer?.dispose(); this.farRenderer = null;
        this.decorationRenderer?.dispose(); this.decorationRenderer = null;
        this.renderer?.dispose(); this.renderer = null;
        this.art?.release(); this.art = null;
    }

    private render(): void {
        const logic = this.logic;
        if (!this.active || !logic || !this.world) return;
        const camera = logic.camera;
        const lod = slgMapDebug.forceLod ?? camera.lod;
        const overviewVisible = this.overview?.visible ?? false;
        this.world.active = !overviewVisible;
        this.world.setScale(camera.scale, camera.scale, 1);
        this.world.setPosition(-camera.x * camera.pixelsPerGrid, this.mapCenter - camera.y * camera.pixelsPerGrid);
        const far = lod >= SLG_FAR_LOD;
        if (far !== this.farActive) {
            // 进出远档一次性硬切：整批 chunk 网格换一张整图层（批量场景不走单块淡出）。
            this.farActive = far;
            this.renderer?.clear();
            this.decorationRenderer?.clear();
        }
        this.farRenderer?.setVisible(far);
        this.renderer?.setSeaVisible(!far);
        if (far) {
            this.farRenderer?.render(logic.tiles, logic.runtime?.selfUid() ?? "",
                slgFarOwnershipVersion(logic.tiles, logic.chunkVersions));
        } else {
            this.renderer?.render(logic.chunkVersions, logic.tiles, logic.runtime?.selfUid() ?? "", lod);
            this.decorationRenderer?.render(logic.chunkVersions, lod);
        }
        this.overview?.updateViewport(camera.visibleRect());
        if (this.title) this.title.string = `${this.terrain?.name ?? "大地图"} · LOD ${lod + 1}`
            + `${slgMapDebug.forceLod !== null ? "（GM）" : ""} · 奖杯 ${logic.trophies}`;
        if (this.status) this.status.string = logic.notice;
        const tile = logic.selectedTile();
        if (this.selection) this.selection.active = tile !== null && !overviewVisible;
        if (tile) {
            const point = gridFromTileId(tile.tileId);
            const owner = !tile.ownerUid ? "无主" : tile.ownerUid === logic.runtime?.selfUid() ? "我方" : `敌方 ${tile.ownerUid}`;
            const terrain = this.terrain ? terrainAt(this.terrain, point.x, point.y).id : "?";
            if (this.details) this.details.string = `(${point.x}, ${point.y}) · 地形 ${terrain} · ${owner} · 守备 ${tile.guardPower}`;
            if (this.selection) {
                this.selection.setScale(camera.scale, camera.scale, 1);
                this.selection.setPosition((point.x + 0.5 - camera.x) * camera.pixelsPerGrid,
                    this.mapCenter + (point.y + 0.5 - camera.y) * camera.pixelsPerGrid);
                const screenY = this.mapCenter + (point.y + 0.5 - camera.y) * camera.pixelsPerGrid;
                this.selection.active = !overviewVisible && screenY > this.mapBottom && screenY < this.mapTop;
            }
        }
        if (this.action) {
            this.action.string = logic.busy ? "处理中…" : logic.actionText();
            this.action.color = !overviewVisible && logic.canCapture() ? TEXT : MUTED;
        }
    }

    private local(event: EventTouch | EventMouse): { x: number; y: number } {
        const point = event.getUILocation();
        const local = this.root.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(point.x, point.y, 0));
        return { x: local?.x ?? point.x - this.layerWidth / 2, y: local?.y ?? point.y - this.layerHeight / 2 };
    }
    private inside(y: number): boolean { return y > this.mapBottom && y < this.mapTop; }
    /** 小地图浮层区域（右上）：落在其中的点不启动地图手势（节点自身另开切换面板）。 */
    private onMinimap(point: { x: number; y: number }): boolean {
        const mini = this.switcher?.minimap;
        if (!mini || !mini.active) return false;
        const transform = mini.getComponent(UITransform);
        if (!transform) return false;
        const pos = mini.position;
        return Math.abs(point.x - pos.x) <= transform.width / 2 && Math.abs(point.y - pos.y) <= transform.height / 2;
    }
    private now(): number { return this.logic?.runtime?.now() ?? 0; }
    private inputBlocked(): boolean { return !this.active || !!this.overview?.visible || !!this.switcher?.opened || this.now() < this.inputBlockedUntil; }
    private readonly onTouchStart = (event: EventTouch): void => {
        if (this.inputBlocked()) return;
        this.touchAt = this.now();
        if (this.mouseDown) { this.mouseDown = false; this.logic?.camera.cancel(); }
        const point = this.local(event);
        if (this.onMinimap(point)) return;
        if (this.inside(point.y)) this.logic?.camera.start(event.getID(), point.x, point.y - this.mapCenter, this.now());
    };
    private readonly onTouchMove = (event: EventTouch): void => {
        if (this.inputBlocked()) return;
        const point = this.local(event);
        this.logic?.camera.move(event.getID(), point.x, point.y - this.mapCenter, this.now());
        this.logic?.updateViewport();
    };
    private readonly onTouchEnd = (event: EventTouch): void => {
        if (this.inputBlocked()) return;
        this.touchAt = this.now();
        const point = this.logic?.camera.end(event.getID(), this.now());
        if (point) this.logic?.select(point.x, point.y);
    };
    private readonly onTouchCancel = (): void => { this.cancelInput(); };
    private readonly onMouseDown = (event: EventMouse): void => {
        if (this.inputBlocked() || event.getButton() !== 0 || this.now() - this.touchAt < 500) return;
        const point = this.local(event);
        if (!this.inside(point.y) || this.onMinimap(point)) return;
        this.mouseDown = true;
        this.logic?.camera.start(MOUSE_POINTER, point.x, point.y - this.mapCenter, this.now());
    };
    private readonly onMouseMove = (event: EventMouse): void => {
        if (this.inputBlocked() || !this.mouseDown) return;
        const point = this.local(event);
        this.logic?.camera.move(MOUSE_POINTER, point.x, point.y - this.mapCenter, this.now());
        this.logic?.updateViewport();
    };
    private readonly onMouseUp = (): void => {
        if (this.inputBlocked() || !this.mouseDown) return;
        this.mouseDown = false;
        const point = this.logic?.camera.end(MOUSE_POINTER, this.now());
        if (point) this.logic?.select(point.x, point.y);
    };
    private readonly onMouseWheel = (event: EventMouse): void => {
        if (this.inputBlocked()) return;
        const point = this.local(event);
        if (!this.inside(point.y)) return;
        this.logic?.camera.zoom(Math.exp(Math.max(-1, Math.min(1, event.getScrollY() * 0.001))), point.x, point.y - this.mapCenter);
        this.logic?.updateViewport();
    };
    private readonly cancelInput = (): void => { this.mouseDown = false; this.logic?.camera.cancel(); };
    private bindInput(bind: boolean): void {
        const method = bind ? "on" : "off";
        // Creator dispatches UI events before global input. The fullscreen foreground
        // node must receive them so the Settings ScrollView underneath cannot consume them.
        // Keep the listeners while overview is visible: inputBlocked guards map movement,
        // while node hit testing still shields the background page.
        this.root[method](Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.root[method](Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.root[method](Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.root[method](Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        this.root[method](Node.EventType.MOUSE_DOWN, this.onMouseDown, this);
        this.root[method](Node.EventType.MOUSE_MOVE, this.onMouseMove, this);
        this.root[method](Node.EventType.MOUSE_UP, this.onMouseUp, this);
        this.root[method](Node.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
        this.root[method](Node.EventType.MOUSE_LEAVE, this.cancelInput, this);
        game[method](Game.EVENT_HIDE, this.cancelInput, this);
    }
    private node(name: string, parent: Node, width: number, height: number): Node {
        const node = new Node(name); node.layer = parent.layer;
        const transform = node.addComponent(UITransform); transform.width = width; transform.height = height;
        parent.addChild(node); return node;
    }
    private label(text: string, size: number, color: Color, x: number, y: number, width: number, parent = this.root): Label {
        const node = this.node("label", parent, width, size * 2.5); node.setPosition(x, y);
        const label = node.addComponent(Label); label.string = text; label.fontSize = size; label.lineHeight = size * 1.25;
        label.color = color; label.horizontalAlign = Label.HorizontalAlign.CENTER; label.overflow = Label.Overflow.SHRINK;
        return label;
    }
    private button(text: string, width: number, height: number, x: number, y: number, onTap: () => void): Node {
        const node = createSolidPlate(this.root, width, height, ACCENT, x, y, `slg-${text}`);
        this.label(text, 22, TEXT, 0, 0, width * 0.95, node);
        node.on(Node.EventType.TOUCH_END, onTap, this); return node;
    }
}
