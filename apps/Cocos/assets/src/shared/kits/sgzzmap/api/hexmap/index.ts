/**
 * sgzzmap hexmap v1：坐标、六邻、等距投影、LOD 分档与地形内容的零依赖单源。
 *
 * 全部公式逐式取自《三国志·战略版》2084.1768 的反编译可读源码
 * （/Volumes/KimData/unlockTheWorld/sourceVersion/sgzz-2084.1768/src-lua）：
 *   六邻方向表   script/logic/army_move/move_util.lua:2-19   （按 row 奇偶分表，⚠ 表内次序即 dirIndex）
 *   dirIndex     script/logic/army_move/move_util.lua:82
 *   cube 换算    script/logic/mapmodel/layermodel/map_lua.lua:57-71
 *   grid2pos     script/util/coord_util.lua（源行 121-131）
 *   pos2gridRaw  script/util/coord_util.lua（源行 133-151）
 *   环序          script/util/coord_util.lua get_around_list_order（供六向描边用）
 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError } from "../../../../protocol/http";
import { rpcRecord as requireRecord } from "../../../../protocol/lobbyRpc/primitives";

// ── 尺寸与线型常量 ────────────────────────────────────────────────────────────

/** 标准图格数（原作 config_2d/config_3d 的 MAP_WIDTH/MAP_HEIGHT）。 */
export const SGZZ_MAP_ROWS = 1500;
export const SGZZ_MAP_COLS = 1500;
/** 线型 cell key = row*10000+col；1500×1500 上限 14 999 999 < 2^31，MySQL INT UNSIGNED 放得下。 */
export const SGZZ_CELL_STRIDE = 10000;
export const SGZZ_MAX_CELL = SGZZ_MAP_ROWS * SGZZ_CELL_STRIDE;
/** 半对角（设计像素 @ scale 1）。一格读作 2×halfW × 2×halfH 的菱形，世界包围盒恰好 2:1。 */
export const SGZZ_TILE_HALF_W = 32;
export const SGZZ_TILE_HALF_H = 16;
/** 近景 chunk 边长（格）。对齐原作 BLOCK_SIZE=10，且与最细一档鸟瞰 chunk 同尺寸。 */
export const SGZZ_CHUNK_TILES = 10;

// ── 六邻与方向 ────────────────────────────────────────────────────────────────

export type SgzzOffset = readonly [number, number];

/**
 * 六邻偏移（row, col），按 row 奇偶分表。
 * ⚠ 表内次序有语义：下标 i（0 基）+1 就是 dirIndex，美术边片与行军方向都按它取。
 * ⛔ 不要为了「好看」重排。
 */
export const SGZZ_NEIGHBOURS_EVEN: readonly SgzzOffset[] = Object.freeze([
    [0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1],
] as const);
export const SGZZ_NEIGHBOURS_ODD: readonly SgzzOffset[] = Object.freeze([
    [0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0],
] as const);

/**
 * 环序（顺时针，按屏幕角度排好）。六向描边按它取 res_dir = 1..6。
 * ⚠ 与 SGZZ_NEIGHBOURS_* 是同一组邻居的**不同次序**：描边要连续绕圈，行军要方向编号。
 */
export const SGZZ_RING_EVEN: readonly SgzzOffset[] = Object.freeze([
    [0, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0],
] as const);
export const SGZZ_RING_ODD: readonly SgzzOffset[] = Object.freeze([
    [0, 1], [-1, 1], [-1, 0], [0, -1], [1, 0], [1, 1],
] as const);

export function sgzzNeighbourTable(row: number): readonly SgzzOffset[] {
    return (row & 1) === 0 ? SGZZ_NEIGHBOURS_EVEN : SGZZ_NEIGHBOURS_ODD;
}
export function sgzzRingTable(row: number): readonly SgzzOffset[] {
    return (row & 1) === 0 ? SGZZ_RING_EVEN : SGZZ_RING_ODD;
}

export interface ISgzzCell { readonly row: number; readonly col: number }

