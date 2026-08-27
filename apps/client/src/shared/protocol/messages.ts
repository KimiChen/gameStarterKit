import {
    assertExactKeys,
    boundedString,
    finiteInteger,
    finiteNumber,
    guardWire,
    isPlainRecord,
    type PlainRecord,
    type RuntimeValidator,
    WireValidationError,
} from "./http";
import { isErrorCode, type ErrorCodeType } from "../constants/errors";

/**
 * 房间内消息协议 —— 双端共享。
 *
 * 约定：
 *  - C2S：客户端 room.send(C2S.Xxx, payload) → 服务端 this.onMessage(C2S.Xxx, ...)
 *  - S2C：服务端 client.send(S2C.Xxx, payload) / this.broadcast(S2C.Xxx, payload)
 *         → 客户端 room.onMessage(S2C.Xxx, ...)
 *  - payload 一律为可 JSON 序列化的纯数据对象，接口以 I 前缀命名。
 */

/** 客户端 → 服务端 消息名 */
export const C2S = {
    /** 心跳 */
    Ping: "c2s.ping",
    /** 玩家移动输入 */
    Move: "c2s.move",
    /** 释放技能 */
    CastSkill: "c2s.castSkill",
    /** 聊天 */
    Chat: "c2s.chat",
} as const;

/** 服务端 → 客户端 消息名 */
export const S2C = {
    /** 心跳回包 */
    Pong: "s2c.pong",
    /** 欢迎信息（入房后下发一次） */
    Welcome: "s2c.welcome",
    /** 技能释放结果广播 */
    SkillResult: "s2c.skillResult",
    /** 聊天广播 */
    Chat: "s2c.chat",
    /** 服务端错误提示 */
    Error: "s2c.error",
} as const;

export type C2SType = (typeof C2S)[keyof typeof C2S];
export type S2CType = (typeof S2C)[keyof typeof S2C];

/** 消息名 → payload 类型，供两端 adapter 和 fixture 共享。 */
export interface C2SPayloadMap {
    [C2S.Ping]: IPingReq;
    [C2S.Move]: IMoveReq;
    [C2S.CastSkill]: ICastSkillReq;
    [C2S.Chat]: IChatReq;
}

export interface S2CPayloadMap {
    [S2C.Pong]: IPongRes;
    [S2C.Welcome]: IWelcomeRes;
    [S2C.SkillResult]: ISkillResultRes;
    [S2C.Chat]: IChatRes;
    [S2C.Error]: IErrorRes;
}

export type C2SPayload<T extends C2SType> = C2SPayloadMap[T];
export type S2CPayload<T extends S2CType> = S2CPayloadMap[T];

const MAX_MESSAGE_ID = 64;
const MAX_CHAT_TEXT = 100;
const MAX_MESSAGE_TICK_RATE = 240;

function messageRecord(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function optionalMessageString(value: PlainRecord, key: string, path: string, max: number): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined) return undefined;
    return boundedString(value[key], `${path}.${key}`, 1, max);
}

function validatePing(input: unknown): IPingReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["clientTime"], [], "payload");
    return { clientTime: finiteInteger(value.clientTime, "payload.clientTime", 0) };
}

function validateMove(input: unknown): IMoveReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["dirX", "dirY"], [], "payload");
    return {
        dirX: finiteNumber(value.dirX, "payload.dirX", -1, 1),
        dirY: finiteNumber(value.dirY, "payload.dirY", -1, 1),
    };
}

function validateCastSkill(input: unknown): ICastSkillReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["skillId"], ["targetId"], "payload");
    const targetId = optionalMessageString(value, "targetId", "payload", MAX_MESSAGE_ID);
    const skillId = finiteInteger(value.skillId, "payload.skillId", 0, 0xffff);
    return targetId === undefined ? { skillId } : { skillId, targetId };
}

function validateChat(input: unknown): IChatReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["text"], [], "payload");
    const text = boundedString(value.text, "payload.text", 1, MAX_CHAT_TEXT);
    if (text.trim().length === 0) throw new WireValidationError("MESSAGE_TEXT", "payload.text");
    return { text };
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

function validateSkillResult(input: unknown): ISkillResultRes {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, ["casterId", "skillId", "damage"], ["targetId"], "payload");
    const targetId = optionalMessageString(value, "targetId", "payload", MAX_MESSAGE_ID);
    const result = {
        casterId: boundedString(value.casterId, "payload.casterId", 1, MAX_MESSAGE_ID),
        skillId: finiteInteger(value.skillId, "payload.skillId", 0, 0xffff),
        damage: finiteNumber(value.damage, "payload.damage", 0, Number.MAX_SAFE_INTEGER),
    };
    return targetId === undefined ? result : { ...result, targetId };
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

/** C2S runtime validators. Values are copied so callers cannot mutate a validated payload. */
const guardMessageValidator = <T>(validator: RuntimeValidator<T>): RuntimeValidator<T> =>
    (input: unknown) => guardWire("payload", () => validator(input));

export const C2S_RUNTIME_VALIDATORS: { [K in C2SType]: RuntimeValidator<C2SPayloadMap[K]> } = {
    [C2S.Ping]: guardMessageValidator(validatePing),
    [C2S.Move]: guardMessageValidator(validateMove),
    [C2S.CastSkill]: guardMessageValidator(validateCastSkill),
    [C2S.Chat]: guardMessageValidator(validateChat),
};

/** S2C runtime validators. Client state/message adapters must validate before dispatching callbacks. */
export const S2C_RUNTIME_VALIDATORS: { [K in S2CType]: RuntimeValidator<S2CPayloadMap[K]> } = {
    [S2C.Pong]: guardMessageValidator(validatePong),
    [S2C.Welcome]: guardMessageValidator(validateWelcome),
    [S2C.SkillResult]: guardMessageValidator(validateSkillResult),
    [S2C.Chat]: guardMessageValidator(validateChatResult),
    [S2C.Error]: guardMessageValidator(validateError),
};

export function validateC2SPayload<T extends C2SType>(type: T, input: unknown): C2SPayload<T> {
    return guardWire("payload", () => {
        const validator = C2S_RUNTIME_VALIDATORS[type] as RuntimeValidator<C2SPayload<T>> | undefined;
        if (!validator) throw new WireValidationError("MESSAGE_TYPE", "type");
        return validator(input);
    });
}

export function validateS2CPayload<T extends S2CType>(type: T, input: unknown): S2CPayload<T> {
    return guardWire("payload", () => {
        const validator = S2C_RUNTIME_VALIDATORS[type] as RuntimeValidator<S2CPayload<T>> | undefined;
        if (!validator) throw new WireValidationError("MESSAGE_TYPE", "type");
        return validator(input);
    });
}

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

export interface IMoveReq {
    /** 归一化方向向量 x ∈ [-1, 1] */
    dirX: number;
    /** 归一化方向向量 y ∈ [-1, 1] */
    dirY: number;
}

export interface ICastSkillReq {
    skillId: number;
    /** 目标玩家 sessionId，可选 */
    targetId?: string;
}

export interface IChatReq {
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

export interface ISkillResultRes {
    casterId: string;
    skillId: number;
    targetId?: string;
    damage: number;
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
