/** Owns sparse SQL snapshots. Stale camera requests and disposed routes cannot change the model. */
import {
    SLG_CHUNK_SIZE, SLG_MAX_GUARD, chunkKey, gridFromTileId, slgMapIndex, slgMapInfo,
    tileIdFromGrid, type ISlgTile,
} from "../../../shared/kits/slg/api/worldmap/index";
import { tileAction } from "../api/worldmap/index";
import { MapCamera } from "./mapCamera";
import type { SlgLandmark } from "./mapArt";
import { MapStreamer } from "./mapStreamer";
import type { SlgRuntime } from "./slgRuntime";

/** Host default is 10 RPC/s shared by all routes; map leaves half for actions and other UI. */
export const SLG_MAP_READ_INTERVAL_MS = 200;

export class SlgMapLogic {
    mapId: string;
    camera: MapCamera;
    streamer: MapStreamer;
    readonly tiles = new Map<number, ISlgTile>();
    readonly chunkVersions = new Map<number, number>();
    onChanged: () => void = () => {};
    selected: number | null = null;
    notice = "单指拖动 · 双指缩放 · 点选地块";
    trophies = 0;
    busy = false;
    private landmarks: readonly SlgLandmark[] = [];
    private disposed = false;
    private loading = false;
    private writeGeneration = 0;
    private revision = 0;
    private nextReadAt = -Infinity;
    private rateBackoffMs = 1000;
    private waitingForRateLimit = false;
    private readonly offPump: (() => void) | null;
    constructor(readonly runtime: SlgRuntime | null, mapId: string, width: number, height: number) {
        this.mapId = mapId;
        const info = slgMapInfo(mapId);
        // 首开落在图中心；资源就绪后 setLandmarks 会把未触碰的相机带到首个地标（主题风貌）。
        this.camera = new MapCamera(width, height, info.width, info.height);
        this.streamer = new MapStreamer(info.width, info.height);
        if (!runtime) this.notice = "大地图未就绪（kit 未装载）";
        this.offPump = runtime?.tick(() => { void this.pump(); }) ?? null;
    }
    get mapIndex(): number { return slgMapIndex(this.mapId); }
    get mapWidth(): number { return slgMapInfo(this.mapId).width; }
    get mapHeight(): number { return slgMapInfo(this.mapId).height; }
    get homeLandmarks(): readonly SlgLandmark[] { return this.landmarks; }
    /** 资源层注入地标（layout.landmarks）；相机未被用户触碰时开到首个地标。 */
    setLandmarks(landmarks: readonly SlgLandmark[]): void {
        if (this.disposed) return;
        this.landmarks = landmarks;
        if (landmarks.length > 0 && !this.camera.touched) {
            this.camera.locate(landmarks[0].x, landmarks[0].y + 10);
            this.camera.touched = false;
        }
    }
    /** 切换地图：清空稀疏模型与流式状态，相机按新图尺寸重建（首开落点等待 setLandmarks）。 */
    switchMap(mapId: string): void {
        if (this.disposed || mapId === this.mapId) return;
        slgMapIndex(mapId);  // 未知地图 fail-fast
        this.mapId = mapId;
        const info = slgMapInfo(mapId);
        this.landmarks = [];
        this.selected = null;
        this.tiles.clear(); this.chunkVersions.clear();
        this.writeGeneration += 1;  // 在途旧图响应全部作废
        this.camera = new MapCamera(this.camera.width, this.camera.height, info.width, info.height);
        this.streamer = new MapStreamer(info.width, info.height);
        this.notice = "单指拖动 · 双指缩放 · 点选地块";
        this.refresh();
    }
    updateViewport(): void {
        if (this.disposed) return;
        const delta = this.streamer.update(this.camera.visibleRect());
        for (const key of delta.removed) { this.removeChunk(key); this.chunkVersions.delete(key); }
        this.onChanged();
        void this.pump();
    }
    refresh(): void {
        if (this.disposed || this.busy) return;
        this.streamer.reset(); this.tiles.clear(); this.chunkVersions.clear();
        this.updateViewport();
    }
    selectedTile(): ISlgTile | null {
        if (this.selected === null) return null;
        return this.tiles.get(this.selected) ?? { tileId: this.selected, ownerUid: "", guardPower: 0 };
    }
    select(x: number, y: number): void {
        if (this.disposed || x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight) return;
        this.selected = tileIdFromGrid(this.mapIndex, Math.floor(x), Math.floor(y)); this.onChanged();
    }
    actionText(): string {
        const tile = this.selectedTile();
        return tile ? tileAction(tile, this.runtime?.selfUid() ?? "") : "先点选一格";
    }
    canCapture(): boolean {
        const tile = this.selectedTile();
        if (!tile || !this.runtime || this.busy || this.disposed) return false;
        const point = gridFromTileId(tile.tileId);
        if (!this.chunkVersions.has(chunkKey(Math.floor(point.x / SLG_CHUNK_SIZE), Math.floor(point.y / SLG_CHUNK_SIZE)))) return false;
        return tile.ownerUid !== this.runtime.selfUid() || tile.guardPower < SLG_MAX_GUARD;
    }
    async capture(): Promise<boolean> {
        if (!this.canCapture() || this.selected === null || !this.runtime) return false;
        const tileId = this.selected;
        this.busy = true;
        this.writeGeneration += 1;
        this.onChanged();
        let success = false;
        try {
            const result = await this.runtime.capture(tileId);
            if (this.disposed) return false;
            this.tiles.set(tileId, result.tile);
            this.touchChunk(tileId);
            this.notice = result.outcome === "captured" ? "已占领 · 奖杯 +1" : result.outcome === "reinforced" ? "已加固" : "已削减敌方守备";
            success = true;
        } catch (error) {
            if (!this.disposed) this.notice = describeSlgError(error);
        } finally {
            if (!this.disposed) {
                this.busy = false;
                // Both known success and unknown network outcome converge through authoritative reads.
                this.refresh();
            }
        }
        return success;
    }
    dispose(): void {
        this.disposed = true; this.offPump?.(); this.camera.cancel(); this.streamer.reset(); this.tiles.clear(); this.chunkVersions.clear(); this.onChanged = () => {};
    }
    private async pump(): Promise<void> {
        if (this.loading || this.disposed || !this.runtime || this.busy) return;
        this.loading = true;
        try {
            while (!this.disposed && !this.busy) {
                if (this.runtime.now() < this.nextReadAt) break;
                const loads = this.streamer.takeBatch();
                if (loads.length === 0) break;
                this.nextReadAt = this.runtime.now() + SLG_MAP_READ_INTERVAL_MS;
                const rect = { minX: Math.min(...loads.map((load) => load.x)), minY: Math.min(...loads.map((load) => load.y)),
                    maxX: Math.max(...loads.map((load) => load.x)), maxY: Math.max(...loads.map((load) => load.y)) };
                const writes = this.writeGeneration;
                const mapId = this.mapId;
                try {
                    const result = await this.runtime.mapTiles(mapId, rect);
                    if (this.disposed || writes !== this.writeGeneration || mapId !== this.mapId) { for (const load of loads) this.streamer.reject(load); continue; }
                    for (const tile of result.tiles) {
                        const point = gridFromTileId(tile.tileId);
                        const x = Math.floor(point.x / SLG_CHUNK_SIZE), y = Math.floor(point.y / SLG_CHUNK_SIZE);
                        if (x < rect.minX || x > rect.maxX || y < rect.minY || y > rect.maxY) {
                            throw new Error("SLG map response contains a tile outside its requested chunk");
                        }
                    }
                    if (!loads.every((load) => this.streamer.current(load))) continue;
                    for (const load of loads) { this.streamer.accept(load); this.removeChunk(load.key); }
                    for (const tile of result.tiles) this.tiles.set(tile.tileId, tile);
                    for (const load of loads) this.chunkVersions.set(load.key, (this.chunkVersions.get(load.key) ?? 0) + 1);
                    if (result.revision >= this.revision) { this.revision = result.revision; this.trophies = result.myTrophies; }
                    if (this.waitingForRateLimit) { this.notice = "地图已恢复加载"; this.waitingForRateLimit = false; }
                    this.rateBackoffMs = 1000;
                    this.onChanged();
                } catch (error) {
                    if (!this.disposed && loads.some((load) => this.streamer.current(load))) {
                        if (slgErrorCode(error) === "RATE_LIMITED") {
                            for (const load of loads) this.streamer.defer(load);
                            this.nextReadAt = this.runtime.now() + this.rateBackoffMs;
                            this.rateBackoffMs = Math.min(8000, this.rateBackoffMs * 2);
                            this.waitingForRateLimit = true; this.notice = "地图请求较多，稍后自动重试";
                        } else {
                            for (const load of loads) this.streamer.reject(load);
                            this.notice = describeSlgError(error);
                        }
                        this.onChanged();
                    }
                }
            }
        } finally { this.loading = false; }
    }
    private removeChunk(key: number): void {
        for (const [id] of this.tiles) {
            const point = gridFromTileId(id);
            if (chunkKey(Math.floor(point.x / SLG_CHUNK_SIZE), Math.floor(point.y / SLG_CHUNK_SIZE)) === key) this.tiles.delete(id);
        }
    }
    private touchChunk(tileId: number): void {
        const point = gridFromTileId(tileId);
        const key = chunkKey(Math.floor(point.x / SLG_CHUNK_SIZE), Math.floor(point.y / SLG_CHUNK_SIZE));
        this.chunkVersions.set(key, (this.chunkVersions.get(key) ?? 0) + 1);
    }
}

export function describeSlgError(error: unknown): string {
    const code = slgErrorCode(error);
    if (code === "TIMEOUT" || code === "CONN_LOST") return "网络暂不可用，请刷新确认地块状态";
    return typeof code === "string" ? `操作失败（${code}），可刷新重试` : "地图加载或操作失败，请刷新重试";
}

function slgErrorCode(error: unknown): unknown {
    return error && typeof error === "object" ? (error as { code?: unknown }).code : null;
}
