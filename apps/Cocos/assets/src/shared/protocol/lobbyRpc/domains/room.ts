/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/room.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import { validateRoomCode, validateRoomId, validateRoomTicket } from "../checks/room";

/** room 域路由名 */
export const RoomRpc = {
    PrepareCreate: "room.prepareCreate",
    Resolve: "room.resolve",
} as const;

export interface IRoomPrepareCreateReq {
    clientReqId: string
    mode: string
    modeVersion: number
    profile: string
}

export interface IRoomPrepareCreateRes {
    creationTicket: string
    expiresAt: number
}

export interface IRoomResolveReq {
    code: string
}

export interface IRoomResolveRes {
    roomId: string
    mode: string
    modeVersion: number
    profile: string
    joinTicket: string
    expiresAt: number
}

function parseIRoomPrepareCreateReq(input: unknown, path: string): IRoomPrepareCreateReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "mode", "modeVersion", "profile"], [], path)
    const out: IRoomPrepareCreateReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        mode: validateRoomId(value.mode, `${path}.mode`),
        modeVersion: finiteInteger(value.modeVersion, `${path}.modeVersion`, 1, 1000000),
        profile: validateRoomId(value.profile, `${path}.profile`),
    }
    return out
}

function parseIRoomPrepareCreateRes(input: unknown, path: string): IRoomPrepareCreateRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["creationTicket", "expiresAt"], [], path)
    const out: IRoomPrepareCreateRes = {
        creationTicket: validateRoomTicket(value.creationTicket, `${path}.creationTicket`),
        expiresAt: finiteInteger(value.expiresAt, `${path}.expiresAt`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIRoomResolveReq(input: unknown, path: string): IRoomResolveReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["code"], [], path)
    const out: IRoomResolveReq = {
        code: validateRoomCode(value.code, `${path}.code`),
    }
    return out
}

function parseIRoomResolveRes(input: unknown, path: string): IRoomResolveRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["roomId", "mode", "modeVersion", "profile", "joinTicket", "expiresAt"], [], path)
    const out: IRoomResolveRes = {
        roomId: boundedString(value.roomId, `${path}.roomId`, 1, 128),
        mode: validateRoomId(value.mode, `${path}.mode`),
        modeVersion: finiteInteger(value.modeVersion, `${path}.modeVersion`, 1, 1000000),
        profile: validateRoomId(value.profile, `${path}.profile`),
        joinTicket: validateRoomTicket(value.joinTicket, `${path}.joinTicket`),
        expiresAt: finiteInteger(value.expiresAt, `${path}.expiresAt`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

export const validateRoomPrepareCreateReq: RuntimeValidator<IRoomPrepareCreateReq> = (input) => parseIRoomPrepareCreateReq(input, "payload")

export const validateRoomPrepareCreateRes: RuntimeValidator<IRoomPrepareCreateRes> = (input) => parseIRoomPrepareCreateRes(input, "response")

export const validateRoomResolveReq: RuntimeValidator<IRoomResolveReq> = (input) => parseIRoomResolveReq(input, "payload")

export const validateRoomResolveRes: RuntimeValidator<IRoomResolveRes> = (input) => parseIRoomResolveRes(input, "response")

export default defineLobbyRpcDomain({
    domain: "room",
    contractVersion: 5,
    errorCodes: ["ROOM_CODE_UNAVAILABLE","ROOM_FULL","ROOM_START_IN_PROGRESS","ROOM_QUOTA_EXCEEDED","ROOM_SERVICE_UNAVAILABLE","ROOM_RESULT_UNKNOWN"],
    pushes: [],
    routes: [
        defineRpcIdempotentWrite(RoomRpc.PrepareCreate, { request: validateRoomPrepareCreateReq, response: validateRoomPrepareCreateRes }),
        defineRpcQuery(RoomRpc.Resolve, { request: validateRoomResolveReq, response: validateRoomResolveRes }),
    ],
});
