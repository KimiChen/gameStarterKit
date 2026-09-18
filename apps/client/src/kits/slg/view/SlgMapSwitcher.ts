/** 右上角小地图预览 + 五图切换面板。只读 SLG_MAPS 目录与各图 mini 绘卷，不碰玩法状态。 */
import { Color, EventTouch, Label, Node, Sprite, SpriteFrame, Texture2D, UITransform } from "cc";
import { SLG_MAPS, slgMapInfo } from "../../../shared/kits/slg/api/worldmap/index";
import { createSolidPlate } from "../../../view/uiPlate";
import { loadSlgMapMini } from "./SlgArtResources";

const PANEL = new Color(19, 28, 38, 255);
const TEXT = new Color(236, 243, 237, 255);
const ACCENT = new Color(52, 115, 161, 255);
const CURRENT = new Color(230, 191, 95, 255);

/** 常显小地图（当前图 mini 绘卷）+ 点击展开的五图切换面板。
 *  纹理生命周期自持：mini 纹理独立于地图 bundle（切图释放 bundle 不影响小地图）。 */
export class SlgMapSwitcher {
    /** header 上的常显预览节点（节点名供预览工具断言）。 */
    readonly minimap: Node;
    private readonly panel: Node;
    private readonly miniSprite: Sprite;
    private readonly miniLabel: Label;
    private readonly minis = new Map<string, Texture2D>();
    private readonly frames: SpriteFrame[] = [];
    private disposed = false;
    private loading = false;

