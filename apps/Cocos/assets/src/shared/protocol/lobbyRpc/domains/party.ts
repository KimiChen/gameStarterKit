/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/party.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { boolField, boundedArray, pushRecord, rpcRecord } from "../primitives";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";

/** party 域路由名 */
export const PartyRpc = {
    Create: "party.create",
    Invite: "party.invite",
    Accept: "party.accept",
    Decline: "party.decline",
    Leave: "party.leave",
    Kick: "party.kick",
    TransferLeader: "party.transferLeader",
    Get: "party.get",
    GetEvents: "party.getEvents",
} as const;

export interface IPartyCreateReq {
    clientReqId: string
}

export interface IPartyCreateRes {
    partyId: number
    seq: number
}

export interface IPartyInviteReq {
    clientReqId: string
    uid: string
}

export interface IPartyInviteRes {
    ok: boolean
    seq: number
    expAt: number
}

export interface IPartyAcceptReq {
    clientReqId: string
    partyId: number
}

export interface IPartyAcceptRes {
    ok: boolean
    seq: number
}

export interface IPartyDeclineReq {
    clientReqId: string
    partyId: number
}

export interface IPartyDeclineRes {
    ok: boolean
}

export interface IPartyLeaveReq {
    clientReqId: string
}

export interface IPartyLeaveRes {
    ok: boolean
    disbanded: boolean
}

export interface IPartyKickReq {
    clientReqId: string
    uid: string
}

export interface IPartyTransferLeaderReq {
    clientReqId: string
    uid: string
}

export interface IPartyGetReq {
    readonly [key: string]: never
}

export interface IPartyMember {
    uid: string
    joinedAt: number
    online: boolean
}

export interface IPartyView {
    partyId: number
    leader: string
    maxSize: number
    ver: number
    members: IPartyMember[]
}

export interface IPartyGetRes {
    party: IPartyView | null
}

export interface IPartyGetEventsReq {
    sinceSeq: number
}

export interface IPartyEvent {
    seq: number
    kind: string
    data?: unknown
    at: number
}

export interface IPartyGetEventsRes {
    events: IPartyEvent[]
    latestSeq: number
    partyId: number
}

export interface IPartyEventPush {
    seq: number
    partyId: number
}

export interface IPartyInvitedPush {
    partyId: number
    by: string
    expAt: number
}

function parseIPartyCreateReq(input: unknown, path: string): IPartyCreateReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId"], [], path)
    const out: IPartyCreateReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
    }
    return out
}

function parseIPartyCreateRes(input: unknown, path: string): IPartyCreateRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["partyId", "seq"], [], path)
    const out: IPartyCreateRes = {
        partyId: finiteInteger(value.partyId, `${path}.partyId`, 1, 999999999999),
        seq: finiteInteger(value.seq, `${path}.seq`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIPartyInviteReq(input: unknown, path: string): IPartyInviteReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "uid"], [], path)
    const out: IPartyInviteReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
    }
    return out
}

function parseIPartyInviteRes(input: unknown, path: string): IPartyInviteRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["ok", "seq", "expAt"], [], path)
    const out: IPartyInviteRes = {
        ok: boolField(value, "ok"),
        seq: finiteInteger(value.seq, `${path}.seq`, 1, Number.MAX_SAFE_INTEGER),
        expAt: finiteInteger(value.expAt, `${path}.expAt`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIPartyAcceptReq(input: unknown, path: string): IPartyAcceptReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "partyId"], [], path)
    const out: IPartyAcceptReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        partyId: finiteInteger(value.partyId, `${path}.partyId`, 1, 999999999999),
    }
    return out
}

function parseIPartyAcceptRes(input: unknown, path: string): IPartyAcceptRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["ok", "seq"], [], path)
    const out: IPartyAcceptRes = {
        ok: boolField(value, "ok"),
        seq: finiteInteger(value.seq, `${path}.seq`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIPartyDeclineReq(input: unknown, path: string): IPartyDeclineReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "partyId"], [], path)
    const out: IPartyDeclineReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        partyId: finiteInteger(value.partyId, `${path}.partyId`, 1, 999999999999),
    }
    return out
}

function parseIPartyDeclineRes(input: unknown, path: string): IPartyDeclineRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["ok"], [], path)
    const out: IPartyDeclineRes = {
        ok: boolField(value, "ok"),
    }
    return out
}

function parseIPartyLeaveReq(input: unknown, path: string): IPartyLeaveReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId"], [], path)
    const out: IPartyLeaveReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
    }
    return out
}

