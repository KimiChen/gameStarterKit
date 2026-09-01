import {
    assertExactKeys,
    boundedString,
    finiteInteger,
    guardWire,
    isPlainRecord,
    type PlainRecord,
    type RuntimeValidator,
    WireValidationError,
} from "./http";
import {
    isErrorCode,
    isRoomControlError,
    type ErrorCodeType,
    type RoomControlErrorType,
} from "../constants/errors";

/**
 * 房间内 **core** 消息协议 —— 双端共享。
 *
 * 约定：
 *  - C2S：客户端 room.send(C2S.Xxx, payload) → 服务端 GameRoom catch-all dispatcher
 *  - S2C：服务端 client.send(S2C.Xxx, payload) / this.broadcast(S2C.Xxx, payload)
 *         → 客户端 room.onMessage(S2C.Xxx, ...)
 *  - payload 一律为可 JSON 序列化的纯数据对象，接口以 I 前缀命名。
 *
 * 本文件只拥有 shell 的公共传输消息（Ping/Chat 与 Pong/Welcome/Chat/Error）。
 * 玩法消息住在各玩法自己的 `gameplays/<id>/wire.ts`；全集聚合（`C2S`/`S2C`/
 * `C2SPayloadMap`/`validateC2SPayload` 等公共名）由 `codegen:gameplays` 生成在
 * `gameplays/generated/wire-catalog.generated.ts`，经 `@game/shared` 根 barrel 原名导出。
 * ⚠ `CORE_C2S`/`CORE_S2C` 的字面量形态被生成器语法读取，⛔ 不要改成计算/拼接形式。
 */

/** 客户端 → 服务端 core 消息名 */
export const CORE_C2S = {
    /** 心跳 */
    Ping: "c2s.ping",
    /** 聊天 */
    Chat: "c2s.chat",
    /** 私房 Ready 置位/清除（owner-ready profile；仅 Waiting，§6.2） */
    RoomReady: "c2s.room.ready",
    /** 房主开局（owner-ready profile；仅 Waiting，§6.3） */
    RoomStart: "c2s.room.start",
} as const;

/** 服务端 → 客户端 core 消息名 */
export const CORE_S2C = {
    /** 心跳回包 */
    Pong: "s2c.pong",
    /** 欢迎信息（入房后下发一次） */
    Welcome: "s2c.welcome",
    /** 聊天广播 */
    Chat: "s2c.chat",
    /** 服务端错误提示 */
    Error: "s2c.error",
    /** 房内 core control 错误（Ready/Start/owner/phase；§4.7 三域之二，code 独立于 ErrorCode） */
    RoomError: "s2c.room.error",
    /** 邀请码已失效（renew lost；旧码禁止继续展示，§6.7 第 5 条） */
    RoomCodeInvalidated: "s2c.room.codeInvalidated",
} as const;

export type CoreC2SType = (typeof CORE_C2S)[keyof typeof CORE_C2S];
export type CoreS2CType = (typeof CORE_S2C)[keyof typeof CORE_S2C];

/** core 消息名 → payload 类型，供生成的全集聚合与两端 adapter 共享。 */
export interface CoreC2SPayloadMap {
    [CORE_C2S.Ping]: IPingReq;
    [CORE_C2S.Chat]: IChatReq;
    [CORE_C2S.RoomReady]: IRoomReadyReq;
    [CORE_C2S.RoomStart]: IRoomStartReq;
}

export interface CoreS2CPayloadMap {
    [CORE_S2C.Pong]: IPongRes;
    [CORE_S2C.Welcome]: IWelcomeRes;
    [CORE_S2C.Chat]: IChatRes;
    [CORE_S2C.Error]: IErrorRes;
    [CORE_S2C.RoomError]: IRoomErrorRes;
    [CORE_S2C.RoomCodeInvalidated]: IRoomCodeInvalidatedRes;
}

const MAX_MESSAGE_ID = 64;
const MAX_CHAT_TEXT = 100;
const MAX_MESSAGE_TICK_RATE = 240;

function messageRecord(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function validatePing(input: unknown): IPingReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["clientTime"], [], "payload");
    return { clientTime: finiteInteger(value.clientTime, "payload.clientTime", 0) };
}

function validateChat(input: unknown): IChatReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["text"], [], "payload");
    const text = boundedString(value.text, "payload.text", 1, MAX_CHAT_TEXT);
    if (text.trim().length === 0) throw new WireValidationError("MESSAGE_TEXT", "payload.text");
    return { text };
}

function validateRoomReady(input: unknown): IRoomReadyReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["ready"], [], "payload");
    if (typeof value.ready !== "boolean") throw new WireValidationError("MESSAGE_READY", "payload.ready");
    return { ready: value.ready };
}

function validateRoomStart(input: unknown): IRoomStartReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, [], [], "payload");
    return {};
}

function validatePong(input: unknown): IPongRes {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["clientTime", "serverTime"], [], "payload");
    return {
        clientTime: finiteInteger(value.clientTime, "payload.clientTime", 0),
        serverTime: finiteInteger(value.serverTime, "payload.serverTime", 0),
    };
}

