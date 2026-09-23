/** A route owns one reference to every loaded asset; stale/failed loads release the entire bundle. */
import { JsonAsset, Texture2D } from "cc";
import { assetLease } from "../../../view/scene3d/cocosAssetLoader";
import type { AssetAcquireOptions, AssetBatch, AssetRequest } from "../../../view/scene3d/AssetLease";
import { validateSlgTerrain, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";
import { buildSlgLayoutIndex, validateSlgForestLayout, type SlgLayoutIndex } from "../logic/mapArt";
import { buildSlgTileIndex, type SlgChunkTileBucket, type SlgTilesData } from "../logic/tilemapMesh";

export interface SlgArtResources {
    readonly mapId: string;
    readonly terrain: ISlgTerrain;
    readonly decorations: Texture2D;
    readonly overview: Texture2D;
    /** 原版纯地表烘图（远档地表）。 */
    readonly island: Texture2D;
    /** 原版渲染海面（远档 sea 层平铺贴图，含浪边渐变）。 */
    readonly sea: Texture2D;
    /** 真实布局复刻（chunk 分桶索引 + 数据驱动地标）。 */
    readonly layout: SlgLayoutIndex;
    /** 原版 Tilemap 数据集（格→瓦片引用表）与 chunk 分桶索引。 */
    readonly tiles: SlgTilesData;
    readonly tileIndex: ReadonlyMap<number, readonly SlgChunkTileBucket[]>;
    /** 瓦片图集（单页）。 */
    readonly tileset: Texture2D;
    release(): void;
}

/** tiles.json 的 fail-closed 形状闸。 */
function validateSlgTiles(input: unknown, mapId: string): input is SlgTilesData {
    const t = input as SlgTilesData;
    if (!t || typeof t !== "object" || t.id !== mapId) return false;
    if (!Number.isInteger(t.tile) || t.tile <= 0) return false;
    if (!Number.isInteger(t.scale) || t.scale <= 0) return false;
    if (!Number.isInteger(t.atlasCols) || t.atlasCols <= 0 || !Number.isInteger(t.cellPx) || t.cellPx <= 0) return false;
    if (!Array.isArray(t.atlas) || !Array.isArray(t.layers) || !Array.isArray(t.tiles)) return false;
    for (const layer of t.layers) {
        if (typeof layer.name !== "string" || !Number.isInteger(layer.seq) || !Array.isArray(layer.cells)) return false;
    }
    for (const tile of t.tiles) {
        if (!Number.isInteger(tile.atlas) || !Number.isInteger(tile.cell)
            || !(tile.w > 0 && tile.h > 0 && tile.ppu > 0)) return false;
    }
    return true;
}

/** 按地图加载整套资源：resources/kits/slg/maps/<mapId>/ 下八件套。 */
export async function loadSlgArtResources(mapId: string, options: AssetAcquireOptions = {}): Promise<SlgArtResources> {
    const owned: { release(): void }[] = [];
    let released = false;
    const release = (): void => {
        if (released) return;
        released = true;
        for (const lease of owned) lease.release();
        owned.length = 0;
    };
    // Preserve SLG's all-settled contract: successful siblings stay held until
    // every request completes (or reaches the framework deadline/cancellation).
    const load = async <T extends JsonAsset | Texture2D>(path: string, kind: new () => T): Promise<T | null> => {
        try {
            const lease = await assetLease.acquire([{ bundle: "resources", path, type: kind }] as const, options);
            owned.push(lease);
            return lease.assets[0];
        } catch { return null; }
    };
    const base = `kits/slg/maps/${mapId}`;
    try {
        const [data, decorations, overview, layoutData, island, tilesData, tileset, sea] = await Promise.all([
            load(`${base}/terrain`, JsonAsset),
            load(`${base}/decoration-atlas/texture`, Texture2D),
            load(`${base}/world-overview/texture`, Texture2D),
            load(`${base}/layout`, JsonAsset),
            load(`${base}/island-ground/texture`, Texture2D),
            load(`${base}/tiles`, JsonAsset),
            load(`${base}/tileset-0/texture`, Texture2D),
            load(`${base}/sea-tile/texture`, Texture2D),
        ]);
        if (!data) throw new Error(`SLG terrain json missing/invalid (${mapId})`);
        if (!decorations) throw new Error(`SLG decoration atlas missing/invalid (${mapId})`);
        if (!overview) throw new Error(`SLG overview missing/invalid (${mapId})`);
        if (!layoutData) throw new Error(`SLG layout missing/invalid (${mapId})`);
        if (!island) throw new Error(`SLG island ground missing/invalid (${mapId})`);
        if (!tilesData) throw new Error(`SLG tiles missing/invalid (${mapId})`);
        if (!tileset) throw new Error(`SLG tileset missing/invalid (${mapId})`);
        if (!sea) throw new Error(`SLG sea tile missing/invalid (${mapId})`);
        if (!validateSlgTerrain(data.json)) throw new Error(`SLG terrain contract violation: bundle missing/invalid (${mapId})`);
        const terrain = data.json;
        if (terrain.id !== mapId) throw new Error(`SLG terrain map mismatch: ${terrain.id} != ${mapId}`);
        if (!validateSlgForestLayout(layoutData.json)) throw new Error(`SLG layout contract violation: bundle missing/invalid (${mapId})`);
        if (layoutData.json.id !== mapId) throw new Error(`SLG layout map mismatch: ${layoutData.json.id} != ${mapId}`);
        if (overview.width <= 0 || overview.height !== overview.width) throw new Error("SLG overview must be square");
        if (island.width <= 0 || island.height <= 0) throw new Error("SLG island ground must have dimensions");
        if (sea.width <= 0 || sea.height <= 0) throw new Error("SLG sea tile must have dimensions");
        const tiles = tilesData.json as unknown;
        if (!validateSlgTiles(tiles, mapId)) throw new Error(`SLG tiles contract violation (${mapId})`);
        return { mapId, terrain, decorations, overview, island, sea, tiles, tileIndex: buildSlgTileIndex(tiles),
            tileset, layout: buildSlgLayoutIndex(layoutData.json), release };
    } catch (error) { release(); throw error; }
}

/** Legacy texture-returning API: each successful call must pair with releaseSlgMapMini. */
const miniLeases = new WeakMap<Texture2D, AssetBatch<readonly AssetRequest<Texture2D>[]>[]>();

/** 切换面板的五图缩略图：只加载 256² mini，不进全量 bundle。 */
export async function loadSlgMapMini(mapId: string): Promise<Texture2D | null> {
    try {
        const lease = await assetLease.acquire([{ bundle: "resources", path: `kits/slg/maps/${mapId}/world-overview-mini/texture`, type: Texture2D }] as const);
        const texture = lease.assets[0];
        const holds = miniLeases.get(texture) ?? [];
        holds.push(lease); miniLeases.set(texture, holds);
        return texture;
    } catch { return null; }
}

/** Return one successful call's hold; callers guard their own close/late-load paths. */
export function releaseSlgMapMini(texture: Texture2D): void {
    const holds = miniLeases.get(texture);
    const hold = holds?.shift();
    if (holds?.length === 0) miniLeases.delete(texture);
    hold?.release();
}
