/**
 * 一路由一租约的素材加载（抄自 sgzzmap/slg，两条非显然性质必须保留）：
 *  ⚠ 失败也 **resolve** 而不是 reject —— 只有让每个在途回调都跑完，才敢在之后统一 release；
 *    否则先 reject 再 release，晚到的成功回调会给一张已经 decRef 的资源再 addRef。
 *  ⚠ 路由关掉/切图时无论成功失败都要 release 整包。
 */
import { BufferAsset, Texture2D, resources } from "cc";
import {
    MAPO_DECOR_ATLAS_ASSET, MAPO_MINIMAP_ASSET, MAPO_REGIONS_ASSET, MAPO_REGION_ATLAS_ASSET,
    MAPO_TERRAIN_ASSET, mapoAtlasAsset, mapoPlateAsset,
} from "../logic/mapoFar";
import { MAPO_ATLAS_LODS } from "../../../shared/kits/mapOriginal/api/hexmap/index";

export interface MapoArtResources {
    readonly plate4: Texture2D | null;
    readonly plate5: Texture2D | null;
    readonly minimap: Texture2D | null;
    /** 16 类地形显示层。⚠ 缺席不致命：`mapoTerrain` 会退回 4 类通行层。 */
    readonly terrain: BufferAsset | null;
    /** 近档地表图集，下标 = LOD。缺席则退回平涂顶点色。 */
    atlasFor(lod: number): Texture2D | null;
    /** 摆件图集（原版切片打包）。⚠ 缺席则整层不建，⛔ 不用纯色方块占位。 */
    readonly decorAtlas: Texture2D | null;
    /** 多格地形的区域件图集（山脉 / 林丛 / 散落）。 */
    readonly regionAtlas: Texture2D | null;
    /** 区域件摆放表 `regions.bin`。⚠ 缺席则区域件层整层不建。 */
    readonly regions: BufferAsset | null;
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
    const atlasLods = MAPO_ATLAS_LODS;
    const [plate4, plate5, minimap, decorAtlas, regionAtlas, terrain, regions, ...atlases] =
        await Promise.all([
            loadTexture(mapoPlateAsset(4)),
            loadTexture(mapoPlateAsset(5)),
            loadTexture(MAPO_MINIMAP_ASSET),
            loadTexture(MAPO_DECOR_ATLAS_ASSET),
            loadTexture(MAPO_REGION_ATLAS_ASSET),
            loadBuffer(MAPO_TERRAIN_ASSET),
            loadBuffer(MAPO_REGIONS_ASSET),
            ...atlasLods.map((lod) => loadTexture(mapoAtlasAsset(lod))),
        ]);
    const byLod = new Map<number, Texture2D | null>();
    atlasLods.forEach((lod, i) => byLod.set(lod, atlases[i] ?? null));
    let released = false;
    return {
        plate4, plate5, minimap, terrain, decorAtlas, regionAtlas, regions,
        atlasFor: (lod) => byLod.get(lod) ?? null,
        release() {
            if (released) return;
            released = true;
            for (const a of [plate4, plate5, minimap, decorAtlas, regionAtlas, ...atlases]) a?.decRef();
            terrain?.decRef();
            regions?.decRef();
        },
    };
}
