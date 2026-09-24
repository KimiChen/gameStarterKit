/**
 * 原版多边形**几何库**的共用解析（河流 / snow / desert 同一个布局）。纯逻辑，⛔ 不碰 cc。
 *
 * 布局（大端）：`u16 条数`，每条 `u8 tag, u16 nVerts, u16 nIdx, nVerts×{f32 x, f32 y}, nIdx×u16`。
 * 顶点是**原版 px 的局部坐标**（节点摆在河格/块的几何中心），这里统一换算成世界单位。
 * ⚠ 条数/长度对不上一律**拒收**：半截几何库会摆出错位的地貌，⛔ 比不画更难查。
 */
import { mapoOriginalPxToWorld } from "../../../shared/kits/mapOriginal/api/hexmap/index";

export interface IMapoPoly {
    /** 库里的分组标记（河流 = 水系 id；块层恒 0）。 */
    readonly tag: number;
    /** 局部顶点（**已是世界单位**）：`[x0, y0, x1, y1, …]`。 */
    readonly verts: Float32Array;
    /** 世界 UV 需要原版 Float32 像素，避免世界单位往返换算引入相位误差；按需保留。 */
    readonly originalVerts?: Float32Array;
    readonly indices: Uint16Array;
    readonly minX: number; readonly maxX: number;
    readonly minY: number; readonly maxY: number;
}

export function parseMapoPolyLib(buf: ArrayBuffer | Uint8Array, expect: number,
                                 what: string, retainOriginalVerts = false): IMapoPoly[] {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
    const n = v.getUint16(0);
    if (n !== expect) throw new Error(`mapOriginal ${what} 几何库 ${n} 条 ≠ ${expect}`);
    const out: IMapoPoly[] = [];
    let o = 2;
    for (let i = 0; i < n; i += 1) {
        const tag = v.getUint8(o);
        const nv = v.getUint16(o + 1), ni = v.getUint16(o + 3);
        o += 5;
        const verts = new Float32Array(nv * 2);
        const originalVerts = retainOriginalVerts ? new Float32Array(nv * 2) : undefined;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let k = 0; k < nv; k += 1) {
            const px = v.getFloat32(o), py = v.getFloat32(o + 4);
            if (originalVerts) { originalVerts[k * 2] = px; originalVerts[k * 2 + 1] = py; }
            const x = mapoOriginalPxToWorld(px), y = mapoOriginalPxToWorld(py);
            o += 8;
            verts[k * 2] = x; verts[k * 2 + 1] = y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const indices = new Uint16Array(ni);
        for (let k = 0; k < ni; k += 1) { indices[k] = v.getUint16(o); o += 2; }
        if (nv === 0) { minX = maxX = minY = maxY = 0; }
        out.push({ tag, verts, originalVerts, indices, minX, maxX, minY, maxY });
    }
    if (o !== u.length) throw new Error(`mapOriginal ${what} 几何库有 ${u.length - o} B 残留`);
    return out;
}