function parseIPartyLeaveRes(input: unknown, path: string): IPartyLeaveRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["ok", "disbanded"], [], path)
    const out: IPartyLeaveRes = {
        ok: boolField(value, "ok"),
        disbanded: boolField(value, "disbanded"),
    }
    return out
}

function parseIPartyKickReq(input: unknown, path: string): IPartyKickReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "uid"], [], path)
    const out: IPartyKickReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
    }
    return out
}

function parseIPartyTransferLeaderReq(input: unknown, path: string): IPartyTransferLeaderReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "uid"], [], path)
    const out: IPartyTransferLeaderReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
    }
    return out
}

function parseIPartyGetReq(input: unknown, path: string): IPartyGetReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], [], path)
    const out: IPartyGetReq = {
    }
    return out
}

function parseIPartyMember(input: unknown, path: string): IPartyMember {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid", "joinedAt", "online"], [], path)
    const out: IPartyMember = {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
        joinedAt: finiteInteger(value.joinedAt, `${path}.joinedAt`, 0, Number.MAX_SAFE_INTEGER),
        online: boolField(value, "online"),
    }
    return out
}

function parseIPartyView(input: unknown, path: string): IPartyView {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["partyId", "leader", "maxSize", "ver", "members"], [], path)
    const out: IPartyView = {
        partyId: finiteInteger(value.partyId, `${path}.partyId`, 1, 999999999999),
        leader: boundedString(value.leader, `${path}.leader`, 1, 128),
        maxSize: finiteInteger(value.maxSize, `${path}.maxSize`, 1, 64),
        ver: finiteInteger(value.ver, `${path}.ver`, 1, Number.MAX_SAFE_INTEGER),
        members: boundedArray(value.members, `${path}.members`, 0, 64, "RPC_PARTY_MEMBERS").map((item, i) => parseIPartyMember(item, `${path}.members[${i}]`)),
    }
    return out
}

function parseIPartyGetRes(input: unknown, path: string): IPartyGetRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["party"], [], path)
    const out: IPartyGetRes = {
        party: ((v) => (v === null ? null : parseIPartyView(v, `${path}.party`)))(value.party),
    }
    return out
}

function parseIPartyGetEventsReq(input: unknown, path: string): IPartyGetEventsReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["sinceSeq"], [], path)
    const out: IPartyGetEventsReq = {
        sinceSeq: finiteInteger(value.sinceSeq, `${path}.sinceSeq`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIPartyEvent(input: unknown, path: string): IPartyEvent {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["seq", "kind", "at"], ["data"], path)
    const out: IPartyEvent = {
        seq: finiteInteger(value.seq, `${path}.seq`, 1, Number.MAX_SAFE_INTEGER),
        kind: boundedString(value.kind, `${path}.kind`, 1, 64),
        at: finiteInteger(value.at, `${path}.at`, 0, Number.MAX_SAFE_INTEGER),
    }
    if (value.data !== undefined) out.data = value.data
    return out
}

function parseIPartyGetEventsRes(input: unknown, path: string): IPartyGetEventsRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["events", "latestSeq", "partyId"], [], path)
    const out: IPartyGetEventsRes = {
        events: boundedArray(value.events, `${path}.events`, 0, 1000, "RPC_EVENTS").map((item, i) => parseIPartyEvent(item, `${path}.events[${i}]`)),
        latestSeq: finiteInteger(value.latestSeq, `${path}.latestSeq`, 0, Number.MAX_SAFE_INTEGER),
        partyId: finiteInteger(value.partyId, `${path}.partyId`, 0, 999999999999),
    }
    return out
}

function parseIPartyEventPush(input: unknown, path: string): IPartyEventPush {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["seq", "partyId"], [], path)
    const out: IPartyEventPush = {
        seq: finiteInteger(value.seq, `${path}.seq`, 0, Number.MAX_SAFE_INTEGER),
        partyId: finiteInteger(value.partyId, `${path}.partyId`, 0, 999999999999),
    }
    return out
}

