/** SLG grid dimensions, chunk encoding and retention policy for the framework streamer. */
import { ChunkStreamer } from "../../../logic/scene3d/chunkStreamer";
import { SLG_CHUNK_SIZE, chunkKey, gridFromTileId } from "../../../shared/kits/slg/api/worldmap/index";

export type { ChunkLoad, ChunkDelta } from "../../../logic/scene3d/chunkStreamer";

export class MapStreamer extends ChunkStreamer {
    constructor(readonly mapWidth: number, readonly mapHeight: number) {
        super({ chunkSize: SLG_CHUNK_SIZE, mapWidth, mapHeight, key: chunkKey, unkey: gridFromTileId,
            margin: 4, retainMargin: SLG_CHUNK_SIZE + 4 });
    }
}