/** 六邻，已按地图边界裁剪。 */
export function sgzzNeighbours(row: number, col: number,
                               rows = SGZZ_MAP_ROWS, cols = SGZZ_MAP_COLS): ISgzzCell[] {
    const out: ISgzzCell[] = [];
    for (const [dr, dc] of sgzzNeighbourTable(row)) {
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) out.push({ row: r, col: c });
    }
    return out;
}

/** 按 dirIndex(1..6) 走一格。⛔ 不裁边界，调用方自己判。 */
export function sgzzNextPos(row: number, col: number, dirIndex: number): ISgzzCell {
    if (!Number.isInteger(dirIndex) || dirIndex < 1 || dirIndex > 6) {
        throw new RangeError("SGZZ dirIndex must be 1..6");
    }
    const [dr, dc] = sgzzNeighbourTable(row)[dirIndex - 1];
    return { row: row + dr, col: col + dc };
}

/** src→dest 的方向编号 1..6。⚠ 只对共线（同一方向的直线段）有意义，行军转折点之间就是共线。 */
export function sgzzDirIndex(src: ISgzzCell, dest: ISgzzCell): number {
    const dr = dest.row - src.row, dc = dest.col - src.col;
    const even = (src.row & 1) === 0;
    if (dr === 0) {
        if (dc < 0) return 1;
        if (dc > 0) return 4;
        throw new RangeError("SGZZ dirIndex needs two distinct cells");
    }
    if (dr > 0) return even ? (dc < 0 ? 2 : 3) : (dc > 0 ? 3 : 2);
    return even ? (dc < 0 ? 6 : 5) : (dc > 0 ? 5 : 6);
}

// ── cube 换算与距离 ───────────────────────────────────────────────────────────

export interface ISgzzCube { readonly x: number; readonly y: number; readonly z: number }

/** odd-q → cube（map_lua.lua:57）。⚠ row 恒非负，位运算取整才成立。 */
export function sgzzToCube(row: number, col: number): ISgzzCube {
    const x = row;
    const z = col - ((row - (row & 1)) >> 1);
    const sum = x + z;
    // ⚠ `-x - z` 在 x=z=0 时是 -0；-0 会让 deepEqual / JSON / Map key 出现两个「零」。
    return { x, y: sum === 0 ? 0 : -sum, z };
}

/** 真·六边形距离（步数）。⛔ 不要用它做「沿某方向走几步」，那是 sgzzStepsAlongDirection。 */
export function sgzzCubeDistance(a: ISgzzCell, b: ISgzzCell): number {
    const ca = sgzzToCube(a.row, a.col), cb = sgzzToCube(b.row, b.col);
    return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
}

/**
 * 原作 move_util.distance：`Δrow==0 ? |Δcol| : |Δrow|`。
 * ⚠ 它**只在共线时正确**，原作也只喂给 gen_path_from_turning_points。
 * 名字必须和 sgzzCubeDistance 一眼可分——混用会让行军路径长度错得很隐蔽。
 */
export function sgzzStepsAlongDirection(src: ISgzzCell, dest: ISgzzCell): number {
    const dr = Math.abs(dest.row - src.row), dc = Math.abs(dest.col - src.col);
    return dr === 0 ? dc : dr;
}

// ── cell key ─────────────────────────────────────────────────────────────────

export function sgzzCellOf(row: number, col: number,
                           rows = SGZZ_MAP_ROWS, cols = SGZZ_MAP_COLS): number {
    if (!Number.isInteger(row) || !Number.isInteger(col)
        || row < 0 || col < 0 || row >= rows || col >= cols) {
        throw new RangeError("SGZZ grid outside map");
    }
    return row * SGZZ_CELL_STRIDE + col;
}
export function sgzzDecodeCell(cell: number): ISgzzCell {
    return { row: Math.floor(cell / SGZZ_CELL_STRIDE), col: cell % SGZZ_CELL_STRIDE };
}
export function isSgzzCell(value: unknown, rows = SGZZ_MAP_ROWS, cols = SGZZ_MAP_COLS): value is number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return false;
    const { row, col } = sgzzDecodeCell(value);
    return row < rows && col < cols;
}
export function validateSgzzCell(value: unknown, path = "payload.cell"): number {
    if (!isSgzzCell(value)) throw new WireValidationError("SGZZMAP_CELL", path);
    return value;
}
export function sgzzInBounds(row: number, col: number,
                             rows = SGZZ_MAP_ROWS, cols = SGZZ_MAP_COLS): boolean {
    return row >= 0 && col >= 0 && row < rows && col < cols;
}
export function sgzzClampGrid(row: number, col: number,
                              rows = SGZZ_MAP_ROWS, cols = SGZZ_MAP_COLS): ISgzzCell {
    return {
        row: Math.min(rows - 1, Math.max(0, Math.floor(row))),
        col: Math.min(cols - 1, Math.max(0, Math.floor(col))),
    };
}