function parseIPartyInvitedPush(input: unknown, path: string): IPartyInvitedPush {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["partyId", "by", "expAt"], [], path)
    const out: IPartyInvitedPush = {
        partyId: finiteInteger(value.partyId, `${path}.partyId`, 1, 999999999999),
        by: boundedString(value.by, `${path}.by`, 1, 128),
        expAt: finiteInteger(value.expAt, `${path}.expAt`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

export const validatePartyCreateReq: RuntimeValidator<IPartyCreateReq> = (input) => parseIPartyCreateReq(input, "payload")

export const validatePartyCreateRes: RuntimeValidator<IPartyCreateRes> = (input) => parseIPartyCreateRes(input, "response")

export const validatePartyInviteReq: RuntimeValidator<IPartyInviteReq> = (input) => parseIPartyInviteReq(input, "payload")

export const validatePartyInviteRes: RuntimeValidator<IPartyInviteRes> = (input) => parseIPartyInviteRes(input, "response")

export const validatePartyAcceptReq: RuntimeValidator<IPartyAcceptReq> = (input) => parseIPartyAcceptReq(input, "payload")

export const validatePartyAcceptRes: RuntimeValidator<IPartyAcceptRes> = (input) => parseIPartyAcceptRes(input, "response")

export const validatePartyDeclineReq: RuntimeValidator<IPartyDeclineReq> = (input) => parseIPartyDeclineReq(input, "payload")

export const validatePartyDeclineRes: RuntimeValidator<IPartyDeclineRes> = (input) => parseIPartyDeclineRes(input, "response")

export const validatePartyLeaveReq: RuntimeValidator<IPartyLeaveReq> = (input) => parseIPartyLeaveReq(input, "payload")

export const validatePartyLeaveRes: RuntimeValidator<IPartyLeaveRes> = (input) => parseIPartyLeaveRes(input, "response")

export const validatePartyKickReq: RuntimeValidator<IPartyKickReq> = (input) => parseIPartyKickReq(input, "payload")

export const validatePartyKickRes: RuntimeValidator<IPartyAcceptRes> = (input) => parseIPartyAcceptRes(input, "response")

export const validatePartyTransferLeaderReq: RuntimeValidator<IPartyTransferLeaderReq> = (input) => parseIPartyTransferLeaderReq(input, "payload")

export const validatePartyTransferLeaderRes: RuntimeValidator<IPartyAcceptRes> = (input) => parseIPartyAcceptRes(input, "response")

export const validatePartyGetReq: RuntimeValidator<IPartyGetReq> = (input) => parseIPartyGetReq(input, "payload")

export const validatePartyGetRes: RuntimeValidator<IPartyGetRes> = (input) => parseIPartyGetRes(input, "response")

export const validatePartyGetEventsReq: RuntimeValidator<IPartyGetEventsReq> = (input) => parseIPartyGetEventsReq(input, "payload")

export const validatePartyGetEventsRes: RuntimeValidator<IPartyGetEventsRes> = (input) => parseIPartyGetEventsRes(input, "response")

export const validatePartyEventPush: RuntimeValidator<IPartyEventPush> = (input) => parseIPartyEventPush(pushRecord(input, "push.data"), "push.data")

export const validatePartyInvitedPush: RuntimeValidator<IPartyInvitedPush> = (input) => parseIPartyInvitedPush(pushRecord(input, "push.data"), "push.data")

export default defineLobbyRpcDomain({
    domain: "party",
    contractVersion: 5,
    errorCodes: ["PARTY_NOT_FOUND","PARTY_FULL","PARTY_NOT_MEMBER","PARTY_NOT_LEADER","PARTY_ALREADY_IN_PARTY","PARTY_INVITE_INVALID","PARTY_TARGET_OFFLINE"],
    pushes: [
        defineLobbyPush("PartyEvent", "party.event", validatePartyEventPush),
        defineLobbyPush("PartyInvited", "party.invited", validatePartyInvitedPush),
    ],
    routes: [
        defineRpcIdempotentWrite(PartyRpc.Create, { request: validatePartyCreateReq, response: validatePartyCreateRes }),
        defineRpcIdempotentWrite(PartyRpc.Invite, { request: validatePartyInviteReq, response: validatePartyInviteRes }),
        defineRpcIdempotentWrite(PartyRpc.Accept, { request: validatePartyAcceptReq, response: validatePartyAcceptRes }),
        defineRpcIdempotentWrite(PartyRpc.Decline, { request: validatePartyDeclineReq, response: validatePartyDeclineRes }),
        defineRpcIdempotentWrite(PartyRpc.Leave, { request: validatePartyLeaveReq, response: validatePartyLeaveRes }),
        defineRpcIdempotentWrite(PartyRpc.Kick, { request: validatePartyKickReq, response: validatePartyKickRes }),
        defineRpcIdempotentWrite(PartyRpc.TransferLeader, { request: validatePartyTransferLeaderReq, response: validatePartyTransferLeaderRes }),
        defineRpcQuery(PartyRpc.Get, { request: validatePartyGetReq, response: validatePartyGetRes }),
        defineRpcQuery(PartyRpc.GetEvents, { request: validatePartyGetEventsReq, response: validatePartyGetEventsRes }),
    ],
});
