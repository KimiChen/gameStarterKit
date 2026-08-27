/**
 * LobbyRoom ws-RPC 契约聚合 —— 双端共享的「WebSocket 单次请求」类型真源。
 *
 * 传输层消息名（LOBBY_MSG_RPC / LOBBY_MSG_PUSH）在 ../messages.ts；本目录只管
 * 路由名与 req/res 形状。新增一个域：建 ./<域>.ts 后在此 ① export *、
 * ② LobbyRpcMap extends、③ ALL_LOBBY_RPC_TYPES 并入，三处各一行。
 */
import { GuildRpc, type GuildRpcMap } from "./guild";
import { MailRpc, type IMailClaimAttachReq, type IMailListReq, type IMailListRes, type IMailMarkReadReq, type IMailSummary, type MailRpcMap } from "./mail";
import { ShopRpc, type IShopPurchaseReq, type IShopQueryOpReq, type ShopRpcMap } from "./shop";
import { UserRpc, type IGetInfoRes, type IPublicUserView, type IUpdateProfileReq, type IUserView, type UserRpcMap } from "./user";
import type { IGuildEvent, IGuildGetEventsReq, IGuildGetEventsRes, IGuildJoinReq, IGuildLeaveReq } from "./guild";
import { assertExactKeys, boundedString, finiteInteger, isPlainRecord, type PlainRecord, type RuntimeValidator, WireValidationError } from "../http";
import type { IGrant, IPurchaseResult } from "./economy";

export * from "./envelope";
export * from "./economy";
export * from "./user";
export * from "./mail";
export * from "./shop";
export * from "./push";
export * from "./guild";

/** 全量路由契约（服务端 defineRpc 与客户端 WebSocketClient.rpc 的公共类型域） */
export interface LobbyRpcMap extends UserRpcMap, MailRpcMap, ShopRpcMap, GuildRpcMap {}

export type LobbyRpcType = keyof LobbyRpcMap;
export type RpcReq<T extends LobbyRpcType> = LobbyRpcMap[T]["req"];
export type RpcRes<T extends LobbyRpcType> = LobbyRpcMap[T]["res"];

/** 幂等写路由子集（req 含 clientReqId）——服务端 defineRpc(idem:true) 与客户端 rpcIdem 的类型域 */
export type LobbyRpcIdemType = {
    [K in LobbyRpcType]: RpcReq<K> extends { clientReqId: string } ? K : never;
}[LobbyRpcType];

/** 运行时全集：服务端 loader 启动校验 + 契约测试用。新增路由若漏在此处，服务端拒绝启动。 */
export const ALL_LOBBY_RPC_TYPES: readonly LobbyRpcType[] = [
    ...Object.values(UserRpc),
    ...Object.values(MailRpc),
    ...Object.values(ShopRpc),
    ...Object.values(GuildRpc),
];

// ---------------- route payload validators ----------------

function rpcRecord(input: unknown, path = "payload"): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("RPC_PAYLOAD_OBJECT", path);
    return input;
}

function emptyPayload(input: unknown): Record<string, never> {
    const value = rpcRecord(input);
    assertExactKeys(value, [], [], "payload");
    return {};
}

function requiredId(value: PlainRecord, key: string, max = 64): string {
    return boundedString(value[key], `payload.${key}`, 1, max);
}

function optionalRpcString(value: PlainRecord, key: string, max: number): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined) return undefined;
    return boundedString(value[key], `payload.${key}`, 0, max);
}

function boolField(value: PlainRecord, key: string): boolean {
    if (typeof value[key] !== "boolean") throw new WireValidationError("RPC_BOOLEAN", `payload.${key}`);
    return value[key] as boolean;
}