// ── 等距投影 ─────────────────────────────────────────────────────────────────

export interface ISgzzPoint { readonly x: number; readonly y: number }

/** 格 → 世界坐标（coord_util.grid2pos）。奇数行沿 +col 方向错开半格。 */
export function sgzzGrid2Pos(row: number, col: number,
                             halfW = SGZZ_TILE_HALF_W, halfH = SGZZ_TILE_HALF_H): ISgzzPoint {
    if ((row & 1) === 0) {
        return { x: (row - col) * halfW, y: -(row + col + 1) * halfH };
    }
    return { x: (row - col - 0.5) * halfW, y: -(row + col + 1.5) * halfH };
}

/**
 * 世界坐标 → 格（coord_util.pos2grid_raw）。⛔ 不裁边界，用 sgzzPos2Grid 取裁过的。
 * ⚠ `y = -y` 必须发生在奇数行半格偏移**之前**；顺序反了整体错半格，且只在奇数行显形。
 */
export function sgzzPos2GridRaw(x: number, y: number,
                                halfW = SGZZ_TILE_HALF_W, halfH = SGZZ_TILE_HALF_H): ISgzzCell {
    let ny = -y;
    const row = Math.floor((ny / halfH + x / halfW) / 2);
    let nx = x;
    if ((row & 1) !== 0) {
        nx = x + halfW / 2;
        ny = ny - halfH / 2;
    }
    return { row, col: Math.floor((ny / halfH - nx / halfW) / 2) };
}
export function sgzzPos2Grid(x: number, y: number, rows = SGZZ_MAP_ROWS, cols = SGZZ_MAP_COLS,
                             halfW = SGZZ_TILE_HALF_W, halfH = SGZZ_TILE_HALF_H): ISgzzCell {
    const raw = sgzzPos2GridRaw(x, y, halfW, halfH);
    return sgzzClampGrid(raw.row, raw.col, rows, cols);
}

export interface ISgzzWorldBounds {
    readonly minX: number; readonly minY: number;
    readonly maxX: number; readonly maxY: number;
}
/**
 * 整幅地图的世界空间轴对齐包围盒；可玩区是其内接菱形。
 * ⚠ 宽高比是 2:1 **差半格**（末行奇偶错位使 x/y 各偏 0.5 格），⛔ 不要断言精确等于 2。
 * 对齐不依赖这个比值：底图按本盒摆放、逐像素反解 grid2pos，比值多少都对得上。
 */
export function sgzzWorldBounds(rows = SGZZ_MAP_ROWS, cols = SGZZ_MAP_COLS,
                                halfW = SGZZ_TILE_HALF_W, halfH = SGZZ_TILE_HALF_H): ISgzzWorldBounds {
    const pts = [
        sgzzGrid2Pos(0, 0, halfW, halfH), sgzzGrid2Pos(0, cols - 1, halfW, halfH),
        sgzzGrid2Pos(rows - 1, 0, halfW, halfH), sgzzGrid2Pos(rows - 1, cols - 1, halfW, halfH),
    ];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return {
        minX: Math.min(...xs) - halfW, minY: Math.min(...ys) - halfH,
        maxX: Math.max(...xs) + halfW, maxY: Math.max(...ys) + halfH,
    };
}

// ── LOD 分档 ─────────────────────────────────────────────────────────────────

