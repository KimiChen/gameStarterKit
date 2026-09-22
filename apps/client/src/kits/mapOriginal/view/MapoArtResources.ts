/**
 * 一路由一租约的素材加载（抄自 sgzzmap/slg，两条非显然性质必须保留）：
 *  ⚠ 失败也 **resolve** 而不是 reject —— 只有让每个在途回调都跑完，才敢在之后统一 release；
 *    否则先 reject 再 release，晚到的成功回调会给一张已经 decRef 的资源再 addRef。
 *  ⚠ 路由关掉/切图时无论成功失败都要 release 整包。
 */
import { BufferAsset, Texture2D, resources } from "cc";
import {
    MAPO_DECOR_ATLAS_ASSET, MAPO_GROUND_BASE_ASSET, MAPO_MINIMAP_ASSET, MAPO_REGIONS_ASSET,
    MAPO_REGION_ATLAS_ASSET, MAPO_RIVERS_ASSET, MAPO_RIVER_FILL_ASSET, MAPO_RIVER_GEO_ASSET,
    MAPO_CITIES_ASSET, MAPO_CITY_ATLAS_ASSET,
    MAPO_ROADS_ASSET, MAPO_ROAD_ATLAS_ASSET, MAPO_TERRAIN_ASSET,
    mapoBlockBaseAsset, mapoBlockGeoAsset, mapoBlockTableAsset,
    mapoPlateAsset, mapoTopAtlasAsset, mapoTopsAsset,
} from "../logic/mapoFar";
import { MAPO_BLOCK_KINDS } from "../logic/mapoBlocks";
import { MAPO_TOP_KINDS } from "../logic/mapoTops";

export interface MapoArtResources {
    readonly plate4: Texture2D | null;
    readonly plate5: Texture2D | null;
    readonly minimap: Texture2D | null;
    /** 16 类地形显示层。⚠ 缺席不致命：`mapoTerrain` 会退回 4 类通行层。 */
    readonly terrain: BufferAsset | null;
    /**
     * 地表底纹（256² POT，整数次 GL_REPEAT 铺满一块 10×10 格）。
     * ⚠ 缺席则地表底整层不建 —— ⛔ 不用纯色菱形占位（那正是 M2-B1 换掉的自创做法）。
     */
    readonly groundBase: Texture2D | null;
    /** snow / desert 块层的底纹（同样 POT + REPEAT）。 */
    blockBase(kind: string): Texture2D | null;
    /** snow / desert 块层的几何库与摆放表。⚠ 两件缺一则该层不建。 */
    blockGeo(kind: string): BufferAsset | null;
    blockTable(kind: string): BufferAsset | null;
    /** 道路层：路片图集与摆放表。⚠ 两件缺一则整层不建。 */
    readonly roadAtlas: Texture2D | null;
    readonly roads: BufferAsset | null;
    /** `_top_group` 手摆细节：每族一张图集 + 一份摆放库。⚠ 两件缺一则该族不出手摆件。 */
    topAtlas(kind: string): Texture2D | null;
    tops(kind: string): BufferAsset | null;
    /** 城址件图集（15 个件的 158 张贴图）。⚠ 与 `cities` 缺一则城址层整层不建。 */
    readonly cityAtlas: Texture2D | null;
    /** 城址件库 + 249 条摆位 `cities.bin`。 */
    readonly cities: BufferAsset | null;
    /** 摆件图集（原版切片打包）。⚠ 缺席则整层不建，⛔ 不用纯色方块占位。 */
    readonly decorAtlas: Texture2D | null;
    /** 多格地形的区域件图集（山脉 / 林丛 / 散落）。 */
    readonly regionAtlas: Texture2D | null;
    /** 区域件摆放表 `regions.bin`。⚠ 缺席则区域件层整层不建。 */
    readonly regions: BufferAsset | null;
    /** 河流水面的填充色图（6×2，三张原版 2×2 平色）。 */
    readonly riverFill: Texture2D | null;
    /** 河流几何库 `river-geo.bin`。 */
    readonly riverGeo: BufferAsset | null;
    /** 河流摆放表 `rivers.bin`。⚠ 三者缺一则河流层整层不建。 */
    readonly rivers: BufferAsset | null;
    release(): void;
}