function validateUserView(input: unknown, path = "response.user"): IUserView {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["uid", "star", "maxRound", "wins", "losses", "stamina", "lastStaminaRecoverAt", "musicOn", "sfxOn", "guildId", "ver"], [], path);
    return {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
        star: finiteInteger(value.star, `${path}.star`, 0),
        maxRound: finiteInteger(value.maxRound, `${path}.maxRound`, 0),
        wins: finiteInteger(value.wins, `${path}.wins`, 0),
        losses: finiteInteger(value.losses, `${path}.losses`, 0),
        stamina: finiteInteger(value.stamina, `${path}.stamina`, 0),
        lastStaminaRecoverAt: finiteInteger(value.lastStaminaRecoverAt, `${path}.lastStaminaRecoverAt`, 0),
        musicOn: boolField(value, "musicOn"),
        sfxOn: boolField(value, "sfxOn"),
        guildId: finiteInteger(value.guildId, `${path}.guildId`, 0),
        ver: finiteInteger(value.ver, `${path}.ver`, 0),
    };
}

function validatePublicUser(input: unknown, path = "response.profile"): IPublicUserView {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["uid", "nickname", "avatarId", "province", "star", "maxRound", "wins", "losses"], [], path);
    return {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
        nickname: boundedString(value.nickname, `${path}.nickname`, 0, 128),
        avatarId: finiteInteger(value.avatarId, `${path}.avatarId`, -1),
        province: boundedString(value.province, `${path}.province`, 0, 64),
        star: finiteInteger(value.star, `${path}.star`, 0),
        maxRound: finiteInteger(value.maxRound, `${path}.maxRound`, 0),
        wins: finiteInteger(value.wins, `${path}.wins`, 0),
        losses: finiteInteger(value.losses, `${path}.losses`, 0),
    };
}

function validateGrant(input: unknown, path: string): IGrant {
    const value = rpcRecord(input, path);
    if (value.kind === "item") {
        assertExactKeys(value, ["kind", "itemId", "count"], [], path);
        return { kind: "item", itemId: finiteInteger(value.itemId, `${path}.itemId`, 1), count: finiteInteger(value.count, `${path}.count`) };
    }
    if (value.kind === "star") {
        assertExactKeys(value, ["kind", "delta"], [], path);
        return { kind: "star", delta: finiteInteger(value.delta, `${path}.delta`) };
    }
    if (value.kind === "setField") {
        assertExactKeys(value, ["kind", "field", "value"], [], path);
        return { kind: "setField", field: boundedString(value.field, `${path}.field`, 1, 64), value: boundedString(value.value, `${path}.value`, 0, 1024) };
    }
    throw new WireValidationError("RPC_GRANT_KIND", `${path}.kind`);
}

function validatePurchaseResult(input: unknown, path = "response"): IPurchaseResult {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["opId", "status", "balance"], ["granted"], path);
    if (value.status !== "done" && value.status !== "granting" && value.status !== "dead") {
        throw new WireValidationError("RPC_PURCHASE_STATUS", `${path}.status`);
    }
    const grantedValue = value.granted;
    let granted: IGrant[] | undefined;
    if (grantedValue !== undefined) {
        if (!Array.isArray(grantedValue) || grantedValue.length > 64) throw new WireValidationError("RPC_GRANTS", `${path}.granted`);
        granted = grantedValue.map((item, i) => validateGrant(item, `${path}.granted[${i}]`));
    }
    const base = {
        opId: boundedString(value.opId, `${path}.opId`, 1, 128),
        status: value.status as IPurchaseResult["status"],
        balance: finiteInteger(value.balance, `${path}.balance`, 0),
    };
    return granted === undefined ? base : { ...base, granted };
}

function validateMailSummary(input: unknown, index: number): IMailSummary {
    const path = `response.mails[${index}]`;
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["mailId", "title", "body", "hasAttach", "read", "claimed", "createdAt"], [], path);
    return {
        mailId: finiteInteger(value.mailId, `${path}.mailId`, 1),
        title: boundedString(value.title, `${path}.title`, 0, 256),
        body: boundedString(value.body, `${path}.body`, 0, 64 * 1024),
        hasAttach: boolField(value, "hasAttach"),
        read: boolField(value, "read"),
        claimed: boolField(value, "claimed"),
        createdAt: finiteInteger(value.createdAt, `${path}.createdAt`, 0),
    };
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

