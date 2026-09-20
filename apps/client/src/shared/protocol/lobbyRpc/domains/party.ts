/**
 * party 域 ws-RPC 契约（docs/MMO.md §6.4；MF6a-B3）。队伍只在 Redis（per-zone 键族 + 档字段 partyId），
 * 与 WorldRoom 无关；presence 只做在线标记（提示语义）。
 *
 * 执行模式：create / invite / accept / decline / leave / kick / transferLeader = idempotent-write（同 clientReqId 重放
 * 返回首次结果，⛔ 不建第二队 / 不重复发事件）；get / getEvents = query。
 * 事件窗口语义同 guild：服务端只保留每队最近 PARTY_EVT_LOG_MAX 条（Lua 内 INCR + LPUSH，⛔ 无 seq 空洞），seq 队内单调；
 * `partyId` 是 seq 的命名空间——换队必须重置客户端水位（PartyLogic 已封装）。
 * 推送：`party.event {seq, partyId}` 只唤醒（内容走 getEvents 拉）；`party.invited {partyId, by, expAt}` 带内容（被邀请者无法拉）。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import { boolField, emptyPayload, pushRecord, requiredId, rpcRecord, validateOkRes } from "../primitives";

/** party 域路由名 */
export const PartyRpc = {
    /** 建队（自己成为队长；已在队 → PARTY_ALREADY_IN_PARTY） */
    Create: "party.create",
    /** 邀请（任一成员可邀；目标须在线同区、未满、未在本队） */
    Invite: "party.invite",
    /** 接受邀请（第 6 人 → PARTY_FULL；过期 → PARTY_INVITE_INVALID） */
    Accept: "party.accept",
    /** 拒绝邀请 */
    Decline: "party.decline",
    /** 离队（队长离开由最早成员接任；最后一人离开解散） */
    Leave: "party.leave",
    /** 踢人（仅队长） */
    Kick: "party.kick",
    /** 转让队长（仅队长） */
    TransferLeader: "party.transferLeader",
    /** 当前队伍视图（含 presence 在线标记；不在队 → null） */
    Get: "party.get",
    /** 拉取队伍事件增量（唤醒式推送的自愈端） */
    GetEvents: "party.getEvents",
} as const;

/** 队伍成员视图 */
export interface IPartyMember {
    uid: string;
    /** 入队时刻（ms） */
    joinedAt: number;
    /** presence 在线标记（提示语义，⛔ 非投递权威） */
    online: boolean;
}

/** 队伍视图 */
export interface IPartyView {
    partyId: number;
    leader: string;
    maxSize: number;
    /** 队伍版本（每次变更 +1） */
    ver: number;
    /** 按 joinedAt 升序 */
    members: IPartyMember[];
}

/** 单条队伍事件（同 IGuildEvent 形态） */
export interface IPartyEvent {
    seq: number;
    /** created / invited / memberJoin / inviteDeclined / memberLeave / leaderChanged / memberKicked */
    kind: string;
    data?: unknown;
    at: number;
}

export interface IPartyCreateReq { clientReqId: string }
export interface IPartyCreateRes { partyId: number; seq: number }
export interface IPartyInviteReq { clientReqId: string; uid: string }
export interface IPartyInviteRes { ok: boolean; seq: number; expAt: number }
export interface IPartyAcceptReq { clientReqId: string; partyId: number }
export interface IPartyAcceptRes { ok: boolean; seq: number }
export interface IPartyDeclineReq { clientReqId: string; partyId: number }
export interface IPartyDeclineRes { ok: boolean }
export interface IPartyLeaveReq { clientReqId: string }
export interface IPartyLeaveRes { ok: boolean; disbanded: boolean }
export interface IPartyKickReq { clientReqId: string; uid: string }
export interface IPartyKickRes { ok: boolean; seq: number }
export interface IPartyTransferLeaderReq { clientReqId: string; uid: string }
export interface IPartyTransferLeaderRes { ok: boolean; seq: number }
export interface IPartyGetReq { readonly [key: string]: never }
export interface IPartyGetRes { party: IPartyView | null }
export interface IPartyGetEventsReq { sinceSeq: number }
export interface IPartyGetEventsRes {
    events: IPartyEvent[];
    latestSeq: number;
    /** 本次响应对应的队伍（0 = 不在队）；客户端据此识别换队并重置水位 */
    partyId: number;
}

/** 唤醒推送（只带 seq + partyId） */
export interface IPartyEventPush { seq: number; partyId: number }
/** 邀请推送（带内容：被邀请者无法拉） */
export interface IPartyInvitedPush { partyId: number; by: string; expAt: number }

