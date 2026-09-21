/**
 * 地名层渲染：把原版的大区/郡名摆到地图上。
 *
 * ⚠ 用 `Label` 节点而不是 mesh：文本必须跟着相机缩放保持**可读字号**，
 *   所以节点建在 root 上、位置每帧按相机换算，⛔ 不挂在 world 节点下（那样会跟着缩放糊掉）。
 * ⚠ 节点**池化复用**：切档时只改文本与位置，⛔ 不要每帧 new Node。
 */
import { Color, Label, Node, UITransform } from "cc";
import { mapoLabelTier, mapoLabelsFor, type IMapoPlacedLabel } from "../logic/mapoLabels";
import type { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";

const TEXT = new Color(244, 240, 226, 235);
const SHADOW = new Color(18, 22, 20, 200);

export class MapoLabelRenderer {
    private readonly pool: { node: Node; label: Label; shade: Label }[] = [];
    private disposed = false;

    constructor(private readonly root: Node) {}

    private acquire(i: number): { node: Node; label: Label; shade: Label } {
        const hit = this.pool[i];
        if (hit) return hit;
        const node = new Node(`mapo-label-${i}`);
        node.layer = this.root.layer;
        node.addComponent(UITransform);
        this.root.addChild(node);
        const make = (name: string, color: Color, dx: number, dy: number): Label => {
            const child = new Node(name);
            child.layer = node.layer;
            const t = child.addComponent(UITransform);
            t.width = 220; t.height = 40;
            const label = child.addComponent(Label);
            label.color = color;
            child.setPosition(dx, dy, 0);
            node.addChild(child);
            return label;
        };
        // ⚠ 描边用一层偏移的深色副本代替（UI 管线下没有便宜的真描边）
        const shade = make("shade", SHADOW, 1.5, -1.5);
        const label = make("text", TEXT, 0, 0);
        const entry = { node, label, shade };
        this.pool[i] = entry;
        return entry;
    }

    render(logic: MapOriginalWorldLogic, bandCentre: number): void {
        if (this.disposed) return;
        const cam = logic.camera;
        const list: readonly IMapoPlacedLabel[] = mapoLabelsFor(cam.lod);
        const halfW = this.root.getComponent(UITransform)?.width ?? 0;
        let used = 0;
        for (const item of list) {
            const x = (item.x - cam.x) * cam.scale;
            const y = bandCentre + (item.y - cam.y) * cam.scale;
            // 屏外的不建（几十条里通常只有几条在屏内）
            if (Math.abs(x) > halfW / 2 + 160) continue;
            const entry = this.acquire(used);
            entry.node.active = true;
            entry.node.setPosition(x, y, 0);
            for (const label of [entry.label, entry.shade]) {
                label.string = item.name;
                label.fontSize = item.size;
                label.lineHeight = item.size + 4;
            }
            used += 1;
        }
        for (let i = used; i < this.pool.length; i += 1) this.pool[i].node.active = false;
    }

    /** 当前这一档画的是哪一级（重放据此判定）。 */
    tierOf(lod: number): string { return mapoLabelTier(lod); }

    clear(): void {
        for (const e of this.pool) e.node.active = false;
    }

    dispose(): void {
        this.disposed = true;
        for (const e of this.pool) e.node.destroy();
        this.pool.length = 0;
    }
}
