/** Fullscreen map route: global multi-pointer input, chunk meshes, and a selected-tile action bar. */
import { Color, EventMouse, EventTouch, Game, game, input, Input, JsonAsset, Label, Node, resources, UITransform, Vec3 } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { gridFromTileId, terrainAt, validateSlgTerrain, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";
import { SLG_GRID_PIXELS } from "../logic/mapCamera";
import { SlgMapLogic } from "../logic/SlgMapLogic";
import { getSlgRuntime } from "../logic/slgRuntime";
import { SlgChunkRenderer } from "./SlgChunkRenderer";

const BACK = new Color(19, 29, 32, 255);
const PANEL = new Color(19, 28, 38, 255);
const TEXT = new Color(236, 243, 237, 255);
const MUTED = new Color(150, 176, 180, 255);
const ACCENT = new Color(52, 115, 161, 255);
const MOUSE_POINTER = -1;

export class SlgMapView extends CocosView {
    private logic: SlgMapLogic | null = null;
    private world: Node | null = null;
    private selection: Node | null = null;
    private renderer: SlgChunkRenderer | null = null;
    private terrain: ISlgTerrain | null = null;
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

    protected onOpen(): void {
        this.active = true;
        const width = this.layerWidth, height = this.layerHeight;
        const header = Math.min(150, height * 0.14), footer = Math.min(270, height * 0.26);
        this.mapBottom = -height / 2 + footer;
        this.mapTop = height / 2 - header;
        this.mapCenter = (this.mapBottom + this.mapTop) / 2;
        const runtime = getSlgRuntime();
        this.logic = new SlgMapLogic(runtime, width, this.mapTop - this.mapBottom);
        this.logic.onChanged = () => this.render();
        const scrim = createSolidPlate(this.root, width, height, BACK, 0, 0, "slg-scrim");
        scrim.on(Node.EventType.TOUCH_START, this.swallow, this);
        scrim.on(Node.EventType.TOUCH_END, this.swallow, this);
        this.world = this.node("slg-world", this.root, 0, 0);
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
        this.label("拖动平移  ·  双指 / 滚轮缩放", 18, MUTED, 0, height / 2 - header * 0.77, width * 0.94);
        this.details = this.label("点选地图中的一格", 22, TEXT, 0, this.mapBottom - footer * 0.18, width * 0.94);
        const actionNode = this.button("先点选一格", width * 0.66, 54, 0, this.mapBottom - footer * 0.52,
            () => this.observeAsync(async () => { await this.logic?.capture(); }, "slg-capture"));
        this.action = actionNode.getComponentInChildren(Label);
        this.status = this.label("", 17, MUTED, 0, -height / 2 + footer * 0.17, width * 0.94);
        this.bindInput(true);
        this.offTick = runtime?.tick((dt) => {
            const logic = this.logic;
            if (!logic) return;
            const before = logic.camera.version;
            logic.camera.step(dt);
            if (before !== logic.camera.version) logic.updateViewport();
        }) ?? null;
        this.render();
        void this.loadTerrain();
    }

    protected onCloseLifecycle(): void {
        this.active = false; this.bindInput(false); this.cancelInput(); this.offTick?.(); this.offTick = null;
        this.logic?.dispose(); this.logic = null;
        this.renderer?.dispose(); this.renderer = null; this.terrain = null;
        this.world = null; this.selection = null; this.details = null; this.status = null; this.title = null; this.action = null;
    }

    private async loadTerrain(): Promise<void> {
        const generation = ++this.assetGeneration;
        this.resourceFailed = false;
        try {
            const asset = await new Promise<JsonAsset>((resolve, reject) => {
                resources.load("kits/slg/terrain", JsonAsset, (error, result) => error ? reject(error) : resolve(result));
            });
            if (!this.active || generation !== this.assetGeneration || !this.world || !this.logic) return;
            if (!validateSlgTerrain(asset.json)) throw new Error("SLG terrain content is invalid");
            this.terrain = asset.json;
            this.renderer?.dispose();
            this.renderer = new SlgChunkRenderer(this.world, this.terrain);
            this.logic.updateViewport();
        } catch (error) {
            if (!this.active || generation !== this.assetGeneration || !this.logic) return;
            this.resourceFailed = true;
            this.logic.notice = "地图资源加载失败，请点击刷新重试";
            console.error("[slg] terrain load failed", error);
            this.render();
        }
    }

    private render(): void {
        const logic = this.logic;
        if (!logic || !this.world) return;
        const camera = logic.camera;
        this.world.setScale(camera.scale, camera.scale, 1);
        this.world.setPosition(-camera.x * camera.pixelsPerGrid, this.mapCenter - camera.y * camera.pixelsPerGrid);
        this.renderer?.render(logic.chunkVersions, logic.tiles, logic.runtime?.selfUid() ?? "", camera.lod);
        if (this.title) this.title.string = `${this.terrain?.name ?? "大地图"} · LOD ${camera.lod + 1} · 奖杯 ${logic.trophies}`;
        if (this.status) this.status.string = logic.notice;
        const tile = logic.selectedTile();
        if (this.selection) this.selection.active = tile !== null;
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
                this.selection.active = screenY > this.mapBottom && screenY < this.mapTop;
            }
        }
        if (this.action) {
            this.action.string = logic.busy ? "处理中…" : logic.actionText();
            this.action.color = logic.canCapture() ? TEXT : MUTED;
        }
    }

    private local(event: EventTouch | EventMouse): { x: number; y: number } {
        const point = event.getUILocation();
        const local = this.root.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(point.x, point.y, 0));
        return { x: local?.x ?? point.x - this.layerWidth / 2, y: local?.y ?? point.y - this.layerHeight / 2 };
    }
    private inside(y: number): boolean { return y > this.mapBottom && y < this.mapTop; }
    private now(): number { return this.logic?.runtime?.now() ?? 0; }
    private readonly swallow = (): void => {};
    private readonly onTouchStart = (event: EventTouch): void => {
        this.touchAt = this.now();
        if (this.mouseDown) { this.mouseDown = false; this.logic?.camera.cancel(); }
        const point = this.local(event);
        if (this.inside(point.y)) this.logic?.camera.start(event.getID(), point.x, point.y - this.mapCenter, this.now());
    };
    private readonly onTouchMove = (event: EventTouch): void => {
        const point = this.local(event);
        this.logic?.camera.move(event.getID(), point.x, point.y - this.mapCenter, this.now());
        this.logic?.updateViewport();
    };
    private readonly onTouchEnd = (event: EventTouch): void => {
        this.touchAt = this.now();
        const point = this.logic?.camera.end(event.getID(), this.now());
        if (point) this.logic?.select(point.x, point.y);
    };
    private readonly onTouchCancel = (): void => { this.cancelInput(); };
    private readonly onMouseDown = (event: EventMouse): void => {
        if (event.getButton() !== 0 || this.now() - this.touchAt < 500) return;
        const point = this.local(event);
        if (!this.inside(point.y)) return;
        this.mouseDown = true;
        this.logic?.camera.start(MOUSE_POINTER, point.x, point.y - this.mapCenter, this.now());
    };
    private readonly onMouseMove = (event: EventMouse): void => {
        if (!this.mouseDown) return;
        const point = this.local(event);
        this.logic?.camera.move(MOUSE_POINTER, point.x, point.y - this.mapCenter, this.now());
        this.logic?.updateViewport();
    };
    private readonly onMouseUp = (): void => {
        if (!this.mouseDown) return;
        this.mouseDown = false;
        const point = this.logic?.camera.end(MOUSE_POINTER, this.now());
        if (point) this.logic?.select(point.x, point.y);
    };
    private readonly onMouseWheel = (event: EventMouse): void => {
        const point = this.local(event);
        if (!this.inside(point.y)) return;
        this.logic?.camera.zoom(Math.exp(Math.max(-1, Math.min(1, event.getScrollY() * 0.001))), point.x, point.y - this.mapCenter);
        this.logic?.updateViewport();
    };
    private readonly cancelInput = (): void => { this.mouseDown = false; this.logic?.camera.cancel(); };
    private bindInput(bind: boolean): void {
        const method = bind ? "on" : "off";
        input[method](Input.EventType.TOUCH_START, this.onTouchStart, this);
        input[method](Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input[method](Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input[method](Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        input[method](Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input[method](Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input[method](Input.EventType.MOUSE_UP, this.onMouseUp, this);
        input[method](Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
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
