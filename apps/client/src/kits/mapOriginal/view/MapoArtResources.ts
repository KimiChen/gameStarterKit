/** O3-B1：概览先交付，独立分组经框架 AssetLease 加载和归还。 */
import { Asset, BufferAsset, EffectAsset, Texture2D } from "cc";
import { assetLease } from "../../../view/scene3d/cocosAssetLoader";
import type { AssetRequest } from "../../../view/scene3d/AssetLease";
import { MapoDataStore, mapoContentKey } from "../logic/MapoDataStore";
import { MapoAssetGroups, type MapoAssetGroup } from "./MapoAssetGroups";
import {
    MAPO_DECOR_ATLAS_ASSET, MAPO_GROUND_BASE_ASSET, MAPO_MINIMAP_ASSET, MAPO_REGIONS_ASSET,
    MAPO_REGION_ATLAS_ASSET, MAPO_RIVERS_ASSET, MAPO_RIVER_FILL_ASSET, MAPO_RIVER_GEO_ASSET,
    MAPO_CHOOSE_ASSET, MAPO_CITIES_ASSET, MAPO_CITY_ATLAS_ASSET,
    MAPO_ROADS_ASSET, MAPO_ROAD_ATLAS_ASSET, MAPO_TERRAIN_ASSET,
    mapoBlockBaseAsset, mapoBlockGeoAsset, mapoBlockTableAsset,
    MAPO_OVERVIEW_ASSET, mapoTopAtlasAsset, mapoTopsAsset,
} from "../logic/mapoFar";
import { MAPO_BLOCK_KINDS } from "../logic/mapoBlocks";
import { MAPO_TOP_KINDS } from "../logic/mapoTops";


interface Entry { readonly name: string; readonly request: AssetRequest; }
const base = "kits/mapOriginal/maps/s1/";
const texture = (name: string, path: string): Entry => ({ name, request: { bundle: "resources", path: `${path}/texture`, type: Texture2D } });
const buffer = (name: string, path: string): Entry => ({ name, request: { bundle: "resources", path, type: BufferAsset } });
const effect = (name: string, file: string): Entry => ({ name, request: { bundle: "resources", path: base + file, type: EffectAsset } });

/** 保留解析失败的准确地址；不会把未注入完整数据的组标记为 ready。 */
export class MapoDataError extends Error {
    readonly code = "MAPO_DATA_INVALID";
    constructor(readonly path: string, readonly cause: unknown) {
        super(`[mapOriginal] MAPO_DATA_INVALID resources:${path}: ${String(cause)}`);
        this.name = "MapoDataError";
    }
}

const live = new Set<MapoArtResources>();
/** 仅供开发预览读取；包括还在帧末归还的实例，不通过读取触发解码。 */
export function mapoArtDiagnostics(cell?: { row: number; col: number }) {
    return [...live].map((art) => ({ identity: art.data.identity, closed: art.closed,
        groups: art.groups.snapshot(), data: art.data.usage(),
        band: cell && art.data.bands.mapoBandsDataUsage().cells > 0
            ? art.data.bands.mapoBandAt(cell.row, cell.col) : null }));
}

export class MapoArtResources {
    readonly data = new MapoDataStore();
    readonly contentKey = mapoContentKey(this.data.identity);
    readonly groups: MapoAssetGroups;
    private readonly assets = new Map<string, Asset>();
    revision = 0;
    closed = false;

