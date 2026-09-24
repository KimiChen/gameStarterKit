/** 每张地图持有自己的解码数据；不持有引擎 Asset，也不在关闭后保留跨页缓存。 */
import { createMapoTerrainData } from "./mapoTerrain";
import { createMapoBandsData } from "./mapoBands";
import { createMapoRegionsData } from "./mapoRegions";
import { createMapoRoadsData } from "./mapoRoads";
import { createMapoCitiesData } from "./mapoCities";
import { createMapoBlocksData } from "./mapoBlocks";
import { createMapoRiversData } from "./mapoRivers";
import { createMapoTopsData } from "./mapoTops";

import { MAPO_S1_MANIFEST } from "./mapoManifest";

export interface MapoContentIdentity {
    readonly mapId: string;
    readonly contentVersion: string;
    readonly atlasLayoutVersion: string;
}

// 安装器从素材与配置生成；runtime manifest 校验前所有图层依赖均阻塞。
export const MAPO_S1_CONTENT: MapoContentIdentity = Object.freeze({
    mapId: MAPO_S1_MANIFEST.mapId, contentVersion: MAPO_S1_MANIFEST.contentVersion,
    atlasLayoutVersion: MAPO_S1_MANIFEST.atlasLayoutVersion,
});

export function mapoContentKey(identity: MapoContentIdentity): string {
    return JSON.stringify([identity.mapId, identity.contentVersion, identity.atlasLayoutVersion]);
}

export class MapoDataStore {
    readonly terrain = createMapoTerrainData();
    readonly bands = createMapoBandsData();
    readonly regions = createMapoRegionsData(this.bands.mapoBandAt);
    readonly roads = createMapoRoadsData(this.bands.mapoBandAt);
    readonly cities = createMapoCitiesData();
    readonly blocks = createMapoBlocksData();
    readonly rivers = createMapoRiversData();
    readonly tops = createMapoTopsData();
    private closed = false;

    constructor(readonly identity: MapoContentIdentity = MAPO_S1_CONTENT) {}

    get disposed(): boolean { return this.closed; }

    clearGeography(): void {
        this.regions.dispose(); this.roads.dispose(); this.blocks.dispose();
        this.rivers.dispose(); this.tops.dispose(); this.bands.dispose();
    }

    /** 不触发惰性解码；缓冲区计真实字节，对象只计个数。 */
    usage(): Readonly<Record<string, Readonly<Record<string, number>>>> {
        return { terrain: this.terrain.mapoTerrainDataUsage(), bands: this.bands.mapoBandsDataUsage(),
            regions: this.regions.mapoRegionsDataUsage(), roads: this.roads.mapoRoadsDataUsage(),
            cities: this.cities.mapoCitiesDataUsage(), blocks: this.blocks.mapoBlocksDataUsage(),
            rivers: this.rivers.mapoRiversDataUsage(), tops: this.tops.mapoTopsDataUsage() };
    }

    dispose(): void {
        if (this.closed) return;
        this.closed = true;
        this.clearGeography(); this.terrain.dispose(); this.cities.dispose();
    }
}
