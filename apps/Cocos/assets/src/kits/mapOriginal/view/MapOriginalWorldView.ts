/**
 * 原版大地图全屏路由：多指输入 + 合并网格 + **画面设置**面板。
 *
 * ⚠ 只有一台正交 UI 相机（`docs/3d.md` 零实施）：一切经 UIMeshRenderer 走 2D UI 管线，
 *   深度**只有兄弟序**，⛔ 不要指望 z。
 * ⚠ 实心矩形一律走 `createSolidPlate`，⛔ 不要每块一个 `Graphics`（docs/CLIENT.md §3：
 *   每个 Graphics 固定吃 ~2.25 MB 显存）。
 * ⚠ 平移**只动 world 节点 transform**，⛔ 不重建网格。
 */
import { Color, EventMouse, EventTouch, Label, Node, UITransform } from "cc";
import { CocosView } from "../../../view/CocosView";
import { createSolidPlate } from "../../../view/uiPlate";
import { MAPO_MAP_COLS, MAPO_MAP_ROWS } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { MAPO_TERRAIN_PALETTE } from "../../../shared/kits/mapOriginal/content/terrain.data";
import { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";
import { mapoCameraToRootLocal, mapoInMapBand, mapoRootLocalToCamera } from "../logic/mapoCamera";
import { mapoIsNearField } from "../logic/mapoLayers";
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

/** 面板里一个可点档位。 */
interface Chip { readonly node: Node; readonly label: Label; readonly apply: () => void }

export class MapOriginalWorldView extends CocosView {
    private logic: MapOriginalWorldLogic | null = null;
    private world: Node | null = null;
    private renderer: MapoMapRenderer | null = null;
    private farRenderer: MapoFarRenderer | null = null;
    private minimap: MapoMinimap | null = null;
    private art: MapoArtResources | null = null;
    /** 资源加载的代际：路由关掉后晚到的加载结果必须自己 release，⛔ 不能挂上去。 */
    private assetGeneration = 0;
    private status: Label | null = null;
    private detail: Label | null = null;
    private chips: Chip[] = [];
    private offTick: (() => void) | null = null;
    private stencil = new MapoViewportStencil();
    private mapTop = 0;
    private mapBottom = 0;
    private lastKey = "";

    protected onOpen(): void {
        const w = this.layerWidth, h = this.layerHeight;
        this.mapTop = Math.min(150, h * 0.14);
        this.mapBottom = Math.min(270, h * 0.26);
        createSolidPlate(this.root, w, h, BACK, 0, 0, "mapo-back");

        this.world = new Node("mapo-world");
        this.world.layer = this.root.layer;
        this.world.addComponent(UITransform);
        this.root.addChild(this.world);

        // ⚠ 重放契约节点：不可见、只有 UITransform，位置 = 地图区正中
        const anchor = new Node("mapo-map-anchor");
        anchor.layer = this.root.layer;
        anchor.addComponent(UITransform);
        anchor.setPosition(0, (this.mapBottom - this.mapTop) / 2, 0);
        this.root.addChild(anchor);

        this.logic = new MapOriginalWorldLogic(w, h - this.mapTop - this.mapBottom);
        this.buildHeader(w, h);
        this.buildFooter(w, h);
        this.buildSettings(w);

        const base: MapoRgb[] = MAPO_TERRAIN_PALETTE.map((e) => e.color as MapoRgb);
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
            this.minimap = new MapoMinimap(this.root, 180, w / 2 - 100, -h / 2 + 140, art,
                (row, col) => { this.logic?.centerOn(row, col); this.refresh(true); });
            this.refresh(true);
        });

        const rt = mapoRuntimeOrNull();
        if (rt) this.offTick = rt.tick((dt) => this.onTick(dt));
        this.refresh(true);
    }

    protected onCloseLifecycle(): void {
        this.assetGeneration += 1;
        this.offTick?.(); this.offTick = null;
        this.renderer?.dispose(); this.renderer = null;
        this.farRenderer?.dispose(); this.farRenderer = null;
        this.minimap?.dispose(); this.minimap = null;
        this.art?.release(); this.art = null;
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

    private buildHeader(w: number, h: number): void {
        const header = new Node("mapo-header");
        header.layer = this.root.layer;
        header.addComponent(UITransform);
        this.root.addChild(header);
        createSolidPlate(header, w, this.mapTop, PANEL, 0, 0, "mapo-header-plate");
        header.setPosition(0, h / 2 - this.mapTop / 2, 0);
        this.label(header, "mapo-title", "原版大地图 · 中原（s1）", 28, TEXT, 0, 18, w);
        this.status = this.label(header, "mapo-status", "", 20, MUTED, 0, -16, w);
    }

    private buildFooter(w: number, h: number): void {
        const footer = new Node("mapo-footer");
        footer.layer = this.root.layer;
        footer.addComponent(UITransform);
        this.root.addChild(footer);
        createSolidPlate(footer, w, this.mapBottom, PANEL, 0, 0, "mapo-footer-plate");
        footer.setPosition(0, -h / 2 + this.mapBottom / 2, 0);
        this.detail = this.label(footer, "mapo-detail", "点选地块查看详情", 22, TEXT, 0, 40, w);
    }

    /** 画面设置：沙盘模式 / 镜头视角 / 色彩模式 / 画质。不可用的档位置灰并写明原因。 */
    private buildSettings(w: number): void {
        const panel = new Node("mapo-settings");
        panel.layer = this.root.layer;
        panel.addComponent(UITransform);
        panel.setPosition(-w / 2 + 130, 0, 0);
        this.root.addChild(panel);
        createSolidPlate(panel, 240, 330, PANEL, 0, 0, "mapo-settings-plate");
        this.label(panel, "mapo-settings-title", "画面设置", 22, TEXT, 0, 140, 220);

        let y = 100;
        const row = (title: string, chips: readonly { text: string; apply: () => void; enabled: () => boolean }[]) => {
            this.label(panel, `mapo-set-${title}`, title, 18, MUTED, -95, y, 200);
            y -= 26;
            let x = -95;
            for (const c of chips) {
                const node = new Node(`mapo-chip-${c.text}`);
                node.layer = panel.layer;
                const t = node.addComponent(UITransform);
                t.width = 62; t.height = 26;
                node.setPosition(x + 31, y, 0);
                panel.addChild(node);
                createSolidPlate(node, 60, 24, ACCENT, 0, 0, "chip-plate");
                const label = this.label(node, "chip-label", c.text, 16, TEXT, 0, 0, 60);
                this.chips.push({
                    node, label,
                    apply: () => { if (c.enabled()) { c.apply(); this.refresh(true); } },
                });
                node.on(Node.EventType.TOUCH_END, () => { if (c.enabled()) { c.apply(); this.refresh(true); } }, this);
                x += 66;
            }
            y -= 34;
        };
        const set = (patch: Record<string, unknown>) => {
            const l = this.logic; if (!l) return;
            l.setGraphics({ ...l.graphics, ...patch });
        };
        row("沙盘模式", (["2d", "3d"] as MapoSandboxMode[]).map((m) => ({
            text: MAPO_SANDBOX_LABELS[m],
            apply: () => set({ sandbox: m }),
            // ⚠ 3D 置灰的理由与原作同义：框架 Stage3D 未实施，⛔ 不在 kit 内自建相机
            enabled: () => m === "2d",
        })));
        row("镜头视角", [{
            text: "鸟瞰",
            apply: () => set({ birdview: !this.logic?.graphics.birdview }),
            // 原作：「2D沙盘不支持鸟瞰视角」
            enabled: () => this.logic?.graphics.sandbox === "3d",
        }]);
        row("色彩模式", (["standard", "vivid", "muted"] as MapoColorMode[]).map((m) => ({
            text: MAPO_COLOR_LABELS[m], apply: () => set({ colorMode: m }), enabled: () => true,
        })));
        row("画质", (["smooth", "normal", "high", "ultra"] as MapoQuality[]).map((m) => ({
            text: MAPO_QUALITY_LABELS[m], apply: () => set({ quality: m }), enabled: () => true,
        })));
    }

    // ── 输入 ────────────────────────────────────────────────────────────────

    protected onTouchStart(event: EventTouch): void {
        const l = this.logic; if (!l) return;
        const p = event.getUILocation();
        const local = mapoRootLocalToCamera(p.x, p.y, this.layerWidth, this.mapTop, this.mapBottom);
        if (!mapoInMapBand(local.y, this.mapTop, this.mapBottom)) return;   // ⚠ 页眉页脚的点不算点选
        l.camera.start(event.getID(), local.x, local.y, Date.now());
    }

    protected onTouchMove(event: EventTouch): void {
        const l = this.logic; if (!l) return;
        const p = event.getUILocation();
        const local = mapoRootLocalToCamera(p.x, p.y, this.layerWidth, this.mapTop, this.mapBottom);
        l.camera.move(event.getID(), local.x, local.y, Date.now());
        this.refresh(false);
    }

    protected onTouchEnd(event: EventTouch): void {
        const l = this.logic; if (!l) return;
        const tapped = l.camera.end(event.getID(), Date.now());
        if (tapped) {
            const info = l.select(tapped);
            if (info && this.detail) {
                const cls = MAPO_TERRAIN_PALETTE.find((e) => e.id === info.classId);
                const name = cls ? cls.cn : `#${info.classId}`;
                // ⚠ 显示层没到位时标注出来，⛔ 不拿退回值冒充真相
                this.detail.string = `(${info.row}, ${info.col}) ${name}`
                    + `${info.passable ? "" : " · 不可通行"}${info.detailed ? "" : " · 读取中…"}`;
            }
        }
        this.refresh(true);
    }

    protected onTouchCancel(): void { this.logic?.camera.cancel(); }

    protected onWheel(event: EventMouse): void {
        const l = this.logic; if (!l) return;
        const p = event.getUILocation();
        const local = mapoRootLocalToCamera(p.x, p.y, this.layerWidth, this.mapTop, this.mapBottom);
        l.camera.zoom(event.getScrollY() > 0 ? 1.1 : 1 / 1.1, local.x, local.y);
        this.refresh(true);
    }

    private onTick(dt: number): void {
        const l = this.logic; if (!l) return;
        l.camera.step(dt);
        this.refresh(false);
    }

    // ── 渲染 ────────────────────────────────────────────────────────────────

    private refresh(force: boolean): void {
        const l = this.logic; if (!l || !this.world) return;
        const cam = l.camera;
        // ⚠ 平移只动父节点 transform，⛔ 不重建网格
        const origin = mapoCameraToRootLocal(0, 0, this.layerWidth, this.mapTop, this.mapBottom);
        this.world.setPosition(origin.x - cam.x * cam.scale, origin.y + cam.y * cam.scale, 0);
        this.world.setScale(cam.scale, cam.scale, 1);

        const near = mapoIsNearField(cam.lod);
        const key = `${cam.lod}|${l.graphics.colorMode}|${cam.centreCell().row}|${cam.centreCell().col}`;
        if (!force && key === this.lastKey) return;
        this.lastKey = key;

        if (near) {
            this.farRenderer?.clear();
            // ⚠ 可视格用偏移模板：平移时只换中心格，⛔ 不每帧重算整套偏移
            this.stencil.refresh(cam.scale, this.layerWidth, this.layerHeight - this.mapTop - this.mapBottom);
            const centre = cam.centreCell();
            const cells: { row: number; col: number }[] = [];
            this.stencil.forEach(centre.row, centre.col, MAPO_MAP_ROWS, MAPO_MAP_COLS,
                (row, col) => { cells.push({ row, col }); });
            this.renderer?.render(l, cells.slice(0, l.createStep * 40));
        } else {
            this.renderer?.clear();
            this.farRenderer?.render(l);
        }
        if (this.status) {
            const layers = l.layers.join(" / ") || "（无）";
            this.status.string = `LOD ${cam.lod} · ${near ? "近档" : "远档"} · 层：${layers}`;
        }
        for (const chip of this.chips) {
            chip.label.color = chip.label.color === DISABLED ? DISABLED : chip.label.color;
        }
    }
}
