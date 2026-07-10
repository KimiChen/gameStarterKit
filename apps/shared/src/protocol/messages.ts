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
    code: number;
    message: string;
}
