/** Public, engine-free client worldmap surface; RPC details stay behind this facade. */
import type { LobbyRpcPort } from "../../../../app/ports";
import { SlgRpc, type ISlgMapTilesRes } from "../../../../shared/protocol/lobbyRpc/domains/slg";
import type { ISlgChunkRect, ISlgTile } from "../../../../shared/kits/slg/api/worldmap/index";
export type { ISlgChunkRect, ISlgTile, ISlgMapTilesRes };
export function fetchMapTiles(rpc: Pick<LobbyRpcPort, "query">, rect: ISlgChunkRect): Promise<ISlgMapTilesRes> {
    return rpc.query(SlgRpc.MapTiles, { rect });
}
export function tileAction(tile: ISlgTile, selfUid: string): string {
    return !tile.ownerUid ? "免费占领" : tile.ownerUid === selfUid ? "免费加固" : "免费攻击";
}
