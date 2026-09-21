/**
 * 远档素材的一路由一租约加载（照抄 slg 的 SlgArtResources，两条非显然性质都要保留）：
 *  ⚠ 失败也 **resolve** 而不是 reject —— 只有让每个在途回调都跑完，才敢在之后统一 release；
 *    否则先 reject 再 release，晚到的成功回调会给一张已经 decRef 的资源再 addRef。
 *  ⚠ 路由关掉/切图时无论成功失败都要 release 整包。
 */
import { Texture2D, resources } from "cc";
import { SGZZ_MINIMAP_ASSET, sgzzAtlasAsset, sgzzPlateAsset } from "../logic/sgzzFar";
import { SGZZ_ATLAS_LODS } from "../../../shared/kits/sgzzmap/api/hexmap/index";

export interface SgzzArtResources {
    readonly plate4: Texture2D | null;
    readonly plate5: Texture2D | null;
    readonly minimap: Texture2D | null;
    /** 近档地表图集，下标 = LOD（只有 SGZZ_ATLAS_LODS 那几档有）。缺席则退回平涂顶点色。 */
    atlasFor(lod: number): Texture2D | null;
    release(): void;
}

/** ⚠ 图片资源的运行时路径要带 `/texture` 子资源段；JSON 没有。 */
function loadTexture(path: string): Promise<Texture2D | null> {
    return new Promise((resolve) => {
        resources.load(`${path}/texture`, Texture2D, (error, asset) => {
            if (error || !asset) { resolve(null); return; }
            asset.addRef();
            resolve(asset);
        });
    });
}

export async function loadSgzzArtResources(): Promise<SgzzArtResources> {
    const [plate4, plate5, minimap, ...atlases] = await Promise.all([
        loadTexture(sgzzPlateAsset(4)),
        loadTexture(sgzzPlateAsset(5)),
        loadTexture(SGZZ_MINIMAP_ASSET),
        ...SGZZ_ATLAS_LODS.map((lod) => loadTexture(sgzzAtlasAsset(lod))),
    ]);
    const byLod = new Map<number, Texture2D | null>();
    SGZZ_ATLAS_LODS.forEach((lod, i) => byLod.set(lod, atlases[i] ?? null));
    let released = false;
    return {
        plate4, plate5, minimap,
        atlasFor(lod: number): Texture2D | null { return byLod.get(lod) ?? null; },
        release(): void {
            if (released) return;
            released = true;
            for (const asset of [plate4, plate5, minimap, ...atlases]) asset?.decRef();
        },
    };
}
