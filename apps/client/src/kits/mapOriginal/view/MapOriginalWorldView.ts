/**
 * 原版大地图全屏路由：多指输入 + 合并网格 + **画面设置**面板。
 *
 * ⚠ 只有一台正交 UI 相机（`docs/3d.md` 零实施）：一切经 UIMeshRenderer 走 2D UI 管线，
 *   深度**只有兄弟序**，⛔ 不要指望 z。
 * ⚠ 实心矩形一律走 `createSolidPlate`，⛔ 不要每块一个 `Graphics`（docs/CLIENT.md §3：
 *   每个 Graphics 固定吃 ~2.25 MB 显存）。
 * ⚠ 平移**只动 world 节点 transform**，⛔ 不重建网格。
 *
 * 三套坐标（抄自 sgzzmap，⛔ 别混）：
 *   UI 坐标 `event.getUILocation()`：原点**左下**、x∈[0,W]；
 *   根局部 `convertToNodeSpaceAR`：原点**屏幕中心**、y 向上；
 *   相机坐标：原点**地图区左上**、y 向**下**，尺寸 (layerWidth, mapTop−mapBottom)。
 * ⛔ 直接拿 UI 坐标当居中坐标用 —— sgzzmap 为此「点哪都选到屏幕外的格」。
 */
