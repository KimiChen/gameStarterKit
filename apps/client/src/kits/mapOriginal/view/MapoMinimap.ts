/**
 * 常显缩略图：整幅世界图 + 当前视口框 + 点一下跳过去。
 * ⚠ 纯 Sprite/Plate 拼的，⛔ 不建网格——它只是个 HUD 浮层。
 */
import { Color, EventTouch, Node, Sprite, SpriteFrame, UITransform, Vec3 } from "cc";
import { createSolidPlate } from "../../../view/uiPlate";
import { mapoMinimapCell, mapoMinimapViewport } from "../logic/mapoFar";
import type { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";
import type { MapoArtResources } from "./MapoArtResources";

const FRAME = new Color(232, 226, 196, 200);
const BOX = new Color(255, 224, 119, 255);
const FALLBACK = new Color(46, 54, 48, 235);

export class MapoMinimap {
    private readonly node: Node;
    private readonly box: Node;
    private readonly edges: Node[] = [];
    /** 自建的帧要自己销毁，⛔ 不能随节点走。 */
    private frame: SpriteFrame | null = null;
    private disposed = false;

    constructor(parent: Node, private readonly size: number, x: number, y: number,
                art: MapoArtResources | null, private readonly onLocate: (row: number, col: number) => void) {
        this.node = new Node("mapo-minimap");
        this.node.layer = parent.layer;
        const transform = this.node.addComponent(UITransform);
        transform.width = size; transform.height = size;
        this.node.setPosition(x, y);
        parent.addChild(this.node);

        if (art?.minimap) {
            const image = new Node("mapo-minimap-image");
            image.layer = parent.layer;
            const it = image.addComponent(UITransform);
            const frame = new SpriteFrame();
            frame.texture = art.minimap;
            frame.packable = false;   // ⚠ 自建帧必须关动态图集（见 view/uiPlate.ts 的告诫）
            this.frame = frame;
            const sprite = image.addComponent(Sprite);
            // ⚠ 次序有讲究：赋 spriteFrame 会按默认 TRIMMED 把 UITransform 重置成**贴图原尺寸**
            // （512×512），所以必须先切 CUSTOM，最后再定尺寸；反过来写缩略图会撑成原图那么大。
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            it.width = size; it.height = size;
            this.node.addChild(image);
        } else {
            // ⛔ 贴图没加载出来也要有个能点的底板，不然缩略图整个消失
            createSolidPlate(this.node, size, size, FALLBACK, 0, 0, "mapo-minimap-fallback");
        }
        createSolidPlate(this.node, size, 2, FRAME, 0, size / 2 - 1);
        createSolidPlate(this.node, size, 2, FRAME, 0, -size / 2 + 1);
        createSolidPlate(this.node, 2, size, FRAME, -size / 2 + 1, 0);
        createSolidPlate(this.node, 2, size, FRAME, size / 2 - 1, 0);

        this.box = new Node("viewport");
        this.box.layer = parent.layer;
        this.box.addComponent(UITransform);
        this.node.addChild(this.box);
        for (let i = 0; i < 4; i += 1) this.edges.push(createSolidPlate(this.box, 2, 2, BOX, 0, 0, `edge-${i}`));

        this.node.on(Node.EventType.TOUCH_END, this.onTap, this);
    }

    private onTap(event: EventTouch): void {
        if (this.disposed) return;
        const transform = this.node.getComponent(UITransform);
        if (!transform) return;
        const point = event.getUILocation();
        // ⚠ 用 UITransform 换算到本节点局部（锚点居中），⛔ 不要自己拿世界坐标减
        const local = transform.convertToNodeSpaceAR(new Vec3(point.x, point.y, 0));
        const u = local.x / this.size + 0.5;
        const v = 0.5 - local.y / this.size;
        const cell = mapoMinimapCell(u, v);
        this.onLocate(cell.row, cell.col);
    }

    update(logic: MapOriginalWorldLogic): void {
        if (this.disposed) return;
        const rect = mapoMinimapViewport(logic.camera.x, logic.camera.y,
            logic.camera.width, logic.camera.height, logic.camera.scale);
        const w = Math.max(3, rect.w * this.size), h = Math.max(3, rect.h * this.size);
        const cx = (rect.x + rect.w / 2) * this.size - this.size / 2;
        const cy = this.size / 2 - (rect.y + rect.h / 2) * this.size;
        const layout: readonly (readonly [number, number, number, number])[] = [
            [w, 2, 0, h / 2], [w, 2, 0, -h / 2], [2, h, -w / 2, 0], [2, h, w / 2, 0],
        ];
        for (let i = 0; i < this.edges.length; i += 1) {
            const [ew, eh, ex, ey] = layout[i];
            const t = this.edges[i].getComponent(UITransform);
            if (t) { t.width = ew; t.height = eh; }
            this.edges[i].setPosition(cx + ex, cy + ey, 0);
        }
    }

    setVisible(on: boolean): void { if (!this.disposed) this.node.active = on; }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.node.off(Node.EventType.TOUCH_END, this.onTap, this);
        this.node.active = false;
        this.node.destroy();
        this.frame?.destroy();
        this.frame = null;
    }
}