/** 6 档（LOD_0 最近 … LOD_5 最远），对齐原作 viewport_lod 的档数。 */
export const SGZZ_LOD_MAX = 5;
/** 各档下界，升序；下标 i 是「档 SGZZ_LOD_MAX-1-i」的下界。 */
export const SGZZ_LOD_SCALE_THRESHOLDS: readonly number[] = Object.freeze([0.13, 0.21, 0.34, 0.55, 0.85]);
export const SGZZ_LOD_HYSTERESIS_RATIO = 0.08;
export const SGZZ_SCALE_MIN = 0.05;
export const SGZZ_SCALE_MAX = 2.0;
export const SGZZ_SCALE_INITIAL = 0.85;
/** LOD ≥ 此值切鸟瞰：客户端换 AOI 模式，服务端改发预聚合分块摘要（原作 LOD_4）。 */
export const SGZZ_BIRDVIEW_LOD = 4;

export function sgzzLodForScale(scale: number): number {
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("SGZZ scale must be positive");
    for (let lod = 0; lod < SGZZ_LOD_MAX; lod += 1) {
        if (scale >= SGZZ_LOD_SCALE_THRESHOLDS[SGZZ_LOD_MAX - 1 - lod]) return lod;
    }
    return SGZZ_LOD_MAX;
}

/**
 * 滞回分档：以上一档为基准，必须明确越过更细档下界（×1+r）才升细、
 * 明确跌破当前档下界（×1−r）才降粗——阈值附近往复缩放不再让图层反复闪现。
 */
export function sgzzLodForScaleStable(prevLod: number, scale: number): number {
    if (!Number.isInteger(prevLod) || prevLod < 0 || prevLod > SGZZ_LOD_MAX) {
        throw new RangeError("SGZZ prev LOD invalid");
    }
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("SGZZ scale must be positive");
    let lod = prevLod;
    while (lod > 0
        && scale >= SGZZ_LOD_SCALE_THRESHOLDS[SGZZ_LOD_MAX - lod] * (1 + SGZZ_LOD_HYSTERESIS_RATIO)) {
        lod -= 1;
    }
    while (lod < SGZZ_LOD_MAX
        && scale < SGZZ_LOD_SCALE_THRESHOLDS[SGZZ_LOD_MAX - 1 - lod] * (1 - SGZZ_LOD_HYSTERESIS_RATIO)) {
        lod += 1;
    }
    return lod;
}

// ── 冻结内容：地形索引图 ──────────────────────────────────────────────────────

export interface ISgzzTerrainClass {
    readonly id: number;
    readonly name: string;
    readonly cn: string;
    readonly color: readonly [number, number, number];
    readonly passable: boolean;
}
export interface ISgzzTerrain {
    readonly mapId: string;
    readonly maxRow: number;
    readonly maxCol: number;
    /** 去掉 8 字节头的视图，⛔ 不复制；索引 = row*maxCol+col。 */
    readonly cells: Uint8Array;
    readonly palette: readonly ISgzzTerrainClass[];
    /** 下标 = 地形 id，值 0/1。查通行只看它，⛔ 不要每格去 palette 里 find。 */
    readonly passable: Uint8Array;
}

/** terrain.bytes 头长度：4 字节大端 rows + 4 字节大端 cols。 */
export const SGZZ_TERRAIN_HEADER_BYTES = 8;
export const SGZZ_TERRAIN_MAX_CLASSES = 16;

/**
 * fail-closed 地形加载。头与 meta 不符、长度不符、出现调色板外的 id 一律抛。
 * ⚠ sha256 校验**不在这里**——shared 零依赖、没有 crypto。由服务端 content/terrain.ts 负责。
 */
