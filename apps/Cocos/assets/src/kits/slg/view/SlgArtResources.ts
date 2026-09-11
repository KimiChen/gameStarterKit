/** A route owns one reference to every loaded asset; stale/failed loads release the entire bundle. */
import { JsonAsset, resources, Texture2D } from "cc";
import { validateSlgTerrain, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";
import { buildSlgLayoutIndex, validateSlgForestLayout, type SlgLayoutIndex } from "../logic/mapArt";
import { SLG_ART_ATLAS_CELL_SIZE, SLG_ART_ATLAS_COLUMNS, SLG_ART_ATLAS_ROWS } from "../logic/mapArt";

export interface SlgArtResources {
    readonly mapId: string;
    readonly terrain: ISlgTerrain;
    readonly ground: Texture2D;
    readonly decorations: Texture2D;
    readonly overview: Texture2D;
    /** 原版纯地表烘图（远档地表）。 */
    readonly island: Texture2D;
    /** 真实布局复刻（chunk 分桶索引 + 数据驱动地标）；无布局数据的 chunk 走确定性哈希。 */
    readonly layout: SlgLayoutIndex;
    release(): void;
}

/** 按地图加载整套资源：resources/kits/slg/maps/<mapId>/ 下的 terrain/layout 与四张图。 */
export async function loadSlgArtResources(mapId: string): Promise<SlgArtResources> {
    const owned: (JsonAsset | Texture2D)[] = [];
    let released = false;
    const release = (): void => {
        if (released) return;
        released = true;
        for (const asset of owned) asset.decRef();
        owned.length = 0;
    };
    // Resolve failures instead of rejecting early: every in-flight callback must finish
    // before we release acquired references, including when the route has already closed.
    const load = <T extends JsonAsset | Texture2D>(path: string, kind: new () => T): Promise<T | null> =>
        new Promise((resolve) => {
            resources.load(path, kind, (error, asset) => {
                if (error || !asset) { resolve(null); return; }
                asset.addRef(); owned.push(asset); resolve(asset);
            });
        });
    const base = `kits/slg/maps/${mapId}`;
    try {
        const [data, ground, decorations, overview, layoutData, island] = await Promise.all([
            load(`${base}/terrain`, JsonAsset),
            load(`${base}/terrain-atlas/texture`, Texture2D),
            load(`${base}/decoration-atlas/texture`, Texture2D),
            load(`${base}/world-overview/texture`, Texture2D),
            load(`${base}/layout`, JsonAsset),
            load(`${base}/island-ground/texture`, Texture2D),
        ]);
        if (!data) throw new Error(`SLG terrain json missing/invalid (${mapId})`);
        if (!ground) throw new Error(`SLG ground atlas missing/invalid (${mapId})`);
        if (!decorations) throw new Error(`SLG decoration atlas missing/invalid (${mapId})`);
        if (!overview) throw new Error(`SLG overview missing/invalid (${mapId})`);
        if (!layoutData) throw new Error(`SLG layout missing/invalid (${mapId})`);
        if (!island) throw new Error(`SLG island ground missing/invalid (${mapId})`);
        if (!validateSlgTerrain(data.json)) throw new Error(`SLG terrain contract violation: bundle missing/invalid (${mapId})`);
        const terrain = data.json;
        if (terrain.id !== mapId) throw new Error(`SLG terrain map mismatch: ${terrain.id} != ${mapId}`);
        if (!validateSlgForestLayout(layoutData.json)) throw new Error(`SLG layout contract violation: bundle missing/invalid (${mapId})`);
        if (layoutData.json.id !== mapId) throw new Error(`SLG layout map mismatch: ${layoutData.json.id} != ${mapId}`);
        for (const texture of [ground, decorations]) {
            if (texture.width !== SLG_ART_ATLAS_COLUMNS * SLG_ART_ATLAS_CELL_SIZE
                || texture.height !== SLG_ART_ATLAS_ROWS * SLG_ART_ATLAS_CELL_SIZE) {
                throw new Error("SLG atlas dimensions do not match its cell layout");
            }
        }
        if (overview.width <= 0 || overview.height !== overview.width) throw new Error("SLG overview must be square");
        if (island.width <= 0 || island.height <= 0) throw new Error("SLG island ground must have dimensions");
        return { mapId, terrain, ground, decorations, overview, island, layout: buildSlgLayoutIndex(layoutData.json), release };
    } catch (error) { release(); throw error; }
}

/** 切换面板的五图缩略图：只加载 256² mini，不进全量 bundle。 */
export async function loadSlgMapMini(mapId: string): Promise<Texture2D | null> {
    return new Promise((resolve) => {
        resources.load(`kits/slg/maps/${mapId}/world-overview-mini/texture`, Texture2D, (error, asset) => {
            if (error || !asset) { resolve(null); return; }
            asset.addRef();
            resolve(asset);
        });
    });
}