import { Color, EventMouse, EventTouch, Label, Node, Sprite, UITransform, Vec3 } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { MAPO_LOD_MAX, MAPO_MAP_COLS, MAPO_MAP_ROWS, mapoGrid2Pos } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { MAPO_DISPLAY_BY_ID, MAPO_DISPLAY_PALETTE } from "../../../shared/kits/mapOriginal/content/display.data";
import { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";
import { mapoInMapBand, mapoRootLocalToCamera } from "../logic/mapoCamera";
import { mapoIsNearField } from "../logic/mapoLayers";
import { mapoSelectionEdges } from "../logic/mapoMesh";
import { mapoRuntimeOrNull } from "../logic/mapoRuntime";
import { mapoSetDisplayTerrain } from "../logic/mapoTerrain";
import {
    MAPO_COLOR_LABELS, MAPO_QUALITY_LABELS, MAPO_SANDBOX_LABELS,
    type MapoColorMode, type MapoQuality, type MapoSandboxMode,
} from "../logic/mapoSettings";
import type { MapoRgb } from "../logic/mapoPalette";
import { MapoViewportStencil } from "../logic/mapoViewport";
import { MapoMapRenderer } from "./MapoMapRenderer";
import { MapoFarRenderer } from "./MapoFarRenderer";
import { MapoMinimap } from "./MapoMinimap";
import { loadMapoArt, type MapoArtResources } from "./MapoArtResources";

const BACK = new Color(20, 24, 22, 255);
const PANEL = new Color(24, 30, 28, 235);
const TEXT = new Color(236, 243, 237, 255);
const MUTED = new Color(140, 160, 152, 255);
const DISABLED = new Color(96, 106, 102, 255);
const ACCENT = new Color(58, 96, 84, 255);
const CHIP_ON = new Color(92, 148, 126, 255);
const MARK = new Color(255, 255, 255, 255);

/** 面板里一个可点档位。⚠ `on()` 决定高亮，`enabled()` 决定能不能点。 */
interface Chip {
    readonly node: Node;
    readonly plate: Node;
    readonly label: Label;
    readonly on: () => boolean;
    readonly enabled: () => boolean;
}

export class MapOriginalWorldView extends CocosView {
    private logic: MapOriginalWorldLogic | null = null;
    private world: Node | null = null;
    private selection: Node | null = null;
    private renderer: MapoMapRenderer | null = null;
    private farRenderer: MapoFarRenderer | null = null;
    private minimap: MapoMinimap | null = null;
    private art: MapoArtResources | null = null;
    /** 资源加载的代际：路由关掉后晚到的加载结果必须自己 release，⛔ 不能挂上去。 */
    private assetGeneration = 0;
    private titleLabel: Label | null = null;
    private status: Label | null = null;
    private detail: Label | null = null;
    private chips: Chip[] = [];
    private offTick: (() => void) | null = null;
    private readonly stencil = new MapoViewportStencil();
    /** ⚠ **根局部 y 边界**，⛔ 不是页眉/页脚高度。 */
    private mapTop = 0;
    private mapBottom = 0;
    private lastKey = "";
    private bound = false;

    protected onOpen(): void {
        const w = this.layerWidth, h = this.layerHeight;
        const headerH = Math.min(150, h * 0.14);
        const footerH = Math.min(270, h * 0.26);
        this.mapTop = h / 2 - headerH;
        this.mapBottom = -h / 2 + footerH;
        createSolidPlate(this.root, w, h, BACK, 0, 0, "mapo-back");

        this.world = new Node("mapo-world");
        this.world.layer = this.root.layer;
        this.world.addComponent(UITransform);
        this.root.addChild(this.world);

        // ⚠ 重放契约节点：不可见、只有 UITransform，位置 = 地图区正中
        const anchor = new Node("mapo-map-anchor");
        anchor.layer = this.root.layer;
        anchor.addComponent(UITransform);
        anchor.setPosition(0, (this.mapTop + this.mapBottom) / 2, 0);
        this.root.addChild(anchor);

        this.logic = new MapOriginalWorldLogic(w, this.mapTop - this.mapBottom);
        this.buildHeader(w, headerH);
        this.buildFooter(w, footerH);
        this.buildSettings(w);
        this.buildSelection();

        // ⚠ 用 **16 类显示层**调色板，⛔ 不是 4 类通行层那份（拿 16 类 id 去查它会显示成「可走陆地」）
        const base: MapoRgb[] = MAPO_DISPLAY_PALETTE.map((e) => e.color as MapoRgb);
        this.renderer = new MapoMapRenderer(this.world, null, base);
        this.farRenderer = new MapoFarRenderer(this.world, null);

        const generation = ++this.assetGeneration;
        void loadMapoArt().then((art) => {
            if (generation !== this.assetGeneration) { art.release(); return; }   // 晚到就自己收
            this.art = art;
            if (art.terrain) {
                try { mapoSetDisplayTerrain(art.terrain.buffer()); } catch { /* 退回通行层 */ }
            }
            this.renderer?.dispose();
            this.farRenderer?.dispose();
            this.renderer = new MapoMapRenderer(this.world!, art, base);
            this.farRenderer = new MapoFarRenderer(this.world!, art);
            this.minimap = new MapoMinimap(this.root, 180, w / 2 - 110, this.mapBottom + 110, art,
                (row, col) => { this.logic?.centerOn(row, col); this.refresh(true); });
            this.refresh(true);
        });

        const rt = mapoRuntimeOrNull();
        if (rt) this.offTick = rt.tick((dt) => this.onTick(dt));
        this.bindInput(true);
        this.refresh(true);
    }

    protected onCloseLifecycle(): void {
        this.assetGeneration += 1;
        this.bindInput(false);
        this.offTick?.(); this.offTick = null;
        this.renderer?.dispose(); this.renderer = null;
        this.farRenderer?.dispose(); this.farRenderer = null;
        this.minimap?.dispose(); this.minimap = null;
        this.art?.release(); this.art = null;
        this.chips = [];
        this.logic = null;
    }

    // ── 骨架 ────────────────────────────────────────────────────────────────

    private label(parent: Node, name: string, text: string, size: number, color: Color,
                  x: number, y: number, width: number): Label {
        const node = new Node(name);
        node.layer = parent.layer;
        const t = node.addComponent(UITransform);
        t.width = width; t.height = size + 8;
        const label = node.addComponent(Label);
        label.string = text; label.fontSize = size; label.lineHeight = size + 4;
        label.color = color;
        node.setPosition(x, y, 0);
        parent.addChild(node);
        return label;
    }

    private buildHeader(w: number, headerH: number): void {
        const header = new Node("mapo-header");
        header.layer = this.root.layer;
        header.addComponent(UITransform);
        this.root.addChild(header);
        createSolidPlate(header, w, headerH, PANEL, 0, 0, "mapo-header-plate");
        header.setPosition(0, this.mapTop + headerH / 2, 0);
        this.titleLabel = this.label(header, "mapo-title", "原版大地图 · LOD 0/5", 26, TEXT, 0, 16, w);
        this.status = this.label(header, "mapo-status", "", 18, MUTED, 0, -16, w);
    }

    private buildFooter(w: number, footerH: number): void {
        const footer = new Node("mapo-footer");
        footer.layer = this.root.layer;
        footer.addComponent(UITransform);
        this.root.addChild(footer);
        createSolidPlate(footer, w, footerH, PANEL, 0, 0, "mapo-footer-plate");
        footer.setPosition(0, this.mapBottom - footerH / 2, 0);
        this.detail = this.label(footer, "mapo-detail", "点选地块查看详情", 22, TEXT, 0, footerH / 2 - 40, w);
    }

    /** 选中框：四条贴边的短条，⛔ 不铺整格（整格会盖住地表）。 */
    private buildSelection(): void {
        const sel = new Node("mapo-selection");
        sel.layer = this.root.layer;
        sel.addComponent(UITransform);
        sel.active = false;
        this.root.addChild(sel);
        for (const [i, e] of mapoSelectionEdges(2, 1).entries()) {
            // ⚠ 2D 旋转用 `angle`（度），⛔ 别用 setRotationFromEuler：UI 管线下只有 z 有意义
            createSolidPlate(sel, e.length, e.thickness, MARK, e.x, e.y, `mapo-sel-${i}`).angle = e.angle;
        }
        this.selection = sel;
    }

    /** 画面设置：沙盘模式 / 镜头视角 / 色彩模式 / 画质。不可用的档位置灰并写明原因。 */
    private buildSettings(w: number): void {
        const panel = new Node("mapo-settings");
        panel.layer = this.root.layer;
        panel.addComponent(UITransform);
        panel.setPosition(-w / 2 + 130, (this.mapTop + this.mapBottom) / 2, 0);
        this.root.addChild(panel);
        createSolidPlate(panel, 240, 330, PANEL, 0, 0, "mapo-settings-plate");
        this.label(panel, "mapo-settings-title", "画面设置", 22, TEXT, 0, 140, 220);

        let y = 100;
        const row = (title: string, id: string,
                     chips: readonly { text: string; apply: () => void;
                                       on: () => boolean; enabled: () => boolean }[]) => {
            this.label(panel, `mapo-set-${id}`, title, 18, MUTED, -95, y, 200);
            y -= 26;
            let x = -95;
            for (const c of chips) {
                const node = new Node(`mapo-chip-${id}-${c.text}`);
                node.layer = panel.layer;
                const t = node.addComponent(UITransform);
                t.width = 60; t.height = 26;
                node.setPosition(x + 30, y, 0);
                panel.addChild(node);
                const plate = createSolidPlate(node, 58, 24, ACCENT, 0, 0, "chip-plate");
                const label = this.label(node, "chip-label", c.text, 15, TEXT, 0, 0, 58);
                node.on(Node.EventType.TOUCH_END, () => {
                    if (!c.enabled()) return;
                    c.apply();
                    this.refresh(true);
                }, this);
                this.chips.push({ node, plate, label, on: c.on, enabled: c.enabled });
                x += 64;
            }
            y -= 34;
        };
        const set = (patch: Record<string, unknown>) => {
            const l = this.logic; if (!l) return;
            l.setGraphics({ ...l.graphics, ...patch });
        };
        row("沙盘模式", "sandbox", (["2d", "3d"] as MapoSandboxMode[]).map((m) => ({
            text: MAPO_SANDBOX_LABELS[m],
            apply: () => set({ sandbox: m }),
            on: () => this.logic?.graphics.sandbox === m,
            // ⚠ 3D 置灰的理由与原作同义：框架 Stage3D 未实施，⛔ 不在 kit 内自建相机
            enabled: () => m === "2d",
        })));
        row("镜头视角", "camera", [{
            text: "鸟瞰",
            apply: () => set({ birdview: !this.logic?.graphics.birdview }),
            on: () => this.logic?.graphics.birdview === true,
            // 原作：「2D沙盘不支持鸟瞰视角」
            enabled: () => this.logic?.graphics.sandbox === "3d",
        }]);
        row("色彩模式", "color", (["standard", "vivid", "muted"] as MapoColorMode[]).map((m) => ({
            text: MAPO_COLOR_LABELS[m], apply: () => set({ colorMode: m }),
            on: () => this.logic?.graphics.colorMode === m, enabled: () => true,
        })));
        row("画质", "quality", (["smooth", "normal", "high", "ultra"] as MapoQuality[]).map((m) => ({
            text: MAPO_QUALITY_LABELS[m], apply: () => set({ quality: m }),
            on: () => this.logic?.graphics.quality === m, enabled: () => true,
        })));
    }

    // ── 输入 ────────────────────────────────────────────────────────────────

    private bindInput(on: boolean): void {
        if (on === this.bound) return;
        this.bound = on;
        const node = this.root;
        const method = on ? "on" : "off";
        node[method](Node.EventType.TOUCH_START, this.onTouchStart, this);
        node[method](Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        node[method](Node.EventType.TOUCH_END, this.onTouchEnd, this);
        node[method](Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        node[method](Node.EventType.MOUSE_WHEEL, this.onWheel, this);
    }

    /**
     * UI 坐标 → 相机坐标；落在地图区之外回 null。
     * ⚠ 手势绑在整页 root 上，页眉/页脚按钮的触摸会**冒泡**上来 —— 不挡住就会出现
     *   「点设置里的档位顺手把选中格换成按钮底下那一格」。
     */
    private toLocal(x: number, y: number): { x: number; y: number } | null {
        const local = this.root.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(x, y, 0));
        const lx = local?.x ?? (x - this.layerWidth / 2);
        const ly = local?.y ?? (y - this.layerHeight / 2);
        if (!mapoInMapBand(ly, this.mapTop, this.mapBottom)) return null;
        return mapoRootLocalToCamera(lx, ly, this.layerWidth, this.mapTop, this.mapBottom);
    }

    /** ⚠ Node 的 TOUCH_* 是**逐触点**派发的：一次事件一根手指，⛔ 别去找 getTouches()。 */
    private onTouchStart(event: EventTouch): void {
        const l = this.logic; if (!l) return;
        const p = this.toLocal(event.getUILocation().x, event.getUILocation().y);
        if (!p) return;
        l.camera.start(event.getID(), p.x, p.y, Date.now());
    }

    private onTouchMove(event: EventTouch): void {
        const l = this.logic; if (!l) return;
        const p = this.toLocal(event.getUILocation().x, event.getUILocation().y);
        if (!p) return;
        l.camera.move(event.getID(), p.x, p.y, Date.now());
        this.refresh(false);
    }

    private onTouchEnd(event: EventTouch): void {
        const l = this.logic; if (!l) return;
        // ⚠ 只对「在地图区起手」的触点收尾：页脚按钮上的 TOUCH_END 冒泡上来时 camera 里没有这个 id
        const tapped = l.camera.end(event.getID(), Date.now());
        if (tapped) this.applySelection(tapped.row, tapped.col);
        this.refresh(true);
    }

    private onTouchCancel(): void { this.logic?.camera.cancel(); }

    private onWheel(event: EventMouse): void {
        const l = this.logic; if (!l) return;
        const p = this.toLocal(event.getUILocation().x, event.getUILocation().y);
        if (!p) return;
        l.camera.zoom(event.getScrollY() > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
        this.refresh(true);
    }

    private onTick(dt: number): void {
        const l = this.logic; if (!l) return;
        l.camera.step(dt);
        this.refresh(false);
    }

    private applySelection(row: number, col: number): void {
        const l = this.logic; if (!l) return;
        const info = l.select({ row, col });
        if (!info || !this.detail) return;
        const name = MAPO_DISPLAY_BY_ID.get(info.classId)?.cn ?? `#${info.classId}`;
        // ⚠ 显示层没到位时标注出来，⛔ 不拿退回值冒充真相
        this.detail.string = `(${info.row}, ${info.col}) ${name}`
            + `${info.passable ? "" : " · 不可通行"}${info.detailed ? "" : " · 读取中…"}`;
    }

    // ── 渲染 ────────────────────────────────────────────────────────────────

    private refresh(force: boolean): void {
        const l = this.logic; if (!l || !this.world) return;
        const cam = l.camera;
        // ⚠ 平移只动父节点 transform，⛔ 不重建网格。
        // ★ 世界 → 根局部：rootX = (wx − cam.x)·scale；rootY = centre + (wy − cam.y)·scale
        //   （根局部 x 的中心是 0，y 的中心是地图区中点 centre；世界 y 与根局部 y **同向朝上**）。
        //   ⛔ 别拿「相机坐标原点」当节点位置用 —— 相机坐标的原点在地图区**左上**且 y 向下，
        //   混进来会把整张网格推到屏幕外（真机重放 run 5：地图区全黑、只剩选中框）。
        const bandCentre = (this.mapTop + this.mapBottom) / 2;
        this.world.setPosition(-cam.x * cam.scale, bandCentre - cam.y * cam.scale, 0);
        this.world.setScale(cam.scale, cam.scale, 1);

        const sel = l.selectedCell;
        if (this.selection) {
            this.selection.active = sel !== null;
            if (sel !== null) {
                // 与 world 节点**同一套换算**，⛔ 不要另写一份（两份迟早对不上）
                const p = mapoGrid2Pos(Math.floor(sel / 10000), sel % 10000);
                this.selection.setPosition((p.x - cam.x) * cam.scale,
                    (this.mapTop + this.mapBottom) / 2 + (p.y - cam.y) * cam.scale, 0);
                this.selection.setScale(cam.scale, cam.scale, 1);
            }
        }

        const centre = cam.centreCell();
        const near = mapoIsNearField(cam.lod);
        const key = `${cam.lod}|${l.graphics.colorMode}|${l.graphics.quality}|${centre.row}|${centre.col}`;
        if (!force && key === this.lastKey) return;
        this.lastKey = key;

        if (near) {
            this.farRenderer?.clear();
            // ⚠ 可视格用偏移模板：平移时只换中心格，⛔ 不每帧重算整套偏移
            this.stencil.refresh(cam.scale, this.layerWidth, this.mapTop - this.mapBottom);
            const cells: { row: number; col: number }[] = [];
            this.stencil.forEach(centre.row, centre.col, MAPO_MAP_ROWS, MAPO_MAP_COLS,
                (row, col) => { cells.push({ row, col }); });
            this.renderer?.render(l, cells);
        } else {
            this.renderer?.clear();
            this.farRenderer?.render(l);
        }
        if (this.titleLabel) this.titleLabel.string = `原版大地图 · LOD ${cam.lod}/${MAPO_LOD_MAX}`;
        if (this.status) {
            const layers = l.layers.join(" / ") || "（无）";
            const g = l.graphics;
            // ⚠ 画面设置写进**渲染出来的文本**：真引擎重放据此判定档位是否真的生效，
            //   ⛔ 不让重放去调 Logic 读内部状态。
            const graphics = `${MAPO_SANDBOX_LABELS[g.sandbox]}/${MAPO_COLOR_LABELS[g.colorMode]}`
                + `/${MAPO_QUALITY_LABELS[g.quality]}${g.birdview ? "/鸟瞰" : ""}`;
            this.status.string = `s1 · ${near ? "近档" : "远档"} · 画面：${graphics} · 层：${layers}`;
        }
        // ⚠ 置灰与高亮是**两件事**：enabled 决定能不能点（文字变灰），on 决定当前选中（底板变亮）
        for (const chip of this.chips) {
            const enabled = chip.enabled();
            chip.label.color = enabled ? TEXT : DISABLED;
            const sprite = chip.plate.getComponent(Sprite);
            if (sprite) sprite.color = enabled && chip.on() ? CHIP_ON : ACCENT;
        }
    }
}