const validateGetUserIdReq: RuntimeValidator<Record<string, never>> = emptyPayload;
const validateGetInfoReq: RuntimeValidator<Record<string, never>> = emptyPayload;
const validateGetProfileReq: RuntimeValidator<{ uid: string }> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["uid"], [], "payload"); return { uid: requiredId(value, "uid", 128) };
};
const validateUpdateProfileReq: RuntimeValidator<IUpdateProfileReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId"], ["nickname", "avatarId", "province", "musicOn", "sfxOn"], "payload");
    const out: IUpdateProfileReq = { clientReqId: requiredId(value, "clientReqId") };
    const nickname = optionalRpcString(value, "nickname", 24); if (nickname !== undefined) out.nickname = nickname;
    const province = optionalRpcString(value, "province", 16); if (province !== undefined) out.province = province;
    if (Object.prototype.hasOwnProperty.call(value, "avatarId") && value.avatarId !== undefined) out.avatarId = finiteInteger(value.avatarId, "payload.avatarId", -1, 999);
    if (Object.prototype.hasOwnProperty.call(value, "musicOn") && value.musicOn !== undefined) out.musicOn = boolField(value, "musicOn");
    if (Object.prototype.hasOwnProperty.call(value, "sfxOn") && value.sfxOn !== undefined) out.sfxOn = boolField(value, "sfxOn");
    return out;
};

const validateMailListReq: RuntimeValidator<IMailListReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, [], ["before", "limit"], "payload");
    const out: IMailListReq = {};
    if (value.before !== undefined) out.before = finiteInteger(value.before, "payload.before", 1);
    if (value.limit !== undefined) out.limit = finiteInteger(value.limit, "payload.limit", 1, 50);
    return out;
};
const validateMailClaimReq: RuntimeValidator<IMailClaimAttachReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId", "mailId"], [], "payload");
    return { clientReqId: requiredId(value, "clientReqId"), mailId: finiteInteger(value.mailId, "payload.mailId", 1) };
};
const validateMailMarkReq: RuntimeValidator<IMailMarkReadReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["mailId"], [], "payload"); return { mailId: finiteInteger(value.mailId, "payload.mailId", 1) };
};
const validateShopPurchaseReq: RuntimeValidator<IShopPurchaseReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId", "sku"], [], "payload"); return { clientReqId: requiredId(value, "clientReqId"), sku: boundedString(value.sku, "payload.sku", 1, 64) };
};
const validateShopQueryReq: RuntimeValidator<IShopQueryOpReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["opId"], [], "payload"); return { opId: requiredId(value, "opId", 128) };
};
const validateGuildJoinReq: RuntimeValidator<IGuildJoinReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId", "guildId"], [], "payload"); return { clientReqId: requiredId(value, "clientReqId"), guildId: finiteInteger(value.guildId, "payload.guildId", 1, 999_999_999) };
};
const validateGuildLeaveReq: RuntimeValidator<IGuildLeaveReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["clientReqId"], [], "payload"); return { clientReqId: requiredId(value, "clientReqId") };
};
const validateGuildEventsReq: RuntimeValidator<IGuildGetEventsReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["sinceSeq"], [], "payload"); return { sinceSeq: finiteInteger(value.sinceSeq, "payload.sinceSeq", 0) };
};

