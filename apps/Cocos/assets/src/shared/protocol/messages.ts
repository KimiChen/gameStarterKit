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
    /** 附近聊天（MMO MF6b，docs/MMO.md §6.5.1）：只在 kind:"world" 房、只在 Active；rateCost 见 CORE_C2S_OPTIONS */
    WorldChat: "c2s.world.chat",
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
    /** 附近聊天气泡（MMO MF6b）：perSession（见 CORE_S2C_OPTIONS），只按会话经视野流投递，broadcast 对它 fail-closed */
    WorldChat: "s2c.world.chat",
} as const;

/**
 * core token 选项表（MMO MF6b，docs/MMO.md §6.5.1；gameplay-codegen 与 CORE_C2S / CORE_S2C 一样按**字面量**读取）：
 * 键 = 上面两张表里的消息名字符串字面量；c2s 只认 `rateCost`（≥1 整数，进 GAME_WIRE_RATE_COST），
 * s2c 只认 `perSession: true`（+ 可选 `coalesceKey`，进 GAME_WIRE_PER_SESSION 与 CORE_S2C_TOKENS 的 defineS2C 第三参）。
 * 未列出的 core token 保持缺省（rateCost 1 / 全房消息）；phase 规则仍归各 shell（⛔ 不在此声明 phases）。
 */
export const CORE_C2S_OPTIONS = {
    "c2s.world.chat": { rateCost: 2 },
} as const;

export const CORE_S2C_OPTIONS = {
    "s2c.world.chat": { perSession: true },
} as const;

export type CoreC2SType = (typeof CORE_C2S)[keyof typeof CORE_C2S];
export type CoreS2CType = (typeof CORE_S2C)[keyof typeof CORE_S2C];

/** core 消息名 → payload 类型，供生成的全集聚合与两端 adapter 共享。 */
export interface CoreC2SPayloadMap {
    [CORE_C2S.Ping]: IPingReq;
    [CORE_C2S.Chat]: IChatReq;
    [CORE_C2S.RoomReady]: IRoomReadyReq;
    [CORE_C2S.RoomStart]: IRoomStartReq;
    [CORE_C2S.WorldChat]: IWorldChatReq;
}

export interface CoreS2CPayloadMap {
    [CORE_S2C.Pong]: IPongRes;
    [CORE_S2C.Welcome]: IWelcomeRes;
    [CORE_S2C.Chat]: IChatRes;
    [CORE_S2C.Error]: IErrorRes;
    [CORE_S2C.RoomError]: IRoomErrorRes;
    [CORE_S2C.RoomCodeInvalidated]: IRoomCodeInvalidatedRes;
    [CORE_S2C.WorldChat]: IWorldChatRes;
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

/** 附近聊天请求：与 Chat 同界（1..MAX_CHAT_TEXT、trim 非空）；受众与盖章全在世界房（MMO MF6b）。 */
function validateWorldChat(input: unknown): IWorldChatReq {
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

/** 附近聊天气泡：fromEntityId = 发送者主实体（kit 映射成角色名）、at = 服务端时间戳；⛔ 无 uid / 昵称（可见性 = 权限，§6.5.1）。 */
function validateWorldChatPush(input: unknown): IWorldChatRes {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["fromEntityId", "text", "at"], [], "payload");
    const text = boundedString(value.text, "payload.text", 1, MAX_CHAT_TEXT);
    if (text.trim().length === 0) throw new WireValidationError("MESSAGE_TEXT", "payload.text");
    return {
        fromEntityId: boundedString(value.fromEntityId, "payload.fromEntityId", 1, MAX_MESSAGE_ID),
        text,
        at: finiteInteger(value.at, "payload.at", 0),
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
    [CORE_C2S.WorldChat]: guardMessageValidator(validateWorldChat),
};

export const CORE_S2C_WIRE: { [K in CoreS2CType]: RuntimeValidator<CoreS2CPayloadMap[K]> } = {
    [CORE_S2C.Pong]: guardMessageValidator(validatePong),
    [CORE_S2C.Welcome]: guardMessageValidator(validateWelcome),
    [CORE_S2C.Chat]: guardMessageValidator(validateChatResult),
    [CORE_S2C.Error]: guardMessageValidator(validateError),
    [CORE_S2C.RoomError]: guardMessageValidator(validateRoomError),
    [CORE_S2C.RoomCodeInvalidated]: guardMessageValidator(validateRoomCodeInvalidated),
    [CORE_S2C.WorldChat]: guardMessageValidator(validateWorldChatPush),
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

/** 附近聊天请求（MMO MF6b）：只有文本；受众由世界房按兴趣集算，发送者由会话决定。 */
export interface IWorldChatReq {
    text: string;
}

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

/** 附近聊天气泡（MMO MF6b，perSession 视野流）：kit 把 fromEntityId 映射成角色名。 */
export interface IWorldChatRes {
    /** 发送者主实体 id（WorldMode.primaryEntityOf） */
    fromEntityId: string;
    text: string;
    /** 服务端时间戳（ms） */
    at: number;
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
