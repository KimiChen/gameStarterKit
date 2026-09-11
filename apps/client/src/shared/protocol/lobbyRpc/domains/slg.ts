/** slg kit v1：阶段 1 / 2a；mapTiles 会推进到期行军，因此是 natural-write。 */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import {
    type ISlgChunkRect, type ISlgTile, type SlgTileOutcome, SLG_CHUNK_SIZE, SLG_MAX_QUERY_CHUNKS,
    validateSlgChunkRect, validateSlgMapId, validateSlgTile, validateSlgTileId,
} from "../../../kits/slg/api/worldmap/index";
import { type ISlgMarch, validateSlgMarch } from "../../../kits/slg/api/march/index";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcNaturalWrite } from "../defineDomain";
import { requiredId, rpcRecord } from "../primitives";

export const SlgRpc = {
    MapTiles: "slg.mapTiles", TileCapture: "slg.tileCapture",
    MarchDispatch: "slg.marchDispatch", MarchRecall: "slg.marchRecall",
} as const;
export interface ISlgMapTilesReq { mapId: string; rect: ISlgChunkRect }
export interface ISlgMapTilesRes { tiles: ISlgTile[]; revision: number; myTrophies: number }
export interface ISlgTileCaptureReq { clientReqId: string; tileId: number }
export interface ISlgTileCaptureRes { tile: ISlgTile; outcome: SlgTileOutcome }
export interface ISlgMarchDispatchReq { clientReqId: string; fromTile: number; toTile: number }
export interface ISlgMarchDispatchRes { march: ISlgMarch; balance: number }
export interface ISlgMarchRecallReq { clientReqId: string; marchId: string }
export interface ISlgMarchRecallRes { march: ISlgMarch }
export interface SlgRpcMap {
    [SlgRpc.MapTiles]: { req: ISlgMapTilesReq; res: ISlgMapTilesRes };
    [SlgRpc.TileCapture]: { req: ISlgTileCaptureReq; res: ISlgTileCaptureRes };
    [SlgRpc.MarchDispatch]: { req: ISlgMarchDispatchReq; res: ISlgMarchDispatchRes };
    [SlgRpc.MarchRecall]: { req: ISlgMarchRecallReq; res: ISlgMarchRecallRes };
}
export const validateSlgMapTilesReq: RuntimeValidator<ISlgMapTilesReq> = (input) => {
    const r = rpcRecord(input); assertExactKeys(r, ["mapId", "rect"], [], "payload");
    return { mapId: validateSlgMapId(r.mapId), rect: validateSlgChunkRect(r.rect) };
};
export const validateSlgMapTilesRes: RuntimeValidator<ISlgMapTilesRes> = (input) => {
    const r = rpcRecord(input, "response"); assertExactKeys(r, ["tiles", "revision", "myTrophies"], [], "response");
    if (!Array.isArray(r.tiles) || r.tiles.length > SLG_MAX_QUERY_CHUNKS * SLG_CHUNK_SIZE * SLG_CHUNK_SIZE) {
        throw new WireValidationError("SLG_TILES_SIZE", "response.tiles");
    }
    const tiles = r.tiles.map((v, i) => validateSlgTile(v, `response.tiles[${i}]`));
    for (let i = 0; i < tiles.length; i++) {
        if (tiles[i].ownerUid === "" || (i > 0 && tiles[i].tileId <= tiles[i - 1].tileId)) {
            throw new WireValidationError("SLG_TILES_ORDER", "response.tiles");
        }
    }
    return { tiles, revision: finiteInteger(r.revision, "response.revision", 0), myTrophies: finiteInteger(r.myTrophies, "response.myTrophies", 0) };
};
export const validateSlgTileCaptureReq: RuntimeValidator<ISlgTileCaptureReq> = (input) => {
    const r = rpcRecord(input); assertExactKeys(r, ["clientReqId", "tileId"], [], "payload");
    return { clientReqId: requiredId(r, "clientReqId"), tileId: validateSlgTileId(r.tileId) };
};
export const validateSlgTileCaptureRes: RuntimeValidator<ISlgTileCaptureRes> = (input) => {
    const r = rpcRecord(input, "response"); assertExactKeys(r, ["tile", "outcome"], [], "response");
    if (r.outcome !== "captured" && r.outcome !== "reinforced" && r.outcome !== "damaged") throw new WireValidationError("SLG_OUTCOME", "response.outcome");
    return { tile: validateSlgTile(r.tile, "response.tile"), outcome: r.outcome };
};
export const validateSlgMarchDispatchReq: RuntimeValidator<ISlgMarchDispatchReq> = (input) => {
    const r = rpcRecord(input); assertExactKeys(r, ["clientReqId", "fromTile", "toTile"], [], "payload");
    const fromTile = validateSlgTileId(r.fromTile, "payload.fromTile"), toTile = validateSlgTileId(r.toTile, "payload.toTile");
    if (fromTile === toTile) throw new WireValidationError("SLG_MARCH_ENDPOINT", "payload.toTile");
    return { clientReqId: requiredId(r, "clientReqId"), fromTile, toTile };
};
export const validateSlgMarchDispatchRes: RuntimeValidator<ISlgMarchDispatchRes> = (input) => {
    const r = rpcRecord(input, "response"); assertExactKeys(r, ["march", "balance"], [], "response");
    return { march: validateSlgMarch(r.march, "response.march"), balance: finiteInteger(r.balance, "response.balance", 0) };
};
export const validateSlgMarchRecallReq: RuntimeValidator<ISlgMarchRecallReq> = (input) => {
    const r = rpcRecord(input); assertExactKeys(r, ["clientReqId", "marchId"], [], "payload");
    return { clientReqId: requiredId(r, "clientReqId"), marchId: boundedString(r.marchId, "payload.marchId", 1, 64) };
};
export const validateSlgMarchRecallRes: RuntimeValidator<ISlgMarchRecallRes> = (input) => {
    const r = rpcRecord(input, "response"); assertExactKeys(r, ["march"], [], "response");
    const march = validateSlgMarch(r.march, "response.march");
    if (march.status !== "recalled") throw new WireValidationError("SLG_RECALL_STATUS", "response.march.status");
    return { march };
};

export default defineLobbyRpcDomain({
    domain: "slg", contractVersion: 2,
    errorCodes: ["SLG_TILE_NOT_OWNED", "SLG_MARCH_LIMIT", "SLG_MARCH_NOT_FOUND", "SLG_MARCH_FINISHED", "SLG_SETTLEMENT_PENDING"],
    pushes: [],
    routes: [
        defineRpcNaturalWrite(SlgRpc.MapTiles, { request: validateSlgMapTilesReq, response: validateSlgMapTilesRes }),
        defineRpcIdempotentWrite(SlgRpc.TileCapture, { request: validateSlgTileCaptureReq, response: validateSlgTileCaptureRes }),
        defineRpcIdempotentWrite(SlgRpc.MarchDispatch, { request: validateSlgMarchDispatchReq, response: validateSlgMarchDispatchRes }),
        defineRpcIdempotentWrite(SlgRpc.MarchRecall, { request: validateSlgMarchRecallReq, response: validateSlgMarchRecallRes }),
    ],
});
