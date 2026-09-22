/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/world.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { pushRecord, rpcRecord } from "../primitives";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcQuery } from "../defineDomain";
import { validateWorldEndpoint, validateWorldMapId, validateWorldTicket } from "../checks/world";

/** world 域路由名 */
export const WorldRpc = {
    Enter: "world.enter",
    ResolveTransfer: "world.resolveTransfer",
} as const;

export interface IWorldEnterReq {
    personaId: string
    mapId: string
    line?: number
}

export interface IWorldEnterRes {
    worldAddress: string
    mapId: string
    line: number
    endpoint: string
    ticket: string
    expiresAt: number
    transferId: string | null
}

export interface IWorldResolveTransferReq {
    transferId: string
}

export type IWorldResolveTransferRes = IWorldEnterRes

export interface IWorldTransferPush {
    transferId: string
    personaId: string
}

function parseIWorldEnterReq(input: unknown, path: string): IWorldEnterReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["personaId", "mapId"], ["line"], path)
    const out: IWorldEnterReq = {
        personaId: boundedString(value.personaId, `${path}.personaId`, 1, 64),
        mapId: validateWorldMapId(value.mapId, `${path}.mapId`),
    }
    if (value.line !== undefined) out.line = finiteInteger(value.line, `${path}.line`, 0, 65535)
    return out
}

function parseIWorldEnterRes(input: unknown, path: string): IWorldEnterRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["worldAddress", "mapId", "line", "endpoint", "ticket", "expiresAt", "transferId"], [], path)
    const out: IWorldEnterRes = {
        worldAddress: boundedString(value.worldAddress, `${path}.worldAddress`, 1, 128),
        mapId: validateWorldMapId(value.mapId, `${path}.mapId`),
        line: finiteInteger(value.line, `${path}.line`, 0, 65535),
        endpoint: validateWorldEndpoint(value.endpoint, `${path}.endpoint`),
        ticket: validateWorldTicket(value.ticket, `${path}.ticket`),
        expiresAt: finiteInteger(value.expiresAt, `${path}.expiresAt`, 0, Number.MAX_SAFE_INTEGER),
        transferId: ((v) => (v === null ? null : boundedString(v, `${path}.transferId`, 1, 64)))(value.transferId),
    }
    return out
}

function parseIWorldResolveTransferReq(input: unknown, path: string): IWorldResolveTransferReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["transferId"], [], path)
    const out: IWorldResolveTransferReq = {
        transferId: boundedString(value.transferId, `${path}.transferId`, 1, 64),
    }
    return out
}

function parseIWorldResolveTransferRes(input: unknown, path: string): IWorldResolveTransferRes {
    return parseIWorldEnterRes(input, path)
}

function parseIWorldTransferPush(input: unknown, path: string): IWorldTransferPush {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["transferId", "personaId"], [], path)
    const out: IWorldTransferPush = {
        transferId: boundedString(value.transferId, `${path}.transferId`, 1, 64),
        personaId: boundedString(value.personaId, `${path}.personaId`, 1, 64),
    }
    return out
}

export const validateWorldEnterReq: RuntimeValidator<IWorldEnterReq> = (input) => parseIWorldEnterReq(input, "payload")

export const validateWorldEnterRes: RuntimeValidator<IWorldEnterRes> = (input) => parseIWorldEnterRes(input, "response")

export const validateWorldResolveTransferReq: RuntimeValidator<IWorldResolveTransferReq> = (input) => parseIWorldResolveTransferReq(input, "payload")

export const validateWorldResolveTransferRes: RuntimeValidator<IWorldResolveTransferRes> = (input) => parseIWorldResolveTransferRes(input, "response")

export const validateWorldTransferPush: RuntimeValidator<IWorldTransferPush> = (input) => parseIWorldTransferPush(pushRecord(input, "push.data"), "push.data")

export default defineLobbyRpcDomain({
    domain: "world",
    contractVersion: 6,
    errorCodes: ["WORLD_PERSONA_INVALID","WORLD_TRANSFER_INVALID","WORLD_LINE_UNAVAILABLE","WORLD_SERVICE_UNAVAILABLE"],
    pushes: [
        defineLobbyPush("WorldTransfer", "world.transfer", validateWorldTransferPush),
    ],
    routes: [
        defineRpcQuery(WorldRpc.Enter, { request: validateWorldEnterReq, response: validateWorldEnterRes }),
        defineRpcQuery(WorldRpc.ResolveTransfer, { request: validateWorldResolveTransferReq, response: validateWorldResolveTransferRes }),
    ],
});