    constructor(parent: Node, size: number, x: number, y: number,
        private currentMapId: string,
        private readonly onSwitch: (mapId: string) => void) {
        // 常显小地图：mini 绘卷 + 图名；点击开面板（吸收触摸，不穿透到地图手势）
        this.minimap = createSolidPlate(parent, size, size + 24, PANEL, x, y, "slg-minimap");
        const artNode = this.node("slg-minimap-art", this.minimap, size - 8, size - 8);
        artNode.setPosition(0, 12);
        this.miniSprite = artNode.addComponent(Sprite);
        this.miniSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.miniSprite.type = Sprite.Type.SIMPLE;
        this.miniLabel = this.label(slgMapInfo(currentMapId).name, 16, TEXT, 0, -size / 2 + 2, size - 8, this.minimap);
        this.minimap.on(Node.EventType.TOUCH_START, (event: EventTouch) => { event.propagationStopped = true; }, this);
        this.minimap.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; this.open(); }, this);

        // 切换面板（默认隐藏）：底 + 五图列表
        const pw = Math.min(parent.getComponent(UITransform)!.width * 0.86, 560);
        const ph = Math.min(parent.getComponent(UITransform)!.height * 0.72, SLG_MAPS.length * 116 + 120);
        this.panel = createSolidPlate(parent, pw, ph, PANEL, 0, 0, "slg-map-switcher");
        this.panel.active = false;
        this.label("选择地图", 24, TEXT, 0, ph / 2 - 40, pw - 40, this.panel);
        const closeBtn = createSolidPlate(this.panel, 76, 36, ACCENT, pw / 2 - 52, ph / 2 - 38, "slg-switcher-close");
        closeBtn.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; this.close(); }, this);
        const closeLabel = this.node("label", closeBtn, 70, 40);
        const cl = closeLabel.addComponent(Label); cl.string = "关闭"; cl.fontSize = 18; cl.color = TEXT;
        cl.horizontalAlign = Label.HorizontalAlign.CENTER;
        SLG_MAPS.forEach((info, i) => {
            const itemY = ph / 2 - 92 - i * 116;
            const item = createSolidPlate(this.panel, pw - 48, 104, ACCENT, 0, itemY, `slg-map-option-${info.id}`);
            item.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                this.pick(info.id);
            }, this);
            const thumb = this.node(`slg-map-thumb-${info.id}`, item, 88, 88);
            thumb.setPosition(-(pw - 48) / 2 + 52, 0);
            this.label(info.name, 22, TEXT, 24, 0, pw - 200, item);
        });
        this.panel.on(Node.EventType.TOUCH_START, (event: EventTouch) => { event.propagationStopped = true; }, this);
    }

    /** 面板开关状态（供输入拦截与预览工具断言）。 */
    get opened(): boolean { return !this.disposed && this.panel.active; }

    /** 切图/首开同步小地图：mini 纹理自持加载（与地图 bundle 生命周期解耦）。 */
    setCurrent(mapId: string): void {
        if (this.disposed) return;
        this.currentMapId = mapId;
        this.miniLabel.string = slgMapInfo(mapId).name;
        const cached = this.minis.get(mapId);
        if (cached) { this.paintMini(cached); return; }
        void loadSlgMapMini(mapId).then((texture) => {
            if (!texture) return;
            if (this.disposed) { texture.decRef(); return; }
            this.minis.set(mapId, texture);
            if (this.currentMapId === mapId) this.paintMini(texture);
            this.paint(mapId);
        });
    }

    /** 打开面板并懒加载五图 mini（256²）。 */
    open(): void {
        if (this.disposed || this.opened) return;
        this.panel.active = true;
        if (this.panel.parent) this.panel.setSiblingIndex(this.panel.parent.children.length - 1);
        void this.loadMinis();
    }
    close(): void {
        if (this.disposed) return;
        this.panel.active = false;
    }
    private pick(mapId: string): void {
        this.close();
        if (mapId !== this.currentMapId) this.onSwitch(mapId);
    }

    private async loadMinis(): Promise<void> {
        if (this.loading) return;
        this.loading = true;
        try {
            for (const info of SLG_MAPS) {
                if (this.disposed) return;
                if (this.minis.has(info.id)) { this.paint(info.id); continue; }
                const texture = await loadSlgMapMini(info.id);
                if (!texture) continue;
                if (this.disposed) { texture.decRef(); return; }
                this.minis.set(info.id, texture);
                if (info.id === this.currentMapId) this.paintMini(texture);
                this.paint(info.id);
            }
        } finally { this.loading = false; }
    }

    private frameOf(texture: Texture2D): SpriteFrame {
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.packable = false;
        this.frames.push(frame);
        return frame;
    }
    private paintMini(texture: Texture2D): void {
        this.miniSprite.spriteFrame = this.frameOf(texture);
    }
    private paint(mapId: string): void {
        if (!this.opened) return;
        const option = this.panel.getChildByName(`slg-map-option-${mapId}`);
        const thumb = option?.getChildByName(`slg-map-thumb-${mapId}`);
        const texture = this.minis.get(mapId);
        if (!option || !thumb || !texture) return;
        let sprite = thumb.getComponent(Sprite);
        if (!sprite) sprite = thumb.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.spriteFrame = this.frameOf(texture);
        // 当前图金框提示
        if (mapId === this.currentMapId && !option.getChildByName("slg-map-current")) {
            createSolidPlate(option, 6, 104, CURRENT, -(option.getComponent(UITransform)!.width / 2) + 3, 0, "slg-map-current");
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const frame of this.frames) frame.destroy();
        this.frames.length = 0;
        for (const texture of this.minis.values()) texture.decRef();
        this.minis.clear();
        this.minimap.destroy();
        this.panel.destroy();
    }

    private node(name: string, parent: Node, width: number, height: number): Node {
        const node = new Node(name); node.layer = parent.layer;
        const transform = node.addComponent(UITransform); transform.width = width; transform.height = height;
        parent.addChild(node); return node;
    }
    private label(text: string, size: number, color: Color, x: number, y: number, width: number, parent: Node): Label {
        const node = this.node("label", parent, width, size * 2.5); node.setPosition(x, y);
        const label = node.addComponent(Label); label.string = text; label.fontSize = size; label.lineHeight = size * 1.25;
        label.color = color; label.horizontalAlign = Label.HorizontalAlign.CENTER; label.overflow = Label.Overflow.SHRINK;
        return label;
    }
}
