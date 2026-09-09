/** Separate, bounded world navigation and an optional art scroll; neither view requests world chunks. */
import { Color, EffectAsset, EventTouch, gfx, Label, Material, Mesh, MeshRenderer, Node, Rect,
    Sprite, SpriteFrame, Texture2D, UIMeshRenderer, UITransform, utils, Vec3 } from "cc";
import { type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";
import { createSolidPlate } from "../../../view/uiPlate";
import { buildSlgOverviewRects, overviewToWorld, overviewViewportRect, SLG_LANDMARKS,
    slgArtAtlasRect, worldToOverview } from "../logic/mapArt";
import { type MapRect } from "../logic/mapCamera";

const PAPER = new Color(229, 237, 220, 255);
const INK = new Color(33, 65, 55, 255);
const MUTED = new Color(97, 122, 105, 255);
const JADE = new Color(57, 103, 82, 255);
const PALE = new Color(202, 217, 193, 255);
const IVORY = new Color(255, 251, 225, 255);
const GOLD = new Color(230, 191, 95, 255);

interface OverviewButton {
    readonly x: number; readonly y: number; readonly width: number; readonly height: number;
    readonly sprite: Sprite; readonly label: Label; readonly onTap: () => void;
}
interface OverviewTouch { readonly id: number; readonly x: number; readonly y: number; moved: boolean }
interface OverviewLandmarkTarget {
    readonly x: number; readonly y: number; readonly width: number; readonly height: number;
    readonly worldX: number; readonly worldY: number;
}

export class SlgWorldOverview {
    readonly node: Node;
    private readonly mapSize: number;
    private readonly mapCenterY: number;
    private readonly frames: SpriteFrame[] = [];
    private readonly buttons: OverviewButton[] = [];
    private readonly landmarkTargets: OverviewLandmarkTarget[] = [];
    private readonly viewportEdges: Node[] = [];
    private readonly cursor: Node;
    private readonly navigation: Node;
    private readonly scroll: Node;
    private readonly footer: Label;
    private navigationTab!: OverviewButton;
    private scrollTab!: OverviewButton;
    private mesh: Mesh | null = null;
    private material: Material | null = null;
    private touch: OverviewTouch | null = null;
    private showingScroll = false;
    private positionText = "";
    private disposed = false;

    constructor(
        parent: Node,
        private readonly terrain: ISlgTerrain,
        artTexture: Texture2D,
        decorationTexture: Texture2D,
        width: number,
        height: number,
        private readonly onLocate: (x: number, y: number) => void,
        private readonly onVisibilityChange?: (visible: boolean) => void,
    ) {
        this.node = createSolidPlate(parent, width, height, PAPER, 0, 0, "slg-world-overview");
        this.node.active = false;
        const inset = Math.min(20, width * 0.035);
        const header = Math.min(110, height * 0.22), bottom = Math.min(50, height * 0.10);
        this.mapSize = Math.max(1, Math.min(width - inset * 2, height - header - bottom));
        this.mapCenterY = (bottom - header) / 2;
        this.navigation = this.createNode("slg-overview-navigation", this.node, this.mapSize, this.mapSize);
        this.navigation.setPosition(0, this.mapCenterY);
        this.scroll = this.createNode("slg-overview-scroll", this.node, this.mapSize, this.mapSize);
        this.scroll.setPosition(0, this.mapCenterY);
        this.cursor = this.createNode("slg-overview-position", this.navigation, 14, 14);
        this.footer = this.label("点击地图定位", 17, MUTED, 0, -height / 2 + bottom / 2, width - inset * 2);
        try {
            const titleY = height / 2 - header * 0.25;
            this.label(`${terrain.name} · 世界总览`, 22, INK, -width * 0.09, titleY, width * 0.70);
            this.button("返回", Math.min(76, width * 0.18), 36, width / 2 - inset - Math.min(38, width * 0.09),
                titleY, () => this.setVisible(false));
            const tabWidth = Math.min(150, width * 0.27), tabY = height / 2 - header * 0.70;
            this.navigationTab = this.button("实地图", tabWidth, 34, -tabWidth / 2 - 6, tabY, () => this.setMode(false));
            this.scrollTab = this.button("山河绘卷", tabWidth, 34, tabWidth / 2 + 6, tabY, () => this.setMode(true));
            this.buildNavigation(decorationTexture);
            this.buildScroll(artTexture);
            this.setMode(false);
            this.bindInput(true);
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    get visible(): boolean { return !this.disposed && this.node.active; }

    setVisible(visible: boolean): void {
        if (this.disposed || this.node.active === visible) return;
        this.touch = null;
        if (visible && this.node.parent) this.node.setSiblingIndex(this.node.parent.children.length - 1);
        this.node.active = visible;
        this.onVisibilityChange?.(visible);
    }

    /** MapCamera.visibleRect includes its last tile; the shared projection accounts for that once. */
    updateViewport(rect: MapRect): void {
        if (this.disposed) return;
        const projected = overviewViewportRect(rect, this.mapSize, this.mapSize);
        const left = projected.x - this.mapSize / 2, top = this.mapSize / 2 - projected.y;
        const right = left + projected.width, bottom = top - projected.height;
        const x = (left + right) / 2, y = (top + bottom) / 2;
        const lines = [[Math.max(1, projected.width), 1.5, x, top], [Math.max(1, projected.width), 1.5, x, bottom],
            [1.5, Math.max(1, projected.height), left, y], [1.5, Math.max(1, projected.height), right, y]];
        for (let i = 0; i < this.viewportEdges.length; i++) {
            const edge = this.viewportEdges[i], line = lines[i];
            const transform = edge.getComponent(UITransform);
            if (transform) { transform.width = line[0]; transform.height = line[1]; }
            edge.setPosition(line[2], line[3]);
        }
        this.cursor.setPosition(x, y);
        const centerX = Math.min(this.terrain.width - 1, Math.floor((rect.minX + rect.maxX + 1) / 2));
        const centerY = Math.min(this.terrain.height - 1, Math.floor((rect.minY + rect.maxY + 1) / 2));
        this.positionText = `当前位置（${centerX}, ${centerY}） · 点击地图定位`;
        if (!this.showingScroll) this.footer.string = this.positionText;
    }

    dispose(): void {
        if (this.disposed) return;
        this.setVisible(false);
        this.disposed = true;
        this.bindInput(false);
        this.touch = null;
        this.node.destroy();
        this.mesh?.destroy(); this.mesh = null;
        this.material?.destroy(); this.material = null;
        for (const frame of this.frames) frame.destroy();
        this.frames.length = 0;
    }

    private buildNavigation(decorationTexture: Texture2D): void {
        const rectangles = buildSlgOverviewRects(this.terrain);
        const ground = rectangles[0];
        if (!ground || rectangles.length > 513) throw new RangeError("SLG overview region budget exceeded");
        // A shared white Sprite supplies terrain 0; at most 512 overriding regions use one mesh.
        createSolidPlate(this.navigation, this.mapSize, this.mapSize,
            new Color(ground.color[0], ground.color[1], ground.color[2], 255), 0, 0, "slg-overview-ground");
        const regions = rectangles.slice(1);
        if (regions.length > 0) {
            const technique = EffectAsset.get("builtin-unlit")?.techniques.findIndex((entry) => entry.name === "alpha-blend") ?? -1;
            if (technique < 0) throw new Error("SLG overview requires builtin-unlit alpha-blend");
            this.material = new Material();
            this.material.initialize({ effectName: "builtin-unlit", technique,
                defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: false },
                states: { rasterizerState: { cullMode: gfx.CullMode.NONE }, depthStencilState: { depthTest: false, depthWrite: false } } });
            const positions = new Float32Array(regions.length * 12);
            const colors = new Float32Array(regions.length * 16);
            const indices16 = new Uint16Array(regions.length * 6);
            for (let i = 0; i < regions.length; i++) {
                const region = regions[i];
                const northwest = worldToOverview({ x: region.x, y: region.y + region.height }, this.mapSize, this.mapSize);
                const southeast = worldToOverview({ x: region.x + region.width, y: region.y }, this.mapSize, this.mapSize);
                const left = northwest.x - this.mapSize / 2, right = southeast.x - this.mapSize / 2;
                const top = this.mapSize / 2 - northwest.y, bottom = this.mapSize / 2 - southeast.y;
                positions.set([left, top, 0, right, top, 0, left, bottom, 0, right, bottom, 0], i * 12);
                for (let v = 0; v < 4; v++) colors.set([region.color[0] / 255, region.color[1] / 255, region.color[2] / 255, 1], i * 16 + v * 4);
                const vertex = i * 4;
                indices16.set([vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3], i * 6);
            }
            this.mesh = utils.MeshUtils.createDynamicMesh(0, { positions, colors, indices16,
                minPos: new Vec3(-this.mapSize / 2, -this.mapSize / 2, 0), maxPos: new Vec3(this.mapSize / 2, this.mapSize / 2, 0) },
            undefined, { maxSubMeshes: 1, maxSubMeshVertices: regions.length * 4, maxSubMeshIndices: regions.length * 6 });
            const meshNode = this.createNode("slg-overview-regions", this.navigation, this.mapSize, this.mapSize);
            const model = meshNode.addComponent(MeshRenderer);
            model.mesh = this.mesh; model.material = this.material;
            meshNode.addComponent(UIMeshRenderer);
        }
        this.border(this.navigation);
        const iconSize = Math.min(46, this.mapSize * 0.085), fontSize = Math.min(17, this.mapSize * 0.035);
        for (const landmark of SLG_LANDMARKS) {
            const point = worldToOverview(landmark, this.mapSize, this.mapSize);
            const x = point.x - this.mapSize / 2, y = this.mapSize / 2 - point.y;
            const site = this.createNode(`slg-overview-site-${landmark.id}`, this.navigation, iconSize, iconSize);
            site.setPosition(x, y);
            const atlas = slgArtAtlasRect(landmark.atlasIndex);
            const icon = this.picture(site, decorationTexture, new Rect(atlas.x, atlas.y, atlas.width, atlas.height),
                iconSize, iconSize, `slg-overview-${landmark.id}`);
            icon.setPosition(0, iconSize * 0.18);
            const labelWidth = Math.min(104, this.mapSize * 0.22);
            const labelY = Math.max(-this.mapSize / 2 + fontSize, y - iconSize * 0.48);
            const labelX = Math.max(-this.mapSize / 2 + labelWidth / 2, Math.min(this.mapSize / 2 - labelWidth / 2, x));
            createSolidPlate(site, labelWidth, fontSize * 1.6, JADE, labelX - x, labelY - y, "slg-overview-landmark-label");
            this.label(landmark.name, fontSize, IVORY, labelX - x, labelY - y, labelWidth * 0.94, site);
            this.landmarkTargets.push({ x: labelX, y: labelY + this.mapCenterY, width: labelWidth, height: fontSize * 1.6,
                worldX: landmark.x, worldY: landmark.y });
            this.landmarkTargets.push({ x, y: y + iconSize * 0.18 + this.mapCenterY, width: iconSize, height: iconSize,
                worldX: landmark.x, worldY: landmark.y });
        }
        this.label("北 ↑", 16, IVORY, this.mapSize / 2 - 27, this.mapSize / 2 - 18, 48, this.navigation);
        for (let i = 0; i < 4; i++) this.viewportEdges.push(createSolidPlate(this.navigation, 1, 1, GOLD, 0, 0, "slg-overview-viewport"));
        this.cursor.setSiblingIndex(this.navigation.children.length - 1);
        createSolidPlate(this.cursor, 14, 2, IVORY, 0, 0);
        createSolidPlate(this.cursor, 2, 14, IVORY, 0, 0);
        createSolidPlate(this.cursor, 4, 4, GOLD, 0, 0);
    }

    private buildScroll(texture: Texture2D): void {
        createSolidPlate(this.scroll, this.mapSize, this.mapSize, PALE, 0, 0, "slg-overview-scroll-back");
        const scale = Math.min(this.mapSize / texture.width, this.mapSize / texture.height);
        this.picture(this.scroll, texture, new Rect(0, 0, texture.width, texture.height), texture.width * scale, texture.height * scale,
            "slg-overview-art");
        this.border(this.scroll);
    }

    private setMode(scroll: boolean): void {
        this.showingScroll = scroll;
        this.navigation.active = !scroll; this.scroll.active = scroll;
        for (const [button, selected] of [[this.navigationTab, !scroll], [this.scrollTab, scroll]] as const) {
            button.sprite.color = selected ? JADE : PALE;
            button.label.color = selected ? IVORY : INK;
        }
        this.footer.string = scroll ? "山河绘卷" : this.positionText || "点击地图定位";
    }

    private border(parent: Node): void {
        const half = this.mapSize / 2;
        for (const [w, h, x, y] of [[this.mapSize, 2, 0, half], [this.mapSize, 2, 0, -half],
            [2, this.mapSize, -half, 0], [2, this.mapSize, half, 0]]) createSolidPlate(parent, w, h, JADE, x, y);
    }

    private picture(parent: Node, texture: Texture2D, rect: Rect, width: number, height: number, name: string): Node {
        const node = this.createNode(name, parent, width, height);
        const frame = new SpriteFrame(); frame.texture = texture; frame.rect = rect; frame.packable = false;
        this.frames.push(frame);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.type = Sprite.Type.SIMPLE; sprite.spriteFrame = frame;
        return node;
    }

    private createNode(name: string, parent: Node, width: number, height: number): Node {
        const node = new Node(name); node.layer = parent.layer;
        const transform = node.addComponent(UITransform); transform.width = width; transform.height = height;
        parent.addChild(node); return node;
    }

    private label(text: string, size: number, color: Color, x: number, y: number, width: number, parent = this.node): Label {
        const node = this.createNode("slg-overview-label", parent, width, size * 2);
        node.setPosition(x, y);
        const label = node.addComponent(Label); label.string = text; label.fontSize = size; label.lineHeight = size * 1.25;
        label.color = color; label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private button(text: string, width: number, height: number, x: number, y: number, onTap: () => void): OverviewButton {
        const node = createSolidPlate(this.node, width, height, JADE, x, y, `slg-overview-${text}`);
        const label = this.label(text, 18, IVORY, 0, 0, width * 0.94, node);
        const sprite = node.getComponent(Sprite);
        if (!sprite) throw new Error("SLG overview button sprite missing");
        const button = { x, y, width, height, label, sprite, onTap };
        this.buttons.push(button); return button;
    }

    private local(event: EventTouch): { x: number; y: number } {
        const position = event.getUILocation();
        const local = this.node.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(position.x, position.y, 0));
        return { x: local?.x ?? 0, y: local?.y ?? 0 };
    }

    private readonly onTouchStart = (event: EventTouch): void => {
        event.propagationStopped = true;
        if (!this.visible) return;
        if (this.touch) { this.touch.moved = true; return; }
        const point = this.local(event);
        this.touch = { id: event.getID(), x: point.x, y: point.y, moved: false };
    };
    private readonly onTouchMove = (event: EventTouch): void => {
        event.propagationStopped = true;
        if (!this.touch || this.touch.id !== event.getID()) return;
        const point = this.local(event);
        if (Math.hypot(point.x - this.touch.x, point.y - this.touch.y) > 8) this.touch.moved = true;
    };
    private readonly onTouchEnd = (event: EventTouch): void => {
        event.propagationStopped = true;
        const touch = this.touch;
        if (!this.visible || !touch || touch.id !== event.getID()) return;
        this.touch = null;
        const point = this.local(event);
        if (touch.moved || Math.hypot(point.x - touch.x, point.y - touch.y) > 8) return;
        for (const button of this.buttons) {
            if (Math.abs(point.x - button.x) <= button.width / 2 && Math.abs(point.y - button.y) <= button.height / 2) {
                button.onTap(); return;
            }
        }
        if (this.showingScroll || Math.abs(point.x) > this.mapSize / 2 || Math.abs(point.y - this.mapCenterY) > this.mapSize / 2) return;
        for (const landmark of this.landmarkTargets) {
            if (Math.abs(point.x - landmark.x) <= landmark.width / 2 && Math.abs(point.y - landmark.y) <= landmark.height / 2) {
                this.setVisible(false);
                this.onLocate(Math.floor(landmark.worldX), Math.floor(landmark.worldY));
                return;
            }
        }
        const world = overviewToWorld({ x: point.x + this.mapSize / 2, y: this.mapSize / 2 - (point.y - this.mapCenterY) },
            this.mapSize, this.mapSize);
        const x = Math.max(0, Math.min(this.terrain.width - 1, Math.floor(world.x)));
        const y = Math.max(0, Math.min(this.terrain.height - 1, Math.floor(world.y)));
        this.setVisible(false);
        this.onLocate(x, y);
    };
    private readonly onTouchCancel = (event: EventTouch): void => { event.propagationStopped = true; this.touch = null; };
    private bindInput(bind: boolean): void {
        const method = bind ? "on" : "off";
        this.node[method](Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node[method](Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node[method](Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node[method](Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }
}
