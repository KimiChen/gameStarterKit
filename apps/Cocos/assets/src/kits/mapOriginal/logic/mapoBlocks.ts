/**
 * snow / desert 的 **block 级地貌带**：叠在地表底之上。纯逻辑，⛔ 不碰 cc。
 *
 * ★ 三层是「**叠**」不是「替」（MAPORIGINAL-2D §1.3）：同一块可以同时挂草地底 + 沙漠 + 雪
 *   （实测 489 块两者兼有），次序 ground(100) < desert(200) < snow(300)。
 * ★ 网格与地表底同构（152² 块 / 一块 10×10 格 / 原点 −10），
 *   ⚠ 但数据是**行主序** —— ⛔ 与 `river.bytes` 的列主序不同（打包期已折算，这里只读 s/d）。
 * ★ 字节值就是路径表下标，选片**制图期烘死**，运行时 ⛔ 零判断。
 * ⚠ UV 用**与地表底相同的块级世界投影**（同周期、同相位、锚在块中心）：
 *   原版 `polygon_2d` 的 uvs 全零、真式子在引擎侧 —— 这是有依据的推断，
 *   取它是因为只有它能让**块边界落在整周期上**（§1.4 的设计意图）。
 *   ⛔ 别改成按多边形自身包围盒投影：边缘片比整块小，相邻块的花纹相位会跳。
 */
import {
    MAPO_BLOCK_D_BIAS, MAPO_BLOCK_HEADER_BYTES, MAPO_BLOCK_LAYERS, MAPO_BLOCK_RECORD_BYTES,
    MAPO_BLOCK_S_BIAS, type IMapoBlockLayer,
} from "../../../shared/kits/mapOriginal/content/blocks.data";
import { MAPO_GROUND_HALF_H, MAPO_GROUND_HALF_W, mapoGroundBlockPos } from "./mapoGround";
import { MAPO_GROUND_BLOCK_TILES, MAPO_GROUND_ORIGIN } from "../../../shared/kits/mapOriginal/content/ground.data";
import type { MapoPolygonInput } from "./mapoMesh";
import { parseMapoPolyLib, type IMapoPoly } from "./mapoPolyLib";

interface Layer {
    readonly meta: IMapoBlockLayer;
    geos: IMapoPoly[];
    /** 逐条预算好的世界投影 UV（几何是固定的 51/52 条 ⇒ ⛔ 不用每帧算）。 */
    uvs: Float32Array[];
    view: DataView | null;
    count: number;
}

export const MAPO_BLOCK_KINDS: readonly string[] = MAPO_BLOCK_LAYERS.map((l) => l.kind);

export interface IMapoBlockRect {
    readonly left: number; readonly right: number;
    readonly bottom: number; readonly top: number;
}

