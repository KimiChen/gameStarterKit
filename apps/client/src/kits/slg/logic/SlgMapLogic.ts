/** Owns sparse SQL snapshots. Stale camera requests and disposed routes cannot change the model. */
import { SLG_CHUNK_SIZE, SLG_MAP_W, SLG_MAP_H, SLG_MAX_GUARD, chunkKey, gridFromTileId, tileIdFromGrid, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { tileAction } from "../api/worldmap/index";
import { MapCamera } from "./mapCamera";
import { MapStreamer } from "./mapStreamer";
import type { SlgRuntime } from "./slgRuntime";

/** Host default is 10 RPC/s shared by all routes; map leaves half for actions and other UI. */
export const SLG_MAP_READ_INTERVAL_MS = 200;

export class SlgMapLogic {
    readonly camera: MapCamera;
    readonly streamer = new MapStreamer();
    readonly tiles = new Map<number, ISlgTile>();
    readonly chunkVersions = new Map<number, number>();
    onChanged: () => void = () => {};
    selected: number | null = null;
    notice = "单指拖动 · 双指缩放 · 点选地块";
    trophies = 0;
    busy = false;
    private disposed = false;
    private loading = false;
    private writeGeneration = 0;
    private revision = 0;
    private nextReadAt = -Infinity;
    private rateBackoffMs = 1000;
    private waitingForRateLimit = false;
    private readonly offPump: (() => void) | null;
    constructor(readonly runtime: SlgRuntime | null, width: number, height: number) {
        this.camera = new MapCamera(width, height);
        if (!runtime) this.notice = "大地图未就绪（kit 未装载）";
        this.offPump = runtime?.tick(() => { void this.pump(); }) ?? null;
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
        if (this.disposed || x < 0 || y < 0 || x >= SLG_MAP_W || y >= SLG_MAP_H) return;
        this.selected = tileIdFromGrid(Math.floor(x), Math.floor(y)); this.onChanged();
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
                try {
                    const result = await this.runtime.mapTiles(rect);
                    if (this.disposed || writes !== this.writeGeneration) { for (const load of loads) this.streamer.reject(load); continue; }
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