    constructor(retire: (group: string, release: () => void) => void) {
        const definitions: Record<string, MapoAssetGroup> = {};
        const group = (name: string, entries: Entry[], install: () => void = () => {}, clear: () => void = () => {}, dependencies = ["overview"]) => {
            definitions[name] = { dependencies, requests: entries.map((e) => e.request),
                install: (assets) => {
                    entries.forEach((e, i) => this.assets.set(e.name, assets[i]!));
                    install();
                },
                clear: () => { for (const entry of entries) this.assets.delete(entry.name); clear(); },
            };
        };
        const inject = (name: string, read: (bytes: ArrayBuffer) => void) => {
            try { read(this.get<BufferAsset>(name)!.buffer()); }
            catch (cause) { throw new MapoDataError(name, cause); }
        };
        group("overview", [effect("spriteEffect", "mapo-sprite"), texture("overview", MAPO_OVERVIEW_ASSET),
            texture("minimap", MAPO_MINIMAP_ASSET)], undefined, undefined, []);
        group("geography", [texture("ground-base", MAPO_GROUND_BASE_ASSET), texture("region-atlas", MAPO_REGION_ATLAS_ASSET),
            texture("road-atlas", MAPO_ROAD_ATLAS_ASSET), texture("river-fill", MAPO_RIVER_FILL_ASSET),
            buffer(MAPO_REGIONS_ASSET, MAPO_REGIONS_ASSET), buffer(MAPO_ROADS_ASSET, MAPO_ROADS_ASSET),
            buffer(MAPO_RIVER_GEO_ASSET, MAPO_RIVER_GEO_ASSET), buffer(MAPO_RIVERS_ASSET, MAPO_RIVERS_ASSET),
            ...MAPO_BLOCK_KINDS.reduce<Entry[]>((out, kind) => out.concat([texture(`${kind}-base`, mapoBlockBaseAsset(kind)),
                buffer(mapoBlockGeoAsset(kind), mapoBlockGeoAsset(kind)), buffer(mapoBlockTableAsset(kind), mapoBlockTableAsset(kind))]), []),
            ...MAPO_TOP_KINDS.reduce<Entry[]>((out, kind) => out.concat([texture(`${kind}-top-atlas`, mapoTopAtlasAsset(kind)), buffer(mapoTopsAsset(kind), mapoTopsAsset(kind))]), []),
        ], () => {
            inject(MAPO_REGIONS_ASSET, this.data.regions.mapoSetRegions);
            inject(MAPO_ROADS_ASSET, this.data.roads.mapoSetRoads);
            inject(MAPO_RIVER_GEO_ASSET, this.data.rivers.mapoSetRiverGeo);
            inject(MAPO_RIVERS_ASSET, this.data.rivers.mapoSetRivers);
            for (const kind of MAPO_BLOCK_KINDS) {
                inject(mapoBlockGeoAsset(kind), (bytes) => this.data.blocks.mapoSetBlockGeo(kind, bytes));
                inject(mapoBlockTableAsset(kind), (bytes) => this.data.blocks.mapoSetBlocks(kind, bytes));
            }
            for (const kind of MAPO_TOP_KINDS) inject(mapoTopsAsset(kind), (bytes) => this.data.tops.mapoSetTops(kind, bytes));
        }, () => this.data.clearGeography());
        // 点选只需 terrain 数据，不因此钉住 32 MiB 的资源图集。
        group("selection", [buffer(MAPO_TERRAIN_ASSET, MAPO_TERRAIN_ASSET)],
            () => inject(MAPO_TERRAIN_ASSET, this.data.terrain.mapoSetDisplayTerrain), () => this.data.terrain.dispose());
        group("resources", [texture("decor-atlas", MAPO_DECOR_ATLAS_ASSET)], undefined, undefined, ["overview", "selection", "geography"]);
        group("cities", [texture("cityAtlas", MAPO_CITY_ATLAS_ASSET), buffer(MAPO_CITIES_ASSET, MAPO_CITIES_ASSET)],
            () => inject(MAPO_CITIES_ASSET, this.data.cities.mapoSetCities), () => this.data.cities.dispose());
        group("water", [effect("riverEffect", "mapo-river"), texture("riverMask", base + "river-mask"), texture("riverNormal", base + "river-normal")]);
        group("grid", [texture("gridLine", base + "grid-line")]);
        group("choose", [texture("choose", MAPO_CHOOSE_ASSET)]);
        this.groups = new MapoAssetGroups(definitions, assetLease, retire, () => {
            this.revision++;
            if (this.closed && Object.values(this.groups.snapshot()).every((s) => s.state === "idle")) live.delete(this);
        }, (name, error) => console.error(`[mapOriginal] group ${name}`, error));
        live.add(this);
    }

    update(lod: number, details: boolean, selected: boolean, now: number): void {
        const wanted = ["overview"];
        if (lod < 3) wanted.push("geography");
        if (lod <= 1) wanted.push("cities");
        if (lod <= 1 && details) wanted.push("resources");
        if (lod === 0) { wanted.push("grid"); if (details) wanted.push("water"); }
        if (selected) { wanted.push("selection"); if (lod <= 1) wanted.push("choose"); }
        this.groups.update(wanted, now);
    }

    canBake(resources: boolean): boolean {
        return this.groups.ready("overview") && this.groups.ready("geography") && (!resources || this.groups.ready("resources"));
    }
    nearReady(details: boolean): boolean { return this.canBake(details); }
    private get<T extends Asset>(name: string): T | null { return (this.assets.get(name) as T | undefined) ?? null; }
    get spriteEffect(): EffectAsset | null { return this.get("spriteEffect"); }
    get riverEffect(): EffectAsset | null { return this.get("riverEffect"); }
    get riverMask(): Texture2D | null { return this.get("riverMask"); }
    get riverNormal(): Texture2D | null { return this.get("riverNormal"); }
    get gridLine(): Texture2D | null { return this.get("gridLine"); }
    get overview(): Texture2D | null { return this.get("overview"); }
    get minimap(): Texture2D | null { return this.get("minimap"); }
    get groundBase(): Texture2D | null { return this.get("ground-base"); }
    get roadAtlas(): Texture2D | null { return this.get("road-atlas"); }
    get cityAtlas(): Texture2D | null { return this.get("cityAtlas"); }
    get decorAtlas(): Texture2D | null { return this.get("decor-atlas"); }
    get regionAtlas(): Texture2D | null { return this.get("region-atlas"); }
    get riverFill(): Texture2D | null { return this.get("river-fill"); }
    get choose(): Texture2D | null { return this.get("choose"); }
    staticTexture(name: string): Texture2D | null { return this.get(name); }
    blockBase(kind: string): Texture2D | null { return this.get(`${kind}-base`); }
    topAtlas(kind: string): Texture2D | null { return this.get(`${kind}-top-atlas`); }

    release(): void {
        if (this.closed) return;
        this.closed = true; this.groups.close(); this.data.dispose();
        if (Object.values(this.groups.snapshot()).every((s) => s.state === "idle")) live.delete(this);
    }
}