/** 地图实例的数据读取器；dispose 清空运行时解码结果和 Buffer 视图。 */
export function createMapoBlocksData() {
    const LAYERS: Map<string, Layer> = new Map(
        MAPO_BLOCK_LAYERS.map((meta) => [meta.kind, { meta, geos: [], uvs: [], view: null, count: 0 }]));

    /** 局部顶点 → 块级世界投影 UV（与地表底同式）。 */
    function projectUv(verts: Float32Array, repeat: readonly [number, number]): Float32Array {
        const out = new Float32Array(verts.length);
        const bw = MAPO_GROUND_HALF_W * 2, bh = MAPO_GROUND_HALF_H * 2;
        for (let k = 0; k < verts.length; k += 2) {
            out[k] = (verts[k] / bw + 0.5) * repeat[0];
            out[k + 1] = (0.5 - verts[k + 1] / bh) * repeat[1];
        }
        return out;
    }

    function mapoSetBlockGeo(kind: string, buf: ArrayBuffer | Uint8Array): void {
        const layer = LAYERS.get(kind);
        if (!layer) throw new Error(`mapOriginal 没有 ${kind} 这一层`);
        layer.geos = parseMapoPolyLib(buf, layer.meta.geoCount, kind);
        layer.uvs = layer.geos.map((g) => projectUv(g.verts, layer.meta.repeat));
    }

    function mapoSetBlocks(kind: string, buf: ArrayBuffer | Uint8Array): void {
        const layer = LAYERS.get(kind);
        if (!layer) throw new Error(`mapOriginal 没有 ${kind} 这一层`);
        const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        if (u.length < MAPO_BLOCK_HEADER_BYTES) throw new Error(`mapOriginal ${kind} 表太短`);
        const n = (u[0] << 24) | (u[1] << 16) | (u[2] << 8) | u[3];
        if (u.length !== MAPO_BLOCK_HEADER_BYTES + n * MAPO_BLOCK_RECORD_BYTES) {
            throw new Error(`mapOriginal ${kind} 表长度不符：${n} 条 / ${u.length} B`);
        }
        layer.view = new DataView(u.buffer, u.byteOffset, u.byteLength);
        layer.count = n;
    }

    function mapoHasBlocks(kind: string): boolean {
        const l = LAYERS.get(kind);
        return !!l && l.view !== null && l.geos.length > 0;
    }

    function mapoBlockCount(kind: string): number { return LAYERS.get(kind)?.count ?? 0; }

    /**
     * 某一层在可视矩形里的片，**已是画家序**（表的落盘序，按 s 升序）。
     * ⚠ 这里只做**线性扫 + 矩形裁剪**：全图才 4~5 千块，⛔ 犯不上为它建二分。
     */
    function mapoBlocksInRect(kind: string, rect: IMapoBlockRect,
                                     limit: number): MapoPolygonInput[] {
        const layer = LAYERS.get(kind);
        if (!layer || !layer.view || layer.count === 0) return [];
        const out: MapoPolygonInput[] = [];
        for (let i = 0; i < layer.count && out.length < limit; i += 1) {
            const o = MAPO_BLOCK_HEADER_BYTES + i * MAPO_BLOCK_RECORD_BYTES;
            const s = layer.view.getUint16(o) - MAPO_BLOCK_S_BIAS;
            const d = layer.view.getUint16(o + 2) - MAPO_BLOCK_D_BIAS;
            const geo = layer.geos[layer.view.getUint8(o + 4) - 1];
            if (!geo) continue;
            const row = (s + d) / 2, col = (s - d) / 2;
            const p = mapoGroundBlockPos((row - MAPO_GROUND_ORIGIN) / MAPO_GROUND_BLOCK_TILES,
                                         (col - MAPO_GROUND_ORIGIN) / MAPO_GROUND_BLOCK_TILES);
            if (p.x + geo.maxX < rect.left || p.x + geo.minX > rect.right) continue;
            if (p.y + geo.minY > rect.top || p.y + geo.maxY < rect.bottom) continue;
            out.push({ s, x: p.x, y: p.y, geo: layer.view.getUint8(o + 4),
                       verts: geo.verts, indices: geo.indices,
                       uv: [0, 0], uvs: layer.uvs[layer.view.getUint8(o + 4) - 1],
                       rgba: [1, 1, 1, 1] });
        }
        return out;
    }

    /** O0 只读持有量：不触发惰性解码；对象数量不冒充 JS 堆字节，BufferAsset 别再重复相加。 */
    function mapoBlocksDataUsage(): Readonly<Record<string, number>> {
        return { arrayBufferBytes: [...LAYERS.values()].reduce((sum, l) => sum + (l.view?.buffer.byteLength ?? 0)
            + l.geos.reduce((n, g) => n + g.verts.byteLength + g.indices.byteLength, 0)
            + l.uvs.reduce((n, uv) => n + uv.byteLength, 0), 0),
            polygons: [...LAYERS.values()].reduce((sum, l) => sum + l.geos.length, 0),
            placements: [...LAYERS.values()].reduce((sum, l) => sum + l.count, 0) };
    }

    return { mapoSetBlockGeo, mapoSetBlocks, mapoHasBlocks, mapoBlockCount, mapoBlocksInRect, mapoBlocksDataUsage,
        dispose(): void { for (const layer of LAYERS.values()) { layer.geos = []; layer.uvs = []; layer.view = null; layer.count = 0; } },
    };
}

/** 兼容离线烘焙与已有测试；地图运行时必须使用 MapoDataStore 的独立读取器。 */
export const { mapoSetBlockGeo, mapoSetBlocks, mapoHasBlocks, mapoBlockCount, mapoBlocksInRect, mapoBlocksDataUsage } = createMapoBlocksData();
