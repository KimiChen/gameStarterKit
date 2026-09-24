/** O6：稳定画家序下复用静态几何；只写改变的 quad，按属性记录最后一个脏 quad。 */
import { buildMapoSpriteMesh, buildMapoSpriteMeshes, mapoPainterCompare, MAPO_MAX_QUADS_PER_MESH, type MapoGeometry, type MapoSpriteInput } from "./mapoMesh";
import type { MapoSpriteSource } from "./mapoSceneCompiled";

export interface MapoSpriteUpdate { readonly geometry: MapoGeometry; readonly full: boolean; readonly ends: readonly number[]; }
const streams = (g: MapoGeometry): Float32Array[] => [g.positions, g.uvs, g.colors, g.addColors!];
const STRIDES = [12, 8, 16, 16];
export class MapoSpriteUpdates {
    private sources: readonly MapoSpriteSource[] = [];
    private parts: readonly (readonly MapoSpriteInput[])[] = [];
    private geometries: MapoGeometry[] = [];
    get batchCount(): number { return this.geometries.length; }
    get size(): number { return this.parts.reduce((n, p) => n + p.length, 0); }
    reset(sources: readonly MapoSpriteSource[]): void { this.clear(); this.sources = sources.slice().sort(mapoPainterCompare); }
    clear(): void { this.sources = []; this.parts = []; this.geometries = []; }
    read(seconds: number): readonly MapoSpriteUpdate[] {
        const next = this.sources.map(s => s.read(seconds));
        if (next.length === this.parts.length && next.every((p, i) => p === this.parts[i])) return [];
        if (next.length !== this.parts.length || next.some((p, i) => p.length !== this.parts[i].length)) {
            this.parts = next;
            this.geometries = buildMapoSpriteMeshes(next.reduce<MapoSpriteInput[]>((out, p) => { out.push(...p); return out; }, []));
            return this.geometries.map(geometry => ({ geometry, full: true, ends: [0, 0, 0, 0] }));
        }
        const dirty = this.geometries.map(() => [0, 0, 0, 0]);
        let offset = 0;
        for (let part = 0; part < next.length; part++) {
            if (next[part] !== this.parts[part]) for (let i = 0; i < next[part].length; i++) {
                if (next[part][i] === this.parts[part][i]) continue;
                const global = offset + i, batch = Math.floor(global / MAPO_MAX_QUADS_PER_MESH), at = global % MAPO_MAX_QUADS_PER_MESH;
                const target = streams(this.geometries[batch]), quad = streams(buildMapoSpriteMesh([next[part][i]]));
                for (let attr = 0; attr < 4; attr++) {
                    const start = at * STRIDES[attr];
                    if (quad[attr].some((v, j) => v !== target[attr][start + j])) {
                        target[attr].set(quad[attr], start); dirty[batch][attr] = at + 1;
                    }
                }
            }
            offset += next[part].length;
        }
        this.parts = next;
        return this.geometries.map((geometry, i) => {
            if (dirty[i][0]) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                const p = geometry.positions;
                for (let j = 0; j < p.length; j += 3) { minX = Math.min(minX, p[j]); maxX = Math.max(maxX, p[j]); minY = Math.min(minY, p[j + 1]); maxY = Math.max(maxY, p[j + 1]); }
                geometry = { ...geometry, minPos: [minX, minY, 0], maxPos: [maxX, maxY, 0] }; this.geometries[i] = geometry;
            }
            return { geometry, full: false, ends: dirty[i] };
        });
    }
}