function validateWelcome(input: unknown): IWelcomeRes {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["sessionId", "tickRate", "motd"], [], "payload");
    return {
        sessionId: boundedString(value.sessionId, "payload.sessionId", 1, MAX_MESSAGE_ID),
        tickRate: finiteInteger(value.tickRate, "payload.tickRate", 1, MAX_MESSAGE_TICK_RATE),
        motd: boundedString(value.motd, "payload.motd", 0, 1024),
    };
}

function validateChatResult(input: unknown): IChatRes {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["fromId", "fromName", "text", "time"], [], "payload");
    return {
        fromId: boundedString(value.fromId, "payload.fromId", 1, MAX_MESSAGE_ID),
        fromName: boundedString(value.fromName, "payload.fromName", 1, 128),
        text: boundedString(value.text, "payload.text", 1, MAX_CHAT_TEXT),
        time: finiteInteger(value.time, "payload.time", 0),
    };
}

function validateError(input: unknown): IErrorRes {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["code", "message"], [], "payload");
    const code = finiteInteger(value.code, "payload.code", 0, 0xfffff);
    if (!isErrorCode(code)) throw new WireValidationError("MESSAGE_ERROR_CODE", "payload.code");
    return {
        code,
        message: boundedString(value.message, "payload.message", 0, 1024),
    };
}

function validateRoomError(input: unknown): IRoomErrorRes {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["code"], [], "payload");
    const code = finiteInteger(value.code, "payload.code", 0, 0xfffff);
    // ⛔ code 域独立于 ErrorCode（§4.7）：只接受 RoomControlError 段成员。
    if (!isRoomControlError(code)) throw new WireValidationError("MESSAGE_ROOM_ERROR_CODE", "payload.code");
    return { code };
}

function validateRoomCodeInvalidated(input: unknown): IRoomCodeInvalidatedRes {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, [], [], "payload");
    return {};
}

/** Core runtime validators. Values are copied so callers cannot mutate a validated payload. */
const guardMessageValidator = <T>(validator: RuntimeValidator<T>): RuntimeValidator<T> =>
    (input: unknown) => guardWire("payload", () => validator(input));

/** core 消息名 → validator 表；生成的 wire catalog 静态 import 它并入全集。 */
export const CORE_C2S_WIRE: { [K in CoreC2SType]: RuntimeValidator<CoreC2SPayloadMap[K]> } = {
    [CORE_C2S.Ping]: guardMessageValidator(validatePing),
    [CORE_C2S.Chat]: guardMessageValidator(validateChat),
    [CORE_C2S.RoomReady]: guardMessageValidator(validateRoomReady),
    [CORE_C2S.RoomStart]: guardMessageValidator(validateRoomStart),
};

export const CORE_S2C_WIRE: { [K in CoreS2CType]: RuntimeValidator<CoreS2CPayloadMap[K]> } = {
    [CORE_S2C.Pong]: guardMessageValidator(validatePong),
    [CORE_S2C.Welcome]: guardMessageValidator(validateWelcome),
    [CORE_S2C.Chat]: guardMessageValidator(validateChatResult),
    [CORE_S2C.Error]: guardMessageValidator(validateError),
    [CORE_S2C.RoomError]: guardMessageValidator(validateRoomError),
    [CORE_S2C.RoomCodeInvalidated]: guardMessageValidator(validateRoomCodeInvalidated),
};

// ---------------- 网关大厅房（服务端框架 M5，docs/SERVER.md §4 Lobby RPC） ----------------

/** LobbyRoom 的 RPC 请求消息名（信封 {id,type,payload}，id 做请求-响应配对） */
export const LOBBY_MSG_RPC = "rpc";
/** LobbyRoom 的服务端主动推送消息名（{type,data}） */
export const LOBBY_MSG_PUSH = "push";

// ---------------- C2S payload ----------------

export interface IPingReq {
    /** 客户端发送时刻（ms 时间戳），用于计算 RTT */
    clientTime: number;
}

export interface IChatReq {
    text: string;
}

export interface IRoomReadyReq {
    /** true = Ready 置位；false = Ready 清除（都只在 Waiting 合法，starting 期间被拒） */
    ready: boolean;
}

/** 空 payload（房主开局请求；owner/phase/人数/allReady 全部由服务端权威判定）。 */
export interface IRoomStartReq {}

// ---------------- S2C payload ----------------

export interface IPongRes {
    /** 原样返回客户端发送时刻 */
    clientTime: number;
    /** 服务端当前时刻（ms 时间戳） */
    serverTime: number;
}

export interface IWelcomeRes {
    /** 当前客户端在房间内的 sessionId */
    sessionId: string;
    /** 服务端逻辑帧率 */
    tickRate: number;
    /** 欢迎语（假数据演示用） */
    motd: string;
}

export interface IChatRes {
    fromId: string;
    fromName: string;
    text: string;
    /** 服务端时间戳（ms） */
    time: number;
}

export interface IErrorRes {
    code: ErrorCodeType;
    message: string;
}

/** 房内 core control 错误（§4.7 三域之二）：客户端只按 code 分支，文案查 RoomControlErrorMessage。 */
export interface IRoomErrorRes {
    code: RoomControlErrorType;
}

/** 邀请码失效通知（无参数；权威绑定由 resolve 侧 lease generation 承担）。 */
export interface IRoomCodeInvalidatedRes {}
