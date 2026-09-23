/** 完整 prefab 的层级变换与时间线求值。所有位置仍是原版像素。 */
import type { IMapoPrefabNode, IMapoPrefabCell, IMapoPrefabTrack } from "../../../shared/kits/mapOriginal/content/prefabs.types";
import { mapoOriginalPxToWorld } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { mapoPrefabSkew, mapoPrefabUv } from "./mapoPrefab";
import type { MapoSpriteInput } from "./mapoMesh";

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const animated = new WeakMap<IMapoPrefabNode, boolean>();
export function mapoSceneAnimated(node: IMapoPrefabNode): boolean {
    const cached = animated.get(node);
    if (cached !== undefined) return cached;
    const value = !!(node.timeline || node.event || node.frames?.length || node.tracks?.length)
        || node.children.some(mapoSceneAnimated);
    animated.set(node, value);
    return value;
}
function multiply(a: Matrix, b: Matrix): Matrix {
    return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
            a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function sample(track: IMapoPrefabTrack, time: number): number | readonly number[] | undefined {
    const keys = track.keys;
    let i = keys.length - 1;
    while (i >= 0 && keys[i].time > time + 1e-7) i--;
    if (i < 0) return undefined;
    const key = keys[i], next = keys[i + 1];
    if (!next || !key.tween || next.time <= key.time) return key.value;
    const t = Math.max(0, Math.min(1, (time - key.time) / (next.time - key.time)));
    if (typeof key.value === "number" && typeof next.value === "number") return key.value + (next.value - key.value) * t;
    const b = next.value as readonly number[];
    return (key.value as readonly number[]).map((v, j) => v + (b[j] - v) * t);
}

/** 同一格内按节点 high_z/low_z 排序；父矩阵、乘色和透明度逐层继承。 */
export function mapoSceneSprites(root: IMapoPrefabNode, cells: readonly IMapoPrefabCell[],
    atlas: readonly [number, number], seconds: number,
    placement: { readonly x: number; readonly y: number; readonly row: number; readonly col: number }): MapoSpriteInput[] {
    const out: MapoSpriteInput[] = [];
    const px = mapoOriginalPxToWorld(1);
    function visit(n: IMapoPrefabNode, parent: Matrix, color: readonly number[], add: readonly number[], inheritedTime: number): void {
        let time = inheritedTime;
        if (n.event) {
            if (time < n.event.start || time >= n.event.start + n.event.duration) return;
            time -= n.event.start;
        }
        if (n.timeline) {
            const t = n.timeline;
            time = Math.max(0, time * t.speed + t.offset);
            // 原引擎 playable::is_last_loop (0xafcc94)：loopTimes < 1 表示持续循环。
            if (t.duration > 0) time = t.loops > 0 && time >= t.duration * t.loops
                ? t.duration : time % t.duration;
        }
        let position = n.position, scale = n.scale, angle = n.angle, skew = n.skew;
        let rgb = n.color.slice(0, 3).map((v) => v / 255), alpha = n.color[3] / 255;
        let added = n.add.slice(0, 3).map((v) => v / 255), texture = n.texture;
        if (n.frames?.length) texture = n.frames[(Math.floor(time / (n.frameDuration ?? 1) * n.frames.length) + (n.frameStart ?? 0)) % n.frames.length];
        for (const track of n.tracks ?? []) {
            const value = sample(track, time);
            if (value === undefined) continue;
            switch (track.type) {
                case 0: position = value as readonly number[]; break;
                case 1: scale = value as readonly number[]; break;
                case 2: angle = typeof value === "number" ? value : value[2]; break;
                case 3: rgb = [...value as readonly number[]]; break;
                case 4: alpha = value as number; break;
                case 5: texture = value as number; break;
                case 12: added = [...value as readonly number[]]; break;
                case 13: skew = value as readonly number[]; break;
                default: throw new Error(`未支持 prefab 轨道 ${track.type}`);
            }
        }
        const rad = angle * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
        const [ka, kb, kc, kd] = mapoPrefabSkew(skew[0], skew[1], 1, 1);
        const sx = scale[0], sy = scale[1];
        const local: Matrix = [cs * sx * ka - sn * sy * kb, sn * sx * ka + cs * sy * kb,
            cs * sx * kc - sn * sy * kd, sn * sx * kc + cs * sy * kd, position[0], position[1]];
        const m = multiply(parent, local);
        const rgba = [rgb[0] * color[0], rgb[1] * color[1], rgb[2] * color[2], alpha * color[3]] as const;
        const additive = [added[0] + add[0], added[1] + add[1], added[2] + add[2], n.add[3] / 255 + add[3]] as const;
        const children = n.children.map((child, order) => ({ child, order })).sort((a, b) => a.child.z - b.child.z || a.order - b.order);
        for (const { child } of children) if (child.z < 0) visit(child, m, rgba, additive, time);
        const cell = cells[texture];
        if (cell && rgba[3] > 0 && n.size[0] > 0 && n.size[1] > 0) {
            const [x, y, w, h] = cell.rect;
            out.push({ row: placement.row, col: placement.col,
                x: placement.x + m[4] * px, y: placement.y + m[5] * px,
                w: n.size[0], h: n.size[1], pivot: [n.pivot[0], n.pivot[1]],
                skewBasis: [m[0] * px, m[1] * px, m[2] * px, m[3] * px], rgba, addColor: additive,
                uv: mapoPrefabUv([x / atlas[0], y / atlas[1], w / atlas[0], h / atlas[1]], n.mirror[0], n.mirror[1]) });
        }
        for (const { child } of children) if (child.z >= 0) visit(child, m, rgba, additive, time);
    }
    visit(root, IDENTITY, [1, 1, 1, 1], [0, 0, 0, 0], seconds);
    return out;
}