const validateOkRes: RuntimeValidator<{ ok: boolean }> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["ok"], [], "response"); return { ok: boolField(value, "ok") };
};
const validateGetUserIdRes: RuntimeValidator<{ uid: string }> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["uid"], [], "response"); return { uid: boundedString(value.uid, "response.uid", 1, 128) };
};
const validateGetInfoRes: RuntimeValidator<IGetInfoRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["user"], [], "response"); return { user: validateUserView(value.user) };
};
const validateProfileRes: RuntimeValidator<{ profile: IPublicUserView | null }> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["profile"], [], "response"); return { profile: value.profile === null ? null : validatePublicUser(value.profile) };
};
const validateUpdateRes: RuntimeValidator<{ ok: boolean }> = validateOkRes;
const validateMailListRes: RuntimeValidator<IMailListRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["mails"], [], "response");
    if (!Array.isArray(value.mails) || value.mails.length > 50) throw new WireValidationError("RPC_MAILS", "response.mails");
    return { mails: value.mails.map((mail, i) => validateMailSummary(mail, i)) };
};
const validateJoinRes: RuntimeValidator<{ ok: boolean; seq: number }> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["ok", "seq"], [], "response"); return { ok: boolField(value, "ok"), seq: finiteInteger(value.seq, "response.seq", 1) };
};
const validateEventsRes: RuntimeValidator<IGuildGetEventsRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["events", "latestSeq", "guildId"], [], "response");
    if (!Array.isArray(value.events) || value.events.length > 1000) throw new WireValidationError("RPC_EVENTS", "response.events");
    return { events: value.events.map((event, i) => validateGuildEvent(event, i)), latestSeq: finiteInteger(value.latestSeq, "response.latestSeq", 0), guildId: finiteInteger(value.guildId, "response.guildId", 0) };
};

/** Route request validators: exact fields + finite/range checks, shared by client and server adapters. */
export const LOBBY_RPC_REQUEST_VALIDATORS = {
    [UserRpc.GetUserId]: validateGetUserIdReq,
    [UserRpc.GetInfo]: validateGetInfoReq,
    [UserRpc.GetProfile]: validateGetProfileReq,
    [UserRpc.UpdateProfile]: validateUpdateProfileReq,
    [MailRpc.List]: validateMailListReq,
    [MailRpc.ClaimAttach]: validateMailClaimReq,
    [MailRpc.MarkRead]: validateMailMarkReq,
    [ShopRpc.Purchase]: validateShopPurchaseReq,
    [ShopRpc.QueryOp]: validateShopQueryReq,
    [GuildRpc.Join]: validateGuildJoinReq,
    [GuildRpc.Leave]: validateGuildLeaveReq,
    [GuildRpc.GetEvents]: validateGuildEventsReq,
} as const;

/** Route response validators. */
export const LOBBY_RPC_RESPONSE_VALIDATORS = {
    [UserRpc.GetUserId]: validateGetUserIdRes,
    [UserRpc.GetInfo]: validateGetInfoRes,
    [UserRpc.GetProfile]: validateProfileRes,
    [UserRpc.UpdateProfile]: validateUpdateRes,
    [MailRpc.List]: validateMailListRes,
    [MailRpc.ClaimAttach]: validatePurchaseResult,
    [MailRpc.MarkRead]: validateOkRes,
    [ShopRpc.Purchase]: validatePurchaseResult,
    [ShopRpc.QueryOp]: validatePurchaseResult,
    [GuildRpc.Join]: validateJoinRes,
    [GuildRpc.Leave]: validateOkRes,
    [GuildRpc.GetEvents]: validateEventsRes,
} as const;

export function validateLobbyRpcRequest<T extends LobbyRpcType>(type: T, input: unknown): RpcReq<T> {
    const validator = LOBBY_RPC_REQUEST_VALIDATORS[type] as RuntimeValidator<RpcReq<T>> | undefined;
    if (!validator) throw new WireValidationError("RPC_TYPE", `type:${String(type)}`);
    return validator(input);
}

export function validateLobbyRpcResponse<T extends LobbyRpcType>(type: T, input: unknown): RpcRes<T> {
    const validator = LOBBY_RPC_RESPONSE_VALIDATORS[type] as RuntimeValidator<RpcRes<T>> | undefined;
    if (!validator) throw new WireValidationError("RPC_TYPE", `type:${String(type)}`);
    return validator(input);
}
