/**
 * guild 域 ws-RPC 契约（本域当前是「在线广播 + 事件系统」的最小落地：join/leave 是
 * 写路径样板 + 在线索引维护点，getEvents 是唤醒式推送的自愈拉取端）。
 *
 * 事件窗口语义：服务端只保留每工会最近 GUILD_EVT_LOG_MAX 条事件（Redis capped list），
 * seq 为工会内单调递增。客户端拉取时 sinceSeq 落在窗口外（拿到的最老事件 seq 仍 >
 * sinceSeq+1）应按「全量刷新」处理本地状态——事件流是增量通知载体，⛔ 不是权威存储，
 * 各系统权威在自己的库表。
 *
 * 执行模式：Join/Leave=idempotent-write；GetEvents=query。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import { defineLobbyPush, defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import { boolField, pushRecord, requiredId, rpcRecord, validateOkRes } from "../primitives";

/** guild 域路由名 */
export const GuildRpc = {
    /** 加入工会（demo 级：只写档字段 + 发事件；真实工会系统落地时在此域扩展） */
    Join: "guild.join",
    /** 退出工会 */
    Leave: "guild.leave",
    /** 拉取工会事件增量（唤醒式推送的自愈端；上线/断线重连/seq 不连续时调用） */
    GetEvents: "guild.getEvents",
} as const;

/** 单条工会事件 */
export interface IGuildEvent {
    /** 工会内单调递增序号 */
    seq: number;
    /** 事件种类（如 memberJoin / memberLeave；各玩法自行扩展） */
    kind: string;
    /** 事件附加数据（可 JSON 序列化的小对象；大内容放权威库表，这里只放引用） */
    data?: unknown;
    /** 服务端时间戳（ms） */
    at: number;
}

export interface IGuildJoinReq {
    /** 幂等 id（09·I2） */
    clientReqId: string;
    guildId: number;
}
export interface IGuildJoinRes {
    ok: boolean;
    /** 本次 memberJoin 事件的 seq */
    seq: number;
}

export interface IGuildLeaveReq {
    clientReqId: string;
}
export interface IGuildLeaveRes {
    ok: boolean;
}

export interface IGuildGetEventsReq {
    /** 客户端已见的最大 seq；0 = 从头（窗口内） */
    sinceSeq: number;
}
export interface IGuildGetEventsRes {
    /** seq 升序；窗口语义见文件头 */
    events: IGuildEvent[];
    latestSeq: number;
    /** 本次响应对应的工会（0 = 无工会）。seq 是工会内命名空间——客户端发现与本地
     *  记录的工会不一致时必须重置 seq 水位（GuildLogic 已封装），否则跨会污染。 */
    guildId: number;
}

/** 工会事件唤醒载荷：⛔ 不承载事件内容（丢推送/断线/离线三种情况统一走拉取自愈）。
 *  guildId 必带——seq 是**工会内**命名空间，不带身份的话换会后客户端水位跨会污染，
 *  高 seq 会 → 低 seq 会的切换会让唤醒被当迟到全部忽略（事件流静默失聪）。 */
export interface IGuildEventPush {
    seq: number;
    guildId: number;
}

/** 路由名 → { req, res } */
export interface GuildRpcMap {
    [GuildRpc.Join]: { req: IGuildJoinReq; res: IGuildJoinRes };
    [GuildRpc.Leave]: { req: IGuildLeaveReq; res: IGuildLeaveRes };
    [GuildRpc.GetEvents]: { req: IGuildGetEventsReq; res: IGuildGetEventsRes };
}

function validateGuildEvent(input: unknown, index: number): IGuildEvent {
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

export const validateGuildJoinReq: RuntimeValidator<IGuildJoinReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId", "guildId"], [], "payload"); return { clientReqId: requiredId(value, "clientReqId"), guildId: finiteInteger(value.guildId, "payload.guildId", 1, 999_999_999) };
};
export const validateGuildLeaveReq: RuntimeValidator<IGuildLeaveReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId"], [], "payload"); return { clientReqId: requiredId(value, "clientReqId") };
};
export const validateGuildEventsReq: RuntimeValidator<IGuildGetEventsReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["sinceSeq"], [], "payload"); return { sinceSeq: finiteInteger(value.sinceSeq, "payload.sinceSeq", 0) };
};

export const validateJoinRes: RuntimeValidator<IGuildJoinRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["ok", "seq"], [], "response"); return { ok: boolField(value, "ok"), seq: finiteInteger(value.seq, "response.seq", 1) };
};
export const validateGuildLeaveRes: RuntimeValidator<IGuildLeaveRes> = validateOkRes;
export const validateEventsRes: RuntimeValidator<IGuildGetEventsRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["events", "latestSeq", "guildId"], [], "response");
    if (!Array.isArray(value.events) || value.events.length > 1000) throw new WireValidationError("RPC_EVENTS", "response.events");
    return { events: value.events.map((event, i) => validateGuildEvent(event, i)), latestSeq: finiteInteger(value.latestSeq, "response.latestSeq", 0), guildId: finiteInteger(value.guildId, "response.guildId", 0) };
};

export const validateGuildEventPush: RuntimeValidator<IGuildEventPush> = (input) => {
    const value = pushRecord(input, "push.data");
    assertExactKeys(value, ["seq", "guildId"], [], "push.data");
    return {
        seq: finiteInteger(value.seq, "push.data.seq", 0),
        guildId: finiteInteger(value.guildId, "push.data.guildId", 0),
    };
};

export default defineLobbyRpcDomain({
    domain: "guild",
    errorCodes: [],
    pushes: [
        defineLobbyPush("GuildEvent", "guild.event", validateGuildEventPush),
    ],
    routes: [
        defineRpcIdempotentWrite(GuildRpc.Join, { request: validateGuildJoinReq, response: validateJoinRes }),
        defineRpcIdempotentWrite(GuildRpc.Leave, { request: validateGuildLeaveReq, response: validateGuildLeaveRes }),
        defineRpcQuery(GuildRpc.GetEvents, { request: validateGuildEventsReq, response: validateEventsRes }),
    ],
});