/** ⚠ 图片资源的运行时路径要带 `/texture` 子资源段；BufferAsset 与 JSON 都没有。 */
function loadTexture(path: string): Promise<Texture2D | null> {
    return new Promise((resolve) => {
        resources.load(`${path}/texture`, Texture2D, (error, asset) => {
            if (error || !asset) { resolve(null); return; }
            asset.addRef();
            resolve(asset);
        });
    });
}

function loadBuffer(path: string): Promise<BufferAsset | null> {
    return new Promise((resolve) => {
        resources.load(path, BufferAsset, (error, asset) => {
            if (error || !asset) { resolve(null); return; }
            asset.addRef();
            resolve(asset);
        });
    });
}

export async function loadMapoArt(): Promise<MapoArtResources> {
    const [plate4, plate5, minimap, decorAtlas, regionAtlas, riverFill, groundBase, roadAtlas,
           terrain, regions, riverGeo, rivers, roads, cityAtlas, cities] =
        await Promise.all([
            loadTexture(mapoPlateAsset(4)),
            loadTexture(mapoPlateAsset(5)),
            loadTexture(MAPO_MINIMAP_ASSET),
            loadTexture(MAPO_DECOR_ATLAS_ASSET),
            loadTexture(MAPO_REGION_ATLAS_ASSET),
            loadTexture(MAPO_RIVER_FILL_ASSET),
            loadTexture(MAPO_GROUND_BASE_ASSET),
            loadTexture(MAPO_ROAD_ATLAS_ASSET),
            loadBuffer(MAPO_TERRAIN_ASSET),
            loadBuffer(MAPO_REGIONS_ASSET),
            loadBuffer(MAPO_RIVER_GEO_ASSET),
            loadBuffer(MAPO_RIVERS_ASSET),
            loadBuffer(MAPO_ROADS_ASSET),
            loadTexture(MAPO_CITY_ATLAS_ASSET),
            loadBuffer(MAPO_CITIES_ASSET),
        ]);
    const blocks = await Promise.all(MAPO_BLOCK_KINDS.map(async (kind) => ({
        kind,
        base: await loadTexture(mapoBlockBaseAsset(kind)),
        geo: await loadBuffer(mapoBlockGeoAsset(kind)),
        table: await loadBuffer(mapoBlockTableAsset(kind)),
    })));
    const blockBy = new Map(blocks.map((b) => [b.kind, b]));
    const tops = await Promise.all(MAPO_TOP_KINDS.map(async (kind) => ({
        kind,
        atlas: await loadTexture(mapoTopAtlasAsset(kind)),
        table: await loadBuffer(mapoTopsAsset(kind)),
    })));
    const topBy = new Map(tops.map((t) => [t.kind, t]));
    let released = false;
    return {
        plate4, plate5, minimap, terrain, decorAtlas, regionAtlas, regions,
        riverFill, riverGeo, rivers, groundBase, roadAtlas, roads, cityAtlas, cities,
        blockBase: (kind) => blockBy.get(kind)?.base ?? null,
        blockGeo: (kind) => blockBy.get(kind)?.geo ?? null,
        blockTable: (kind) => blockBy.get(kind)?.table ?? null,
        topAtlas: (kind) => topBy.get(kind)?.atlas ?? null,
        tops: (kind) => topBy.get(kind)?.table ?? null,
        release() {
            if (released) return;
            released = true;
            for (const a of [plate4, plate5, minimap, decorAtlas, regionAtlas, riverFill,
                             groundBase, roadAtlas, cityAtlas]) a?.decRef();
            terrain?.decRef();
            regions?.decRef();
            riverGeo?.decRef();
            rivers?.decRef();
            roads?.decRef();
            cities?.decRef();
            for (const b of blocks) { b.base?.decRef(); b.geo?.decRef(); b.table?.decRef(); }
            for (const t of tops) { t.atlas?.decRef(); t.table?.decRef(); }
        },
    };
}
