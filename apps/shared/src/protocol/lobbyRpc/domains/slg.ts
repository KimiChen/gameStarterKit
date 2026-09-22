/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/slg.json; validators are generated, complex leaf checks stay in ../checks/. */
import { WireValidationError, assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { boundedArray, rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcNaturalWrite } from "../defineDomain";
import type { ISlgMarch } from "../../../kits/slg/api/march/index";
import type { ISlgChunkRect, ISlgTile } from "../../../kits/slg/api/worldmap/index";
import { validateSlgMarch } from "../../../kits/slg/api/march/index";
import { validateSlgChunkRect, validateSlgMapId, validateSlgTile, validateSlgTileId } from "../../../kits/slg/api/worldmap/index";
import { assertSlgMarchEndpoints, assertSlgMarchRecalled, assertSlgTilesOrder } from "../checks/slg";

/** slg 域路由名 */
export const SlgRpc = {
    MapTiles: "slg.mapTiles",
    TileCapture: "slg.tileCapture",
    MarchDispatch: "slg.marchDispatch",
    MarchRecall: "slg.marchRecall",
} as const;

export interface ISlgMapTilesReq {
    mapId: string
    rect: ISlgChunkRect
}

export interface ISlgMapTilesRes {
    tiles: ISlgTile[]
    revision: number
    myTrophies: number
}

export interface ISlgTileCaptureReq {
    clientReqId: string
    tileId: number
}

export type SlgTileOutcome = "captured" | "reinforced" | "damaged"

export interface ISlgTileCaptureRes {
    tile: ISlgTile
    outcome: SlgTileOutcome
}

export interface ISlgMarchDispatchReq {
    clientReqId: string
    fromTile: number
    toTile: number
}

export interface ISlgMarchDispatchRes {
    march: ISlgMarch
    balance: number
}

export interface ISlgMarchRecallReq {
    clientReqId: string
    marchId: string
}

export interface ISlgMarchRecallRes {
    march: ISlgMarch
}

function parseISlgMapTilesReq(input: unknown, path: string): ISlgMapTilesReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["mapId", "rect"], [], path)
    const out: ISlgMapTilesReq = {
        mapId: validateSlgMapId(value.mapId, `${path}.mapId`),
        rect: validateSlgChunkRect(value.rect, `${path}.rect`),
    }
    return out
}

function parseISlgMapTilesRes(input: unknown, path: string): ISlgMapTilesRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["tiles", "revision", "myTrophies"], [], path)
    const out: ISlgMapTilesRes = {
        tiles: ((v) => { const parsed = boundedArray(v, `${path}.tiles`, 0, 1024, "SLG_TILES_SIZE").map((item, i) => validateSlgTile(item, `${path}.tiles[${i}]`)); assertSlgTilesOrder(parsed, `${path}.tiles`); return parsed; })(value.tiles),
        revision: finiteInteger(value.revision, `${path}.revision`, 0, Number.MAX_SAFE_INTEGER),
        myTrophies: finiteInteger(value.myTrophies, `${path}.myTrophies`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseISlgTileCaptureReq(input: unknown, path: string): ISlgTileCaptureReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "tileId"], [], path)
    const out: ISlgTileCaptureReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        tileId: validateSlgTileId(value.tileId, `${path}.tileId`),
    }
    return out
}

function parseSlgTileOutcome(input: unknown, path: string): SlgTileOutcome {
    return ((v) => { if (v !== "captured" && v !== "reinforced" && v !== "damaged") throw new WireValidationError("SLG_OUTCOME", path); return v as "captured" | "reinforced" | "damaged"; })(input)
}

function parseISlgTileCaptureRes(input: unknown, path: string): ISlgTileCaptureRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["tile", "outcome"], [], path)
    const out: ISlgTileCaptureRes = {
        tile: validateSlgTile(value.tile, `${path}.tile`),
        outcome: parseSlgTileOutcome(value.outcome, `${path}.outcome`),
    }
    return out
}

function parseISlgMarchDispatchReq(input: unknown, path: string): ISlgMarchDispatchReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "fromTile", "toTile"], [], path)
    const out: ISlgMarchDispatchReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        fromTile: validateSlgTileId(value.fromTile, `${path}.fromTile`),
        toTile: validateSlgTileId(value.toTile, `${path}.toTile`),
    }
    assertSlgMarchEndpoints(out, path)
    return out
}

function parseISlgMarchDispatchRes(input: unknown, path: string): ISlgMarchDispatchRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["march", "balance"], [], path)
    const out: ISlgMarchDispatchRes = {
        march: validateSlgMarch(value.march, `${path}.march`),
        balance: finiteInteger(value.balance, `${path}.balance`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseISlgMarchRecallReq(input: unknown, path: string): ISlgMarchRecallReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "marchId"], [], path)
    const out: ISlgMarchRecallReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        marchId: boundedString(value.marchId, `${path}.marchId`, 1, 64),
    }
    return out
}

function parseISlgMarchRecallRes(input: unknown, path: string): ISlgMarchRecallRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["march"], [], path)
    const out: ISlgMarchRecallRes = {
        march: ((v) => { const parsed = validateSlgMarch(v, `${path}.march`); assertSlgMarchRecalled(parsed, `${path}.march`); return parsed; })(value.march),
    }
    return out
}

export const validateSlgMapTilesReq: RuntimeValidator<ISlgMapTilesReq> = (input) => parseISlgMapTilesReq(input, "payload")

export const validateSlgMapTilesRes: RuntimeValidator<ISlgMapTilesRes> = (input) => parseISlgMapTilesRes(input, "response")

export const validateSlgTileCaptureReq: RuntimeValidator<ISlgTileCaptureReq> = (input) => parseISlgTileCaptureReq(input, "payload")

export const validateSlgTileCaptureRes: RuntimeValidator<ISlgTileCaptureRes> = (input) => parseISlgTileCaptureRes(input, "response")

export const validateSlgMarchDispatchReq: RuntimeValidator<ISlgMarchDispatchReq> = (input) => parseISlgMarchDispatchReq(input, "payload")

export const validateSlgMarchDispatchRes: RuntimeValidator<ISlgMarchDispatchRes> = (input) => parseISlgMarchDispatchRes(input, "response")

export const validateSlgMarchRecallReq: RuntimeValidator<ISlgMarchRecallReq> = (input) => parseISlgMarchRecallReq(input, "payload")

export const validateSlgMarchRecallRes: RuntimeValidator<ISlgMarchRecallRes> = (input) => parseISlgMarchRecallRes(input, "response")

export default defineLobbyRpcDomain({
    domain: "slg",
    contractVersion: 6,
    errorCodes: ["SLG_TILE_NOT_OWNED","SLG_MARCH_LIMIT","SLG_MARCH_NOT_FOUND","SLG_MARCH_FINISHED","SLG_SETTLEMENT_PENDING"],
    pushes: [],
    routes: [
        defineRpcNaturalWrite(SlgRpc.MapTiles, { request: validateSlgMapTilesReq, response: validateSlgMapTilesRes }),
        defineRpcIdempotentWrite(SlgRpc.TileCapture, { request: validateSlgTileCaptureReq, response: validateSlgTileCaptureRes }),
        defineRpcIdempotentWrite(SlgRpc.MarchDispatch, { request: validateSlgMarchDispatchReq, response: validateSlgMarchDispatchRes }),
        defineRpcIdempotentWrite(SlgRpc.MarchRecall, { request: validateSlgMarchRecallReq, response: validateSlgMarchRecallRes }),
    ],
});
