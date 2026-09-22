/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/guild.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { boolField, boundedArray, pushRecord, rpcRecord } from "../primitives";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";

/** guild 域路由名 */
export const GuildRpc = {
    Join: "guild.join",
    Leave: "guild.leave",
    GetEvents: "guild.getEvents",
} as const;

export interface IGuildJoinReq {
    clientReqId: string
    guildId: number
}

export interface IGuildJoinRes {
    ok: boolean
    seq: number
}

export interface IGuildLeaveReq {
    clientReqId: string
}

export interface IGuildLeaveRes {
    ok: boolean
}

export interface IGuildGetEventsReq {
    sinceSeq: number
}

export interface IGuildEvent {
    seq: number
    kind: string
    data?: unknown
    at: number
}

export interface IGuildGetEventsRes {
    events: IGuildEvent[]
    latestSeq: number
    guildId: number
}

export interface IGuildEventPush {
    seq: number
    guildId: number
}

function parseIGuildJoinReq(input: unknown, path: string): IGuildJoinReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "guildId"], [], path)
    const out: IGuildJoinReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        guildId: finiteInteger(value.guildId, `${path}.guildId`, 1, 999999999),
    }
    return out
}

function parseIGuildJoinRes(input: unknown, path: string): IGuildJoinRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["ok", "seq"], [], path)
    const out: IGuildJoinRes = {
        ok: boolField(value, "ok"),
        seq: finiteInteger(value.seq, `${path}.seq`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGuildLeaveReq(input: unknown, path: string): IGuildLeaveReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId"], [], path)
    const out: IGuildLeaveReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
    }
    return out
}

function parseIGuildLeaveRes(input: unknown, path: string): IGuildLeaveRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["ok"], [], path)
    const out: IGuildLeaveRes = {
        ok: boolField(value, "ok"),
    }
    return out
}

function parseIGuildGetEventsReq(input: unknown, path: string): IGuildGetEventsReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["sinceSeq"], [], path)
    const out: IGuildGetEventsReq = {
        sinceSeq: finiteInteger(value.sinceSeq, `${path}.sinceSeq`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGuildEvent(input: unknown, path: string): IGuildEvent {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["seq", "kind", "at"], ["data"], path)
    const out: IGuildEvent = {
        seq: finiteInteger(value.seq, `${path}.seq`, 1, Number.MAX_SAFE_INTEGER),
        kind: boundedString(value.kind, `${path}.kind`, 1, 64),
        at: finiteInteger(value.at, `${path}.at`, 0, Number.MAX_SAFE_INTEGER),
    }
    if (value.data !== undefined) out.data = value.data
    return out
}

function parseIGuildGetEventsRes(input: unknown, path: string): IGuildGetEventsRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["events", "latestSeq", "guildId"], [], path)
    const out: IGuildGetEventsRes = {
        events: boundedArray(value.events, `${path}.events`, 0, 1000, "RPC_EVENTS").map((item, i) => parseIGuildEvent(item, `${path}.events[${i}]`)),
        latestSeq: finiteInteger(value.latestSeq, `${path}.latestSeq`, 0, Number.MAX_SAFE_INTEGER),
        guildId: finiteInteger(value.guildId, `${path}.guildId`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGuildEventPush(input: unknown, path: string): IGuildEventPush {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["seq", "guildId"], [], path)
    const out: IGuildEventPush = {
        seq: finiteInteger(value.seq, `${path}.seq`, 0, Number.MAX_SAFE_INTEGER),
        guildId: finiteInteger(value.guildId, `${path}.guildId`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

export const validateGuildJoinReq: RuntimeValidator<IGuildJoinReq> = (input) => parseIGuildJoinReq(input, "payload")

export const validateGuildJoinRes: RuntimeValidator<IGuildJoinRes> = (input) => parseIGuildJoinRes(input, "response")

export const validateGuildLeaveReq: RuntimeValidator<IGuildLeaveReq> = (input) => parseIGuildLeaveReq(input, "payload")

export const validateGuildLeaveRes: RuntimeValidator<IGuildLeaveRes> = (input) => parseIGuildLeaveRes(input, "response")

export const validateGuildGetEventsReq: RuntimeValidator<IGuildGetEventsReq> = (input) => parseIGuildGetEventsReq(input, "payload")

export const validateGuildGetEventsRes: RuntimeValidator<IGuildGetEventsRes> = (input) => parseIGuildGetEventsRes(input, "response")

export const validateGuildEventPush: RuntimeValidator<IGuildEventPush> = (input) => parseIGuildEventPush(pushRecord(input, "push.data"), "push.data")

export default defineLobbyRpcDomain({
    domain: "guild",
    contractVersion: 5,
    errorCodes: [],
    pushes: [
        defineLobbyPush("GuildEvent", "guild.event", validateGuildEventPush),
    ],
    routes: [
        defineRpcIdempotentWrite(GuildRpc.Join, { request: validateGuildJoinReq, response: validateGuildJoinRes }),
        defineRpcIdempotentWrite(GuildRpc.Leave, { request: validateGuildLeaveReq, response: validateGuildLeaveRes }),
        defineRpcQuery(GuildRpc.GetEvents, { request: validateGuildGetEventsReq, response: validateGuildGetEventsRes }),
    ],
});
