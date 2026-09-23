/**
 * 地名层渲染：把原版的大区/郡名摆到地图上。
 *
 * ⚠ 用 `Label` 节点而不是 mesh：文本必须跟着相机缩放保持**可读字号**，
 *   所以节点建在 root 上、位置每帧按相机换算，⛔ 不挂在 world 节点下（那样会跟着缩放糊掉）。
 * ⚠ 节点**池化复用**：切档时只改文本与位置，⛔ 不要每帧 new Node。
 */
import { Color, Label, Material, Node, UITransform } from "cc";
import { mapoCityMarkers, mapoLabelTier, mapoLayoutLabels } from "../logic/mapoLabels";
import { buildMapoPolyMesh, type MapoPolyInput } from "../logic/mapoMesh";
import { createMapoBatch, createMapoMaterial, destroyMapoBatch, mapoUnlitTechnique, uploadMapoBatch, type MapoBatch } from "./MapoMeshBatch";
import type { MapOriginalWorldLogic } from "../logic/MapOriginalWorldLogic";

const TEXT = new Color(244, 240, 226, 235);
const SHADOW = new Color(18, 22, 20, 200);

export class MapoLabelRenderer {
    private readonly pool: { node: Node; label: Label; shade: Label }[] = [];
    private disposed = false;
    private markers: MapoBatch | null = null;
    private markerMaterial: Material | null = null;

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

    render(logic: MapOriginalWorldLogic, bandCentre: number, focus?: { x: number; y: number }): void {
        if (this.disposed) return;
        const cam = logic.camera;
        const list = mapoLayoutLabels(cam.lod, cam, [
            // 右下角小地图，避免地名透过 HUD。
            { left: cam.width - 210, right: cam.width, top: cam.height - 210, bottom: cam.height },
        ]);
        const polys: MapoPolyInput[] = [];
        const diamond = (sx: number, sy: number, size: number, rgba: readonly [number, number, number, number]) => {
            const x = sx - cam.width / 2, y = bandCentre + cam.height / 2 - sy;
            polys.push({ points: [[x, y + size], [x + size, y], [x, y - size], [x - size, y]], rgba });
        };
        for (const p of mapoCityMarkers(cam.lod, cam)) {
            const size = p.major ? 7 : 5;
            diamond(p.sx, p.sy, size + 2, [0.08, 0.1, 0.08, 1]);
            diamond(p.sx, p.sy, size, p.major ? [1, 0.78, 0.32, 1] : [0.95, 0.94, 0.79, 1]);
        }
        if (cam.lod >= 2 && focus) {
            const p = cam.screenAt(focus.x, focus.y);
            if (p.x >= 10 && p.x <= cam.width - 10 && p.y >= 10 && p.y <= cam.height - 10) {
                diamond(p.x, p.y, 10, [0.05, 0.15, 0.22, 1]);
                diamond(p.x, p.y, 7, [0.2, 0.85, 1, 1]);
                diamond(p.x, p.y, 3, [1, 1, 1, 1]);
            }
        }
        if (polys.length) {
            this.markerMaterial ??= createMapoMaterial(mapoUnlitTechnique(), false);
            const geometry = buildMapoPolyMesh(polys);
            if (!this.markers) this.markers = createMapoBatch(this.root, "mapo-city-markers", geometry, this.markerMaterial);
            else uploadMapoBatch(this.markers, geometry);
        } else { destroyMapoBatch(this.markers); this.markers = null; }
        let used = 0;
        for (const item of list) {
            const x = item.sx - cam.width / 2;
            const y = bandCentre + cam.height / 2 - item.sy;
            const entry = this.acquire(used);
            entry.node.active = true;
            entry.node.setPosition(x, y, 0);
            for (const label of [entry.label, entry.shade]) {
                label.string = item.name;
                label.fontSize = item.size;
                label.lineHeight = item.size + 4;
                label.node.getComponent(UITransform)?.setContentSize(item.width, item.height);
            }
            used += 1;
        }
        for (let i = used; i < this.pool.length; i += 1) this.pool[i].node.active = false;
    }

    /** 当前这一档画的是哪一级（重放据此判定）。 */
    tierOf(lod: number): string { return mapoLabelTier(lod); }

    clear(): void {
        destroyMapoBatch(this.markers); this.markers = null;
        for (const e of this.pool) e.node.active = false;
    }

    dispose(): void {
        this.disposed = true;
        this.clear(); this.markerMaterial?.destroy(); this.markerMaterial = null;
        for (const e of this.pool) e.node.destroy();
        this.pool.length = 0;
    }
}