/** 路由名 → { req, res } */
export interface PartyRpcMap {
    [PartyRpc.Create]: { req: IPartyCreateReq; res: IPartyCreateRes };
    [PartyRpc.Invite]: { req: IPartyInviteReq; res: IPartyInviteRes };
    [PartyRpc.Accept]: { req: IPartyAcceptReq; res: IPartyAcceptRes };
    [PartyRpc.Decline]: { req: IPartyDeclineReq; res: IPartyDeclineRes };
    [PartyRpc.Leave]: { req: IPartyLeaveReq; res: IPartyLeaveRes };
    [PartyRpc.Kick]: { req: IPartyKickReq; res: IPartyKickRes };
    [PartyRpc.TransferLeader]: { req: IPartyTransferLeaderReq; res: IPartyTransferLeaderRes };
    [PartyRpc.Get]: { req: IPartyGetReq; res: IPartyGetRes };
    [PartyRpc.GetEvents]: { req: IPartyGetEventsReq; res: IPartyGetEventsRes };
}

const PARTY_ID_MAX = 999_999_999_999;
const PARTY_MEMBERS_WIRE_MAX = 64;

function validatePartyMember(input: unknown, index: number): IPartyMember {
    const path = `response.party.members[${index}]`;
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["uid", "joinedAt", "online"], [], path);
    return {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
        joinedAt: finiteInteger(value.joinedAt, `${path}.joinedAt`, 0),
        online: boolField(value, "online"),
    };
}

function validatePartyView(input: unknown): IPartyView {
    const path = "response.party";
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["partyId", "leader", "maxSize", "ver", "members"], [], path);
    if (!Array.isArray(value.members) || value.members.length > PARTY_MEMBERS_WIRE_MAX) {
        throw new WireValidationError("RPC_PARTY_MEMBERS", `${path}.members`);
    }
    return {
        partyId: finiteInteger(value.partyId, `${path}.partyId`, 1, PARTY_ID_MAX),
        leader: boundedString(value.leader, `${path}.leader`, 1, 128),
        maxSize: finiteInteger(value.maxSize, `${path}.maxSize`, 1, PARTY_MEMBERS_WIRE_MAX),
        ver: finiteInteger(value.ver, `${path}.ver`, 1),
        members: value.members.map((member, i) => validatePartyMember(member, i)),
    };
}

function validatePartyEvent(input: unknown, index: number): IPartyEvent {
    const path = `response.events[${index}]`;
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["seq", "kind", "at"], ["data"], path);
    const base = {
        seq: finiteInteger(value.seq, `${path}.seq`, 1),
        kind: boundedString(value.kind, `${path}.kind`, 1, 64),
        at: finiteInteger(value.at, `${path}.at`, 0),
    };
    return Object.prototype.hasOwnProperty.call(value, "data") ? { ...base, data: value.data } : base;
}

export const validatePartyCreateReq: RuntimeValidator<IPartyCreateReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId"], [], "payload"); return { clientReqId: requiredId(value, "clientReqId") };
};
export const validatePartyInviteReq: RuntimeValidator<IPartyInviteReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId", "uid"], [], "payload");
    return { clientReqId: requiredId(value, "clientReqId"), uid: boundedString(value.uid, "payload.uid", 1, 128) };
};
export const validatePartyAcceptReq: RuntimeValidator<IPartyAcceptReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId", "partyId"], [], "payload");
    return { clientReqId: requiredId(value, "clientReqId"), partyId: finiteInteger(value.partyId, "payload.partyId", 1, PARTY_ID_MAX) };
};
export const validatePartyDeclineReq: RuntimeValidator<IPartyDeclineReq> = validatePartyAcceptReq;
export const validatePartyLeaveReq: RuntimeValidator<IPartyLeaveReq> = validatePartyCreateReq;
export const validatePartyKickReq: RuntimeValidator<IPartyKickReq> = validatePartyInviteReq;
export const validatePartyTransferLeaderReq: RuntimeValidator<IPartyTransferLeaderReq> = validatePartyInviteReq;
export const validatePartyGetReq: RuntimeValidator<IPartyGetReq> = emptyPayload;
export const validatePartyGetEventsReq: RuntimeValidator<IPartyGetEventsReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["sinceSeq"], [], "payload"); return { sinceSeq: finiteInteger(value.sinceSeq, "payload.sinceSeq", 0) };
};