export function loadSgzzTerrain(bytes: Uint8Array, meta: unknown): ISgzzTerrain {
    const m = requireRecord(meta, "terrain.meta");
    // fail-closed：未知键一律拒。`source` 是管线写的溯源块（seed/密度/权威图），可选。
    assertExactKeys(m, ["schemaVersion", "mapId", "maxRow", "maxCol", "byteLength", "sha256", "palette"],
                    ["source"], "terrain.meta");
    finiteInteger(m.schemaVersion, "terrain.meta.schemaVersion", 1, 1);
    boundedString(m.sha256, "terrain.meta.sha256", 64, 64);
    const mapId = boundedString(m.mapId, "terrain.meta.mapId", 1, 64);
    const maxRow = finiteInteger(m.maxRow, "terrain.meta.maxRow", 1, SGZZ_MAP_ROWS);
    const maxCol = finiteInteger(m.maxCol, "terrain.meta.maxCol", 1, SGZZ_MAP_COLS);
    const byteLength = finiteInteger(m.byteLength, "terrain.meta.byteLength", 1, Number.MAX_SAFE_INTEGER);
    if (!Array.isArray(m.palette) || m.palette.length === 0 || m.palette.length > SGZZ_TERRAIN_MAX_CLASSES) {
        throw new WireValidationError("SGZZMAP_TERRAIN_PALETTE", "terrain.meta.palette");
    }
    const palette: ISgzzTerrainClass[] = [];
    const seen = new Set<number>();
    for (const entry of m.palette) {
        const e = requireRecord(entry, "terrain.meta.palette[]");
        assertExactKeys(e, ["id", "name", "cn", "color", "passable"], [], "terrain.meta.palette[]");
        const id = finiteInteger(e.id, "terrain.meta.palette[].id", 0, SGZZ_TERRAIN_MAX_CLASSES - 1);
        if (seen.has(id)) throw new WireValidationError("SGZZMAP_TERRAIN_PALETTE", "terrain.meta.palette[].id");
        seen.add(id);
        if (!Array.isArray(e.color) || e.color.length !== 3 || typeof e.passable !== "boolean") {
            throw new WireValidationError("SGZZMAP_TERRAIN_PALETTE", "terrain.meta.palette[]");
        }
        const color = e.color.map((c, i) => finiteInteger(c, `terrain.meta.palette[].color[${i}]`, 0, 255));
        palette.push({
            id,
            name: boundedString(e.name, "terrain.meta.palette[].name", 1, 32),
            cn: boundedString(e.cn, "terrain.meta.palette[].cn", 1, 16),
            color: [color[0], color[1], color[2]] as const,
            passable: e.passable,
        });
    }

    if (bytes.byteLength !== byteLength || byteLength !== SGZZ_TERRAIN_HEADER_BYTES + maxRow * maxCol) {
        throw new WireValidationError("SGZZMAP_TERRAIN_LENGTH", "terrain.bytes");
    }
    const headRow = (bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0;
    const headCol = (bytes[4] << 24 | bytes[5] << 16 | bytes[6] << 8 | bytes[7]) >>> 0;
    if (headRow !== maxRow || headCol !== maxCol) {
        throw new WireValidationError("SGZZMAP_TERRAIN_HEADER", "terrain.bytes");
    }

    const cells = bytes.subarray(SGZZ_TERRAIN_HEADER_BYTES);
    const passable = new Uint8Array(SGZZ_TERRAIN_MAX_CLASSES);
    const known = new Uint8Array(SGZZ_TERRAIN_MAX_CLASSES);
    for (const cls of palette) {
        known[cls.id] = 1;
        passable[cls.id] = cls.passable ? 1 : 0;
    }
    for (let i = 0; i < cells.length; i += 1) {
        const v = cells[i];
        if (v >= SGZZ_TERRAIN_MAX_CLASSES || known[v] === 0) {
            throw new WireValidationError("SGZZMAP_TERRAIN_ID", `terrain.bytes[${i}]`);
        }
    }
    return { mapId, maxRow, maxCol, cells, palette, passable };
}

/** O(1) 取地形 id。⛔ 不要像 slg 的 terrainAt 那样逐格线扫矩形表——1500² 上跑不动。 */
export function sgzzTerrainAt(t: ISgzzTerrain, row: number, col: number): number {
    if (!sgzzInBounds(row, col, t.maxRow, t.maxCol)) throw new RangeError("SGZZ grid outside map");
    return t.cells[row * t.maxCol + col];
}
export function sgzzIsPassable(t: ISgzzTerrain, row: number, col: number): boolean {
    return t.passable[sgzzTerrainAt(t, row, col)] === 1;
}

// ── 冻结内容：长程邻接（关隘 / 渡口） ─────────────────────────────────────────

export const SGZZ_MAX_LINKS = 512;
export const SGZZ_MAX_LINK_ADJACENTS = 8;
export type SgzzLinkKind = "pass" | "ford";
const SGZZ_LINK_KINDS: readonly string[] = ["pass", "ford"];

export interface ISgzzLink {
    readonly pos: readonly [number, number];
    readonly kind: SgzzLinkKind;
    readonly name: string;
    readonly adjacents: readonly (readonly [number, number])[];
}
export interface ISgzzLinkTable {
    readonly schemaVersion: number;
    readonly mapId: string;
    readonly links: readonly ISgzzLink[];
}

function readPair(value: unknown, path: string, rows: number, cols: number): [number, number] {
    if (!Array.isArray(value) || value.length !== 2) throw new WireValidationError("SGZZMAP_LINK_POS", path);
    return [finiteInteger(value[0], `${path}[0]`, 0, rows - 1),
            finiteInteger(value[1], `${path}[1]`, 0, cols - 1)];
}

/**
 * fail-closed 形状闸。⛔ 不自动对称化——非对称的表直接拒，
 * 否则占领会在一个方向合法、反方向不合法，且只在实战里才暴露。
 */
export function validateSgzzLinks(input: unknown, rows = SGZZ_MAP_ROWS, cols = SGZZ_MAP_COLS): input is ISgzzLinkTable {
    try {
        const r = requireRecord(input, "links");
        assertExactKeys(r, ["schemaVersion", "mapId", "links"], [], "links");
        finiteInteger(r.schemaVersion, "links.schemaVersion", 1, 1);
        boundedString(r.mapId, "links.mapId", 1, 64);
        if (!Array.isArray(r.links) || r.links.length > SGZZ_MAX_LINKS) return false;

        const table = new Map<number, number[]>();
        for (const entry of r.links) {
            const e = requireRecord(entry, "links.links[]");
            assertExactKeys(e, ["pos", "kind", "name", "adjacents"], [], "links.links[]");
            const pos = readPair(e.pos, "links.links[].pos", rows, cols);
            if (typeof e.kind !== "string" || SGZZ_LINK_KINDS.indexOf(e.kind) < 0) return false;
            boundedString(e.name, "links.links[].name", 1, 16);
            if (!Array.isArray(e.adjacents) || e.adjacents.length === 0
                || e.adjacents.length > SGZZ_MAX_LINK_ADJACENTS) return false;
            const cell = sgzzCellOf(pos[0], pos[1], rows, cols);
            if (table.has(cell)) return false;                       // 重复 pos
            const adjCells: number[] = [];
            for (const a of e.adjacents) {
                const p = readPair(a, "links.links[].adjacents[]", rows, cols);
                const ac = sgzzCellOf(p[0], p[1], rows, cols);
                if (ac === cell) return false;                       // 自链
                if (adjCells.indexOf(ac) >= 0) return false;         // 条目内重复
                // 已经是六邻的「长程链接」是配置 bug，不是捷径
                if (sgzzCubeDistance({ row: pos[0], col: pos[1] }, { row: p[0], col: p[1] }) <= 1) return false;
                adjCells.push(ac);
            }
            table.set(cell, adjCells);
        }
        for (const [cell, adjs] of table) {
            for (const a of adjs) {
                const back = table.get(a);
                if (!back || back.indexOf(cell) < 0) return false;   // 对称性
            }
        }
        return true;
    } catch {
        return false;
    }
}

/** 建索引：cell → 长程邻接 cell 列表。⚠ 调用前先过 validateSgzzLinks。 */
export function sgzzLinksIndex(table: ISgzzLinkTable,
                               rows = SGZZ_MAP_ROWS, cols = SGZZ_MAP_COLS): ReadonlyMap<number, readonly number[]> {
    const map = new Map<number, number[]>();
    for (const link of table.links) {
        map.set(sgzzCellOf(link.pos[0], link.pos[1], rows, cols),
                link.adjacents.map((a) => sgzzCellOf(a[0], a[1], rows, cols)));
    }
    return map;
}
