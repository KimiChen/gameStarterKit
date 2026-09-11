/** A route owns one reference to every loaded asset; stale/failed loads release the entire bundle. */
import { JsonAsset, resources, Texture2D } from "cc";
import { validateSlgTerrain, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";
import { buildSlgLayoutIndex, validateSlgForestLayout, type SlgLayoutIndex } from "../logic/mapArt";
import { SLG_ART_ATLAS_CELL_SIZE, SLG_ART_ATLAS_COLUMNS, SLG_ART_ATLAS_ROWS } from "../logic/mapArt";

/** ground-tiles.json：世界格 64×64 切块注册表（近档真地表，含陆地的块才存在）。 */
export interface SlgGroundTileIndex {
    readonly tile: number;
    readonly image: number;
    readonly blocks: readonly (readonly [number, number])[];
}

export interface SlgArtResources {
    readonly mapId: string;
    readonly terrain: ISlgTerrain;
    readonly ground: Texture2D;
    readonly decorations: Texture2D;
    readonly overview: Texture2D;
    /** 原版纯地表烘图（远档地表）。 */
    readonly island: Texture2D;
    /** 原版渲染海面（远档 sea 层平铺贴图，含浪边渐变）。 */
    readonly sea: Texture2D;
    /** 真实布局复刻（chunk 分桶索引 + 数据驱动地标）；无布局数据的 chunk 走确定性哈希。 */
    readonly layout: SlgLayoutIndex;
    /** 近档真地表切块注册表（64 格块，4×4 chunk 对齐）。 */
    readonly groundTiles: SlgGroundTileIndex;
    release(): void;
}

/** 按地图加载整套资源：resources/kits/slg/maps/<mapId>/ 下的 terrain/layout/注册表与四张图。 */
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
        const [data, ground, decorations, overview, layoutData, island, tilesData, sea] = await Promise.all([
            load(`${base}/terrain`, JsonAsset),
            load(`${base}/terrain-atlas/texture`, Texture2D),
            load(`${base}/decoration-atlas/texture`, Texture2D),
            load(`${base}/world-overview/texture`, Texture2D),
            load(`${base}/layout`, JsonAsset),
            load(`${base}/island-ground/texture`, Texture2D),
            load(`${base}/ground-tiles`, JsonAsset),
            load(`${base}/sea-tile/texture`, Texture2D),
        ]);
        if (!data) throw new Error(`SLG terrain json missing/invalid (${mapId})`);
        if (!ground) throw new Error(`SLG ground atlas missing/invalid (${mapId})`);
        if (!decorations) throw new Error(`SLG decoration atlas missing/invalid (${mapId})`);
        if (!overview) throw new Error(`SLG overview missing/invalid (${mapId})`);
        if (!layoutData) throw new Error(`SLG layout missing/invalid (${mapId})`);
        if (!island) throw new Error(`SLG island ground missing/invalid (${mapId})`);
        if (!tilesData) throw new Error(`SLG ground tiles missing/invalid (${mapId})`);
        if (!sea) throw new Error(`SLG sea tile missing/invalid (${mapId})`);
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
        if (sea.width <= 0 || sea.height <= 0) throw new Error("SLG sea tile must have dimensions");
        const tiles = tilesData.json as SlgGroundTileIndex;
        if (!Number.isInteger(tiles.tile) || tiles.tile !== 64 || !Number.isInteger(tiles.image) || tiles.image <= 0
            || !Array.isArray(tiles.blocks)) {
            throw new Error(`SLG ground tiles contract violation (${mapId})`);
        }
        return { mapId, terrain, ground, decorations, overview, island, sea, groundTiles: tiles,
            layout: buildSlgLayoutIndex(layoutData.json), release };
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

/** 近档真地表块贴图懒加载缓存（按图隔离；调用方负责 retain/release 配对）。 */
export class SlgGroundTileCache {
    private readonly entries = new Map<string, { texture: Texture2D; refs: number }>();
    private readonly inflight = new Map<string, Promise<Texture2D | null>>();
    private readonly pendingRefs = new Map<string, number>();
    private disposed = false;
    constructor(private readonly mapId: string) {}

    /** 块存在与否（注册表判定；海块不在注册表，永远走回退色）。 */
    static key(bx: number, by: number): string { return `${bx}-${by}`; }

    textureOf(bx: number, by: number): Texture2D | null {
        return this.entries.get(SlgGroundTileCache.key(bx, by))?.texture ?? null;
    }
    /** 引用计数 +1 并开始加载（已在飞则共享）；dispose 后在飞结果直接释放，不入册。 */
    retain(bx: number, by: number): Promise<Texture2D | null> {
        const key = SlgGroundTileCache.key(bx, by);
        const hit = this.entries.get(key);
        if (hit) { hit.refs += 1; return Promise.resolve(hit.texture); }
        let pending = this.inflight.get(key);
        if (!pending) {
            pending = new Promise<Texture2D | null>((resolve) => {
                resources.load(`kits/slg/maps/${this.mapId}/ground-tiles/${key}/texture`, Texture2D, (error, asset) => {
                    if (error || !asset) { resolve(null); return; }
                    asset.addRef();
                    resolve(asset);
                });
            }).then((texture) => {
                this.inflight.delete(key);
                if (this.disposed) { texture?.decRef(); return null; }
                const refs = this.pendingRefs.get(key) ?? 0;
                this.pendingRefs.delete(key);
                if (texture && refs > 0) {
                    this.entries.set(key, { texture, refs });
                } else {
                    texture?.decRef();
                }
                return refs > 0 ? texture : null;
            });
            this.inflight.set(key, pending);
        }
        this.pendingRefs.set(key, (this.pendingRefs.get(key) ?? 0) + 1);
        return pending;
    }
    /** 引用计数 −1；归零即 decRef 真释放。 */
    release(bx: number, by: number): void {
        const key = SlgGroundTileCache.key(bx, by);
        const entry = this.entries.get(key);
        if (entry) {
            entry.refs -= 1;
            if (entry.refs <= 0) {
                entry.texture.decRef();
                this.entries.delete(key);
            }
        } else if (this.inflight.has(key)) {
            // 在飞期间取消引用：落地时按净引用计数决定入册或释放
            this.pendingRefs.set(key, Math.max(0, (this.pendingRefs.get(key) ?? 1) - 1));
        }
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const entry of this.entries.values()) entry.texture.decRef();
        this.entries.clear();
        this.pendingRefs.clear();
        this.inflight.clear();  // 在飞的 then 分支见 disposed 直接 decRef
    }
}
