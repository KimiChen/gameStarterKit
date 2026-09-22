/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/arena.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { boundedArray, rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import type { IArenaTile } from "../../../kits/arena/api/board/index";
import { validateTileIndex } from "../../../kits/arena/api/board/index";
import { assertArenaBoardOrder, assertArenaBoardSize, validateArenaPower, validateArenaTile } from "../checks/arena";

/** arena 域路由名 */
export const ArenaRpc = {
    Board: "arena.board",
    Capture: "arena.capture",
} as const;

export interface IArenaBoardReq {
    readonly [key: string]: never
}

export interface IArenaBoardRes {
    tiles: IArenaTile[]
    myTrophies: number
}

export interface IArenaCaptureReq {
    clientReqId: string
    tile: number
}

export interface IArenaCaptureRes {
    tile: number
    power: number
    trophies: number
}

function parseIArenaBoardReq(input: unknown, path: string): IArenaBoardReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], [], path)
    const out: IArenaBoardReq = {
    }
    return out
}

function parseIArenaBoardRes(input: unknown, path: string): IArenaBoardRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["tiles", "myTrophies"], [], path)
    const out: IArenaBoardRes = {
        tiles: ((v) => { const parsed = boundedArray(v, `${path}.tiles`, 0, 4096, "WIRE_ARRAY").map((item, i) => validateArenaTile(item, `${path}.tiles[${i}]`)); assertArenaBoardSize(parsed, `${path}.tiles`); assertArenaBoardOrder(parsed, `${path}.tiles`); return parsed; })(value.tiles),
        myTrophies: finiteInteger(value.myTrophies, `${path}.myTrophies`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIArenaCaptureReq(input: unknown, path: string): IArenaCaptureReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "tile"], [], path)
    const out: IArenaCaptureReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        tile: validateTileIndex(value.tile, `${path}.tile`),
    }
    return out
}

function parseIArenaCaptureRes(input: unknown, path: string): IArenaCaptureRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["tile", "power", "trophies"], [], path)
    const out: IArenaCaptureRes = {
        tile: validateTileIndex(value.tile, `${path}.tile`),
        power: validateArenaPower(value.power, `${path}.power`),
        trophies: finiteInteger(value.trophies, `${path}.trophies`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

export const validateArenaBoardReq: RuntimeValidator<IArenaBoardReq> = (input) => parseIArenaBoardReq(input, "payload")

export const validateArenaBoardRes: RuntimeValidator<IArenaBoardRes> = (input) => parseIArenaBoardRes(input, "response")

export const validateArenaCaptureReq: RuntimeValidator<IArenaCaptureReq> = (input) => parseIArenaCaptureReq(input, "payload")

export const validateArenaCaptureRes: RuntimeValidator<IArenaCaptureRes> = (input) => parseIArenaCaptureRes(input, "response")

export default defineLobbyRpcDomain({
    domain: "arena",
    contractVersion: 5,
    errorCodes: ["ARENA_TILE_TAKEN"],
    pushes: [],
    routes: [
        defineRpcQuery(ArenaRpc.Board, { request: validateArenaBoardReq, response: validateArenaBoardRes }),
        defineRpcIdempotentWrite(ArenaRpc.Capture, { request: validateArenaCaptureReq, response: validateArenaCaptureRes }),
    ],
});
