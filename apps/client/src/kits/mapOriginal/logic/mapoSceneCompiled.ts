/** O6：一次排序/预计算局部矩阵；播放器仅重算变化的节点，输出保留原画家序。 */
import type { IMapoPrefabNode, IMapoPrefabCell, IMapoPrefabTrack } from "../../../shared/kits/mapOriginal/content/prefabs.types";
import { mapoOriginalPxToWorld } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { mapoPrefabSkew, mapoPrefabUv } from "./mapoPrefab";
import { mapoSceneAnimated } from "./mapoScene";
import type { MapoSpriteInput } from "./mapoMesh";

type Matrix = readonly number[];
type Color = readonly [number, number, number, number];
export interface MapoPlacement { readonly x: number; readonly y: number; readonly row: number; readonly col: number; }
export interface MapoSpriteSource { readonly row: number; readonly col: number; read(seconds: number): readonly MapoSpriteInput[]; }
interface Entry { node: IMapoPrefabNode; parent: number; local: Matrix; rgb: readonly number[]; added: readonly number[]; motion: boolean; }
interface State { time: number; visible: boolean; revision: number; parentRevision: number; matrix: Matrix; rgba: Color; add: Color; sprite: MapoSpriteInput | null; }
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const same = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
function localMatrix(position: readonly number[], scale: readonly number[], angle: number, skew: readonly number[]): Matrix {
    const r = angle * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    const [ka, kb, kc, kd] = mapoPrefabSkew(skew[0], skew[1], 1, 1), sx = scale[0], sy = scale[1];
    return [cs * sx * ka - sn * sy * kb, sn * sx * ka + cs * sy * kb,
        cs * sx * kc - sn * sy * kd, sn * sx * kc + cs * sy * kd, position[0], position[1]];
}
function multiply(a: Matrix, b: Matrix): Matrix {
    return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function sample(track: IMapoPrefabTrack, time: number): number | readonly number[] | undefined {
    let i = track.keys.length - 1;
    while (i >= 0 && track.keys[i].time > time + 1e-7) i--;
    if (i < 0) return undefined;
    const k = track.keys[i], next = track.keys[i + 1];
    if (!next || !k.tween || next.time <= k.time) return k.value;
    const t = Math.max(0, Math.min(1, (time - k.time) / (next.time - k.time)));
    if (typeof k.value === "number" && typeof next.value === "number") return k.value + (next.value - k.value) * t;
    const b = next.value as readonly number[];
    return (k.value as readonly number[]).map((v, j) => v + (b[j] - v) * t);
}

export function compileMapoScene(root: IMapoPrefabNode) {
    const entries: Entry[] = [], order: number[] = [];
    function visit(node: IMapoPrefabNode, parent: number): void {
        const index = entries.length;
        entries.push({ node, parent, local: localMatrix(node.position, node.scale, node.angle, node.skew),
            rgb: node.color.slice(0, 3).map(v => v / 255), added: node.add.slice(0, 3).map(v => v / 255),
            motion: !!(node.frames?.length || node.tracks?.length) });
        const children = node.children.map((n, i) => ({ n, i })).sort((a, b) => a.n.z - b.n.z || a.i - b.i);
        for (const { n } of children) if (n.z < 0) visit(n, index);
        order.push(index);
        for (const { n } of children) if (n.z >= 0) visit(n, index);
    }
    visit(root, -1);
    return { entries, order, animated: mapoSceneAnimated(root) };
}
export type MapoSceneProgram = ReturnType<typeof compileMapoScene>;

/** 状态仅由可见实例持有；同一配置程序可供多个摆位共用。clear 时释放播放器和程序。 */
export function createMapoScenePlayer(program: MapoSceneProgram, cells: readonly IMapoPrefabCell[],
    atlas: readonly [number, number], placement: MapoPlacement): MapoSpriteSource & { readonly evaluatedNodes: number } {
    const states: State[] = [];
    let sprites: readonly MapoSpriteInput[] = [], initialized = false, evaluatedNodes = 0;
    const px = mapoOriginalPxToWorld(1);
    const base: State = { time: 0, visible: true, revision: 0, parentRevision: 0, matrix: IDENTITY, rgba: [1, 1, 1, 1], add: [0, 0, 0, 0], sprite: null };
    return { row: placement.row, col: placement.col, get evaluatedNodes() { return evaluatedNodes; },
        read(seconds: number): readonly MapoSpriteInput[] {
            evaluatedNodes = 0;
            if (initialized && !program.animated) return sprites;
            base.time = seconds;
            let changed = !initialized;
            for (let i = 0; i < program.entries.length; i++) {
                const e = program.entries[i], n = e.node, parent = e.parent < 0 ? base : states[e.parent], old = states[i];
                let time = parent.time, visible = parent.visible;
                if (n.event) { visible = visible && time >= n.event.start && time < n.event.start + n.event.duration; time -= n.event.start; }
                if (n.timeline) {
                    const t = n.timeline; time = Math.max(0, time * t.speed + t.offset);
                    if (t.duration > 0) time = t.loops > 0 && time >= t.duration * t.loops ? t.duration : time % t.duration;
                }
                if (old && !e.motion && old.parentRevision === parent.revision && old.visible === visible) { old.time = time; continue; }
                evaluatedNodes++;
                let position = n.position, scale = n.scale, angle = n.angle, skew = n.skew;
                let rgb = e.rgb, added = e.added, alpha = n.color[3] / 255, texture = n.texture;
                if (n.frames?.length) texture = n.frames[(Math.floor(time / (n.frameDuration ?? 1) * n.frames.length) + (n.frameStart ?? 0)) % n.frames.length];
                for (const track of n.tracks ?? []) {
                    const value = sample(track, time); if (value === undefined) continue;
                    switch (track.type) {
                        case 0: position = value as readonly number[]; break;
                        case 1: scale = value as readonly number[]; break;
                        case 2: angle = typeof value === "number" ? value : value[2]; break;
                        case 3: rgb = value as readonly number[]; break;
                        case 4: alpha = value as number; break;
                        case 5: texture = value as number; break;
                        case 12: added = value as readonly number[]; break;
                        case 13: skew = value as readonly number[]; break;
                        default: throw new Error(`未支持 prefab 轨道 ${track.type}`);
                    }
                }
                const local = position === n.position && scale === n.scale && angle === n.angle && skew === n.skew
                    ? e.local : localMatrix(position, scale, angle, skew);
                const m = multiply(parent.matrix, local);
                const rgba: Color = [rgb[0] * parent.rgba[0], rgb[1] * parent.rgba[1], rgb[2] * parent.rgba[2], alpha * parent.rgba[3]];
                const add: Color = [added[0] + parent.add[0], added[1] + parent.add[1], added[2] + parent.add[2], n.add[3] / 255 + parent.add[3]];
                const transformChanged = !old || !same(m, old.matrix) || !same(rgba, old.rgba) || !same(add, old.add) || visible !== old.visible;
                const cell = cells[texture];
                const shown = visible && !!cell && rgba[3] > 0 && n.size[0] > 0 && n.size[1] > 0;
                let sprite = old?.sprite ?? null;
                if (!shown) sprite = null;
                else {
                    const [x, y, w, h] = cell.rect;
                    const uv = mapoPrefabUv([x / atlas[0], y / atlas[1], w / atlas[0], h / atlas[1]], n.mirror[0], n.mirror[1]);
                    if (transformChanged || !sprite || sprite.textureWindow !== cell.window || sprite.textureId !== cell.textureId || !same(sprite.uv, uv)) {
                        sprite = { row: placement.row, col: placement.col, x: placement.x + m[4] * px, y: placement.y + m[5] * px,
                            w: n.size[0], h: n.size[1], pivot: [n.pivot[0], n.pivot[1]], skewBasis: [m[0] * px, m[1] * px, m[2] * px, m[3] * px],
                            rgba, addColor: add, textureWindow: cell.window, textureId: cell.textureId, uv };
                    }
                }
                if (sprite !== old?.sprite) changed = true;
                states[i] = { time, visible, parentRevision: parent.revision, revision: (old?.revision ?? 0) + Number(transformChanged),
                    matrix: m, rgba, add, sprite };
            }
            if (changed) sprites = program.order.map(i => states[i].sprite).filter((s): s is MapoSpriteInput => s !== null);
            initialized = true;
            return sprites;
        },
    };
}