export const validatePartyCreateRes: RuntimeValidator<IPartyCreateRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["partyId", "seq"], [], "response");
    return { partyId: finiteInteger(value.partyId, "response.partyId", 1, PARTY_ID_MAX), seq: finiteInteger(value.seq, "response.seq", 1) };
};
export const validatePartyInviteRes: RuntimeValidator<IPartyInviteRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["ok", "seq", "expAt"], [], "response");
    return { ok: boolField(value, "ok"), seq: finiteInteger(value.seq, "response.seq", 1), expAt: finiteInteger(value.expAt, "response.expAt", 0) };
};
export const validatePartySeqRes: RuntimeValidator<IPartyAcceptRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["ok", "seq"], [], "response");
    return { ok: boolField(value, "ok"), seq: finiteInteger(value.seq, "response.seq", 1) };
};
export const validatePartyDeclineRes: RuntimeValidator<IPartyDeclineRes> = validateOkRes;
export const validatePartyLeaveRes: RuntimeValidator<IPartyLeaveRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["ok", "disbanded"], [], "response");
    return { ok: boolField(value, "ok"), disbanded: boolField(value, "disbanded") };
};
export const validatePartyGetRes: RuntimeValidator<IPartyGetRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["party"], [], "response");
    return { party: value.party === null ? null : validatePartyView(value.party) };
};
export const validatePartyGetEventsRes: RuntimeValidator<IPartyGetEventsRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["events", "latestSeq", "partyId"], [], "response");
    if (!Array.isArray(value.events) || value.events.length > 1000) throw new WireValidationError("RPC_EVENTS", "response.events");
    return {
        events: value.events.map((event, i) => validatePartyEvent(event, i)),
        latestSeq: finiteInteger(value.latestSeq, "response.latestSeq", 0),
        partyId: finiteInteger(value.partyId, "response.partyId", 0, PARTY_ID_MAX),
    };
};

export const validatePartyEventPush: RuntimeValidator<IPartyEventPush> = (input) => {
    const value = pushRecord(input, "push.data");
    assertExactKeys(value, ["seq", "partyId"], [], "push.data");
    return { seq: finiteInteger(value.seq, "push.data.seq", 0), partyId: finiteInteger(value.partyId, "push.data.partyId", 0, PARTY_ID_MAX) };
};
export const validatePartyInvitedPush: RuntimeValidator<IPartyInvitedPush> = (input) => {
    const value = pushRecord(input, "push.data");
    assertExactKeys(value, ["partyId", "by", "expAt"], [], "push.data");
    return {
        partyId: finiteInteger(value.partyId, "push.data.partyId", 1, PARTY_ID_MAX),
        by: boundedString(value.by, "push.data.by", 1, 128),
        expAt: finiteInteger(value.expAt, "push.data.expAt", 0),
    };
};

export default defineLobbyRpcDomain({
    domain: "party",
    contractVersion: 1,
    errorCodes: [
        "PARTY_NOT_FOUND",
        "PARTY_FULL",
        "PARTY_NOT_MEMBER",
        "PARTY_NOT_LEADER",
        "PARTY_ALREADY_IN_PARTY",
        "PARTY_INVITE_INVALID",
        "PARTY_TARGET_OFFLINE",
    ],
    pushes: [
        defineLobbyPush("PartyEvent", "party.event", validatePartyEventPush),
        defineLobbyPush("PartyInvited", "party.invited", validatePartyInvitedPush),
    ],
    routes: [
        defineRpcIdempotentWrite(PartyRpc.Create, { request: validatePartyCreateReq, response: validatePartyCreateRes }),
        defineRpcIdempotentWrite(PartyRpc.Invite, { request: validatePartyInviteReq, response: validatePartyInviteRes }),
        defineRpcIdempotentWrite(PartyRpc.Accept, { request: validatePartyAcceptReq, response: validatePartySeqRes }),
        defineRpcIdempotentWrite(PartyRpc.Decline, { request: validatePartyDeclineReq, response: validatePartyDeclineRes }),
        defineRpcIdempotentWrite(PartyRpc.Leave, { request: validatePartyLeaveReq, response: validatePartyLeaveRes }),
        defineRpcIdempotentWrite(PartyRpc.Kick, { request: validatePartyKickReq, response: validatePartySeqRes }),
        defineRpcIdempotentWrite(PartyRpc.TransferLeader, { request: validatePartyTransferLeaderReq, response: validatePartySeqRes }),
        defineRpcQuery(PartyRpc.Get, { request: validatePartyGetReq, response: validatePartyGetRes }),
        defineRpcQuery(PartyRpc.GetEvents, { request: validatePartyGetEventsReq, response: validatePartyGetEventsRes }),
    ],
});
