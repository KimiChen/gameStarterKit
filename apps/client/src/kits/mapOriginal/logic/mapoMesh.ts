/**
 * 菱形网格几何。产出的是**纯数组**（positions/uvs/colors/indices16），⛔ 不碰 cc。
 *
 * ⚠ 几何要点（已验算）：等距菱形以 a=(TW,TH)、b=(0.5TW,−1.5TH) 铺面，|det| = 2·TW·TH
 * 恰等于半对角 TW,TH 的菱形面积 ⇒ **无缝无叠**。每格 4 顶点 / 6 索引，顶点取 N/E/S/W 四点。
 * ⚠ 画家序是纯整数排序：(row+col) 升序、(row−col) 升序。⛔ 不要用浮点 y 去比。
 */
import {
    MAPO_TILE_HALF_H, MAPO_TILE_HALF_W, mapoGrid2Pos,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";

export interface MapoGeometry {
    readonly positions: Float32Array;
    readonly uvs: Float32Array;
    readonly colors: Float32Array;
    readonly indices16: Uint16Array;
    readonly quads: number;
    readonly minPos: readonly [number, number, number];
    readonly maxPos: readonly [number, number, number];
}
/** Uint16 索引上限 ⇒ 单个 mesh 的四边形数硬顶。超了必须拆 mesh。 */
export const MAPO_MAX_QUADS_PER_MESH = 16_383;

/** 画家序比较：先 (row+col)，再 (row−col)。⛔ 两者都要，否则同一条斜线上的次序不稳定。 */
export function mapoPainterCompare(a: { row: number; col: number }, b: { row: number; col: number }): number {
    const sa = a.row + a.col, sb = b.row + b.col;
    if (sa !== sb) return sa - sb;
    return (a.row - a.col) - (b.row - b.col);
}

/*
 * ⚠ **逐格菱形贴片 `buildMapoDiamondMesh` 已在 M2-B1 删除**：地表底改成「一块 10×10 格 +
 *   一张底纹整数次 GL_REPEAT」（`buildMapoGroundMesh`），⛔ 别把逐格贴片加回来。
 */

/** 一张整幅底图的四边形（远档用）。 */
export function buildMapoPlateMesh(bounds: { minX: number; minY: number; maxX: number; maxY: number },
                                   rgba: readonly [number, number, number, number] = [1, 1, 1, 1]): MapoGeometry {
    const positions = new Float32Array([
        bounds.minX, bounds.maxY, 0, bounds.maxX, bounds.maxY, 0,
        bounds.maxX, bounds.minY, 0, bounds.minX, bounds.minY, 0,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const colors = new Float32Array(16);
    for (let v = 0; v < 4; v += 1) for (let k = 0; k < 4; k += 1) colors[v * 4 + k] = rgba[k];
    return {
        positions, uvs, colors, indices16: new Uint16Array([0, 1, 2, 0, 2, 3]), quads: 1,
        minPos: [bounds.minX, bounds.minY, 0], maxPos: [bounds.maxX, bounds.maxY, 0],
    };
}

/**
 * 把一条线段铺成一个带宽度的四边形（行军线用）。
 * ⚠ 零长度线段要直接跳过，⛔ 否则法线是 NaN、整张 mesh 报废。
 */
export function writeMapoSegmentQuad(x0: number, y0: number, x1: number, y1: number,
                                     halfWidth: number): readonly (readonly [number, number])[] | null {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-6)) return null;
    const nx = (-dy / len) * halfWidth, ny = (dx / len) * halfWidth;
    return [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
}

export interface MapoPolyInput {
    readonly points: readonly (readonly [number, number])[];
    readonly rgba: readonly [number, number, number, number];
    /**
     * 逐顶点色（四个）。给了就**顶替** rgba —— 过渡片靠它做「贴边不透明、往格内化开」的 alpha 斜坡。
     * ⛔ 不要用它做整片染色，那是 rgba 的活。
     */
    readonly rgbas?: readonly (readonly [number, number, number, number])[];
    /** 逐顶点 UV（四个，已是图集归一化坐标）。不贴图就不给。 */
    readonly uvs?: readonly (readonly [number, number])[];
}

/** 由任意四边形（四角，顺时针或逆时针）铺 mesh；给行军线、远档色块与过渡片共用。 */
export function buildMapoPolyMesh(polys: readonly MapoPolyInput[]): MapoGeometry {
    if (polys.length > MAPO_MAX_QUADS_PER_MESH) {
        throw new RangeError(`SGZZ poly quads ${polys.length} > ${MAPO_MAX_QUADS_PER_MESH}`);
    }
    const n = polys.length;
    const positions = new Float32Array(n * 4 * 3);
    const uvs = new Float32Array(n * 4 * 2);
    const colors = new Float32Array(n * 4 * 4);
    const indices16 = new Uint16Array(n * 6);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i += 1) {
        const { points, rgba, rgbas, uvs: pointUvs } = polys[i];
        for (let v = 0; v < 4; v += 1) {
            const px = points[v][0], py = points[v][1];
            positions[(i * 4 + v) * 3] = px;
            positions[(i * 4 + v) * 3 + 1] = py;
            positions[(i * 4 + v) * 3 + 2] = 0;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            const c = rgbas ? rgbas[v] : rgba;
            for (let k = 0; k < 4; k += 1) colors[(i * 4 + v) * 4 + k] = c[k];
            if (pointUvs) {
                uvs[(i * 4 + v) * 2] = pointUvs[v][0];
                uvs[(i * 4 + v) * 2 + 1] = pointUvs[v][1];
            }
        }
        const base = i * 4;
        indices16.set([base, base + 1, base + 2, base, base + 2, base + 3], i * 6);
    }
    if (n === 0) { minX = minY = maxX = maxY = 0; }
    return { positions, uvs, colors, indices16, quads: n, minPos: [minX, minY, 0], maxPos: [maxX, maxY, 0] };
}

/**
 * 一格的网格线：只画 **NE / SE** 两条边。
 *
 * ⚠ 平面上每条边恰好是某一格的 NE 或 SE 边（一格的 NE 边 = 右上邻格的 SW 边），
 * 所以逐格画两条就铺满整张网，⛔ 画四条会把每条内部边画两遍 ——
 * 四边形翻倍，而且半透明线叠加后会一深一浅，看起来像脏了。
 * ⚠ 线宽是**世界单位**：调用方要按 `屏幕像素 / scale` 折算，否则拉近了变粗、拉远了消失。
 */
export function mapoGridEdgePolys(row: number, col: number, halfWidth: number,
                                  rgba: readonly [number, number, number, number]):
    { readonly points: readonly (readonly [number, number])[]; readonly rgba: readonly [number, number, number, number] }[] {
    const c = mapoGrid2Pos(row, col);
    const hw = MAPO_TILE_HALF_W, hh = MAPO_TILE_HALF_H;
    const out: { points: readonly (readonly [number, number])[]; rgba: readonly [number, number, number, number] }[] = [];
    // N→E（右上边）与 E→S（右下边）
    for (const [x0, y0, x1, y1] of [
        [c.x, c.y + hh, c.x + hw, c.y],
        [c.x + hw, c.y, c.x, c.y - hh],
    ]) {
        const points = writeMapoSegmentQuad(x0, y0, x1, y1, halfWidth);
        if (points) out.push({ points, rgba });
    }
    return out;
}

/**
 * 菱形边界上的六个点（本格局部坐标）：S → W → NW中点 → N → E → SE中点。
 *
 * ★ `resDir` i 的共享边界**正好**是第 i 段（RING[i-1] → RING[i%6]）——六段首尾相接绕一圈。
 * 其中 `resDir` 1（SW）与 4（NE）是**整条**菱形边；2/3（NW）与 5/6（SE）各是**半条**——
 * 这套铺法是「错缝砌砖」，NW / SE 两条边各挨着两个邻格，所以一人一半。
 * ⚠ 与行奇偶**无关**（两种奇偶实测一致）。
 */
const BORDER_RING: readonly (readonly [number, number])[] = [
    [0, -MAPO_TILE_HALF_H],                          // S
    [-MAPO_TILE_HALF_W, 0],                          // W
    [-MAPO_TILE_HALF_W / 2, MAPO_TILE_HALF_H / 2],   // NW 中点
    [0, MAPO_TILE_HALF_H],                           // N
    [MAPO_TILE_HALF_W, 0],                           // E
    [MAPO_TILE_HALF_W / 2, -MAPO_TILE_HALF_H / 2],   // SE 中点
];
/** 往格心收一点，让边条落在菱形**内缘**而不是骑在边上（骑着会和邻格的边条打架）。 */
const BORDER_INSET = 0.88;

/**
 * 一格在 resDir(1..6) 方向上的**边界条**：画在该方向真正的共享边界上，略向内收。
 *
 * ⛔ 早先两版都错过：
 *  ① 把 resDir 整个丢掉、每个边界方向铺一整格菱形 —— 孤地 6 个方向叠 6 层 alpha 0.85
 *    ⇒ 几乎不透明，把底下的领地色完全盖住（真机上那格是黄的而不是蓝的）；
 *  ② 改画「到邻格连线的中垂线」—— 方向对了但位置不对，六段互不相接、还戳出格外，
 *    看着像六道乱划的斜杠。共享边界不是中垂线，是上面 BORDER_RING 的那一段。
 */
export function mapoBorderStripPoly(row: number, col: number, resDir: number, halfWidth: number,
                                    rgba: readonly [number, number, number, number]):
    { readonly points: readonly (readonly [number, number])[]; readonly rgba: readonly [number, number, number, number] } | null {
    if (!Number.isInteger(resDir) || resDir < 1 || resDir > 6) return null;
    const c = mapoGrid2Pos(row, col);
    const a = BORDER_RING[resDir - 1], b = BORDER_RING[resDir % 6];
    const points = writeMapoSegmentQuad(
        c.x + a[0] * BORDER_INSET, c.y + a[1] * BORDER_INSET,
        c.x + b[0] * BORDER_INSET, c.y + b[1] * BORDER_INSET, halfWidth);
    return points ? { points, rgba } : null;
}

/**
 * 选中框的四条边（菱形轮廓）。返回**设计单位**下的条形描述，由 View 摆成四块旋转底板。
 *
 * ⚠ 菱形是 2:1，⛔ 不是正方形转 45° —— 边的倾角是 `atan2(TH, TW)` ≈ 26.565°，不是 45°。
 * 早先用四条轴对齐的长条围成**长方形**（菱形的包围盒），在菱形网格上看着格格不入。
 * `angle` 是 Cocos 的角度（度、逆时针）；条形左右对称，所以模 180° 等价。
 */
export function mapoSelectionEdges(thickness: number, overhang = 0):
    readonly { readonly x: number; readonly y: number; readonly length: number;
               readonly thickness: number; readonly angle: number }[] {
    const hw = MAPO_TILE_HALF_W, hh = MAPO_TILE_HALF_H;
    const edge = Math.hypot(hw, hh);
    const tilt = Math.atan2(hh, hw) * 180 / Math.PI;
    // 四条边的中点与倾角：NE / SE / SW / NW
    return [
        { x: hw / 2, y: hh / 2, angle: -tilt, length: edge + overhang, thickness },
        { x: hw / 2, y: -hh / 2, angle: tilt, length: edge + overhang, thickness },
        { x: -hw / 2, y: -hh / 2, angle: -tilt, length: edge + overhang, thickness },
        { x: -hw / 2, y: hh / 2, angle: tilt, length: edge + overhang, thickness },
    ];
}

/**
 * 把一批**带 UV 的矩形精灵**铺成一张 mesh（摆件层用）。
 *
 * ⚠ 精灵是**底边中点**对齐到 (x, y)：地物立在格上，往上长 —— ⛔ 不是几何中心对齐。
 * ⚠ 入参会被就地排序成**画家序**（屏幕越低越靠前）：摆件超出菱形、会互相叠压，
 *   顺着可视模板的遍历序画会前后颠倒。
 */
export interface MapoSpriteInput {
    readonly row: number;
    readonly col: number;
    /** 底边中点的世界坐标。 */
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly uv: readonly [number, number, number, number];
    /**
     * 绕**精灵中心**的旋转（度，CCW 为正）。缺省 / 0 走原来的轴对齐快路径。
     * ⚠ 这是原版 prefab 里 sprite 的 `angle.z`（山族 13 形里只有 2 形非零，≤1.75°）。
     */
    readonly angleDeg?: number;
}

export function buildMapoSpriteMesh(sprites: MapoSpriteInput[]): MapoGeometry {
    sprites.sort(mapoPainterCompare);
    const n = Math.min(sprites.length, MAPO_MAX_QUADS_PER_MESH);
    const positions = new Float32Array(n * 12);
    const uvs = new Float32Array(n * 8);
    const colors = new Float32Array(n * 16);
    const indices16 = new Uint16Array(n * 6);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i += 1) {
        const s = sprites[i];
        const x0 = s.x - s.w / 2, x1 = s.x + s.w / 2, y0 = s.y, y1 = s.y + s.h;
        const [u0, v0, uw, vh] = s.uv;
        const deg = s.angleDeg ?? 0;
        if (deg === 0) {
            positions.set([x0, y1, 0, x1, y1, 0, x1, y0, 0, x0, y0, 0], i * 12);
        } else {
            // ⚠ 绕**中心**转（原版 sprite 的 pivot 恒 [0.5, 0.5]），⛔ 不是绕底边中点
            const cx = s.x, cy = s.y + s.h / 2;
            const r = (deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
            const rot = (px: number, py: number): [number, number] => {
                const dx = px - cx, dy = py - cy;
                return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
            };
            const [ax, ay] = rot(x0, y1), [bx, by] = rot(x1, y1);
            const [cx2, cy2] = rot(x1, y0), [dx2, dy2] = rot(x0, y0);
            positions.set([ax, ay, 0, bx, by, 0, cx2, cy2, 0, dx2, dy2, 0], i * 12);
        }
        uvs.set([u0, v0, u0 + uw, v0, u0 + uw, v0 + vh, u0, v0 + vh], i * 8);
        for (let v = 0; v < 16; v += 1) colors[i * 16 + v] = 1;   // ⚠ 贴图件取纯白，顶点色是相乘的
        const b = i * 4;
        indices16.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
        if (x0 < minX) minX = x0;
        if (x1 > maxX) maxX = x1;
        if (y0 < minY) minY = y0;
        if (y1 > maxY) maxY = y1;
    }
    if (n === 0) { minX = minY = maxX = maxY = 0; }
    return { positions, uvs, colors, indices16, quads: n,
             minPos: [minX, minY, 0], maxPos: [maxX, maxY, 0] };
}

/** 一片三角化好的多边形（河流 / 地貌带的 `polygon_2d`）。 */
export interface MapoPolygonInput {
    /** 画家序键（等距量 s = row + col，越大越靠屏幕下方）。 */
    readonly s: number;
    /** 多边形原点的世界坐标（局部顶点加在它上面）。 */
    readonly x: number;
    readonly y: number;
    /** 局部顶点，`[x0, y0, x1, y1, …]`，**已是世界单位**。 */
    readonly verts: Float32Array;
    /** 三角索引（指向 verts 的顶点下标）。 */
    readonly indices: Uint16Array;
    /** 整片的 UV（平色填充 ⇒ 所有顶点同一个点）。⚠ 给了 `uvs` 就以 `uvs` 为准。 */
    readonly uv: readonly [number, number];
    /**
     * 逐顶点 UV（`[u0, v0, u1, v1, …]`，与 `verts` 同长）。
     * ⚠ 块级地貌带靠它做**世界投影 + GL_REPEAT** ⇒ 值会**大于 1**，⛔ 不是图集归一化坐标。
     */
    readonly uvs?: Float32Array;
    /** 整片的顶点色（0..1）。 */
    readonly rgba: readonly [number, number, number, number];
}

/**
 * 多边形合批。⚠ 与 `buildMapoSpriteMesh` 的区别：
 *   ① 顶点数/索引数**逐片不同**（⛔ 不能按「每片 4 顶点 6 索引」预算）；
 *   ② 三角化是**原版 prefab 自带的**（`polygon_2d.indices`），⛔ 我们不做耳切；
 *   ③ UV 是**整片一个点**（原版填充图是 2×2 单一平色）—— 色相走顶点色。
 * ⚠ 顶点上限按 u16 索引封顶（65,535），超了**截断并如实少画**，
 * ⛔ 不要悄悄换 u32：`MapoMeshBatch` 的索引缓冲是 16 位的。
 */
export const MAPO_MAX_VERTS_PER_MESH = 65_535;

export function buildMapoPolygonMesh(polys: MapoPolygonInput[]): MapoGeometry {
    const sorted = polys.slice().sort((a, b) => a.s - b.s);   // 画家序：屏幕从上到下
    let nv = 0, ni = 0;
    let take = 0;
    for (const p of sorted) {
        const vc = p.verts.length >> 1;
        if (nv + vc > MAPO_MAX_VERTS_PER_MESH) break;
        nv += vc; ni += p.indices.length; take += 1;
    }
    const positions = new Float32Array(nv * 3);
    const uvs = new Float32Array(nv * 2);
    const colors = new Float32Array(nv * 4);
    const indices16 = new Uint16Array(ni);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let vAt = 0, iAt = 0;
    for (let k = 0; k < take; k += 1) {
        const p = sorted[k];
        const base = vAt;
        const vc = p.verts.length >> 1;
        for (let v = 0; v < vc; v += 1) {
            const x = p.x + p.verts[v * 2], y = p.y + p.verts[v * 2 + 1];
            positions[(base + v) * 3] = x;
            positions[(base + v) * 3 + 1] = y;
            positions[(base + v) * 3 + 2] = 0;
            if (p.uvs) {
                uvs[(base + v) * 2] = p.uvs[v * 2];
                uvs[(base + v) * 2 + 1] = p.uvs[v * 2 + 1];
            } else {
                uvs[(base + v) * 2] = p.uv[0];
                uvs[(base + v) * 2 + 1] = p.uv[1];
            }
            colors.set(p.rgba, (base + v) * 4);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        for (let i = 0; i < p.indices.length; i += 1) indices16[iAt + i] = base + p.indices[i];
        vAt += vc;
        iAt += p.indices.length;
    }
    if (vAt === 0) { minX = minY = maxX = maxY = 0; }
    // ⚠ `quads` 在多边形网格里没有意义，按「索引数 / 6」折算只为让上传路径统一
    return { positions, uvs, colors, indices16, quads: Math.ceil(ni / 6),
             minPos: [minX, minY, 0], maxPos: [maxX, maxY, 0] };
}

/** 一块地表底（菱形 + 逐顶点 UV）。 */
export interface MapoGroundInput {
    /** 画家序键。 */
    readonly key: number;
    /** 块几何中心的世界坐标。 */
    readonly x: number;
    readonly y: number;
    readonly halfW: number;
    readonly halfH: number;
    /** W / N / E / S 四角的 UV（wrap = REPEAT，**值会大于 1**）。 */
    readonly uv: readonly (readonly [number, number])[];
}

/**
 * 地表底合批：每块一个菱形、四角带**大于 1 的 UV**（靠 `GL_REPEAT` 平铺）。
 * ⚠ 顶点序与 `buildMapoDiamondMesh` 一致（N/E/S/W），⛔ 别改成 W/N/E/S，
 *   否则两个三角形会自交。UV 表按 W/N/E/S 给（与原版 `GROUND_PIC_TBL` 同序），这里换序取。
 */
export function buildMapoGroundMesh(blocks: readonly MapoGroundInput[]): MapoGeometry {
    const n = Math.min(blocks.length, MAPO_MAX_QUADS_PER_MESH);
    const positions = new Float32Array(n * 12);
    const uvs = new Float32Array(n * 8);
    const colors = new Float32Array(n * 16);
    const indices16 = new Uint16Array(n * 6);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    // 原版 GROUND_PIC_TBL 的次序是 W/N/E/S；顶点按 N/E/S/W 走 ⇒ 取 UV 时换序
    const ORDER = [1, 2, 3, 0];
    for (let i = 0; i < n; i += 1) {
        const b = blocks[i];
        const pts: readonly (readonly [number, number])[] = [
            [b.x, b.y + b.halfH], [b.x + b.halfW, b.y], [b.x, b.y - b.halfH], [b.x - b.halfW, b.y],
        ];
        for (let v = 0; v < 4; v += 1) {
            const px = pts[v][0], py = pts[v][1];
            positions[(i * 4 + v) * 3] = px;
            positions[(i * 4 + v) * 3 + 1] = py;
            positions[(i * 4 + v) * 3 + 2] = 0;
            const uv = b.uv[ORDER[v]];
            uvs[(i * 4 + v) * 2] = uv[0];
            uvs[(i * 4 + v) * 2 + 1] = uv[1];
            for (let k = 0; k < 4; k += 1) colors[(i * 4 + v) * 4 + k] = 1;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }
        const base = i * 4;
        indices16.set([base, base + 1, base + 2, base, base + 2, base + 3], i * 6);
    }
    if (n === 0) { minX = minY = maxX = maxY = 0; }
    return { positions, uvs, colors, indices16, quads: n,
             minPos: [minX, minY, 0], maxPos: [maxX, maxY, 0] };
}
