import type { ISlgChunkRect } from "../../../shared/kits/slg/api/worldmap/index";
import type { ISlgMapTilesRes, ISlgTileCaptureRes } from "../../../shared/protocol/lobbyRpc/domains/slg";

export interface SlgRuntime {
    selfUid(): string;
    mapTiles(mapId: string, rect: ISlgChunkRect): Promise<ISlgMapTilesRes>;
    capture(tileId: number): Promise<ISlgTileCaptureRes>;
    now(): number;
    tick(callback: (dt: number) => void): () => void;
    close(): void;
}
let current: SlgRuntime | null = null;
export function setSlgRuntime(runtime: SlgRuntime): () => void {
    current = runtime;
    return () => { if (current === runtime) current = null; };
}
export function getSlgRuntime(): SlgRuntime | null { return current; }
