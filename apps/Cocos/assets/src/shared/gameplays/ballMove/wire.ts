import {
    assertExactKeys,
    boundedString,
    finiteInteger,
    finiteNumber,
    isPlainRecord,
    type PlainRecord,
    WireValidationError,
} from "../../protocol/http";
import { GamePhase } from "../../constants/game";
import { defineC2S, defineS2C } from "../defineGameplayWire";

/**
 * ballMove 玩法自己的 wire 契约（Non-intrusive §4.5）。
 *
 * payload 接口与 validator **逐字迁移**自中央 `protocol/messages.ts`（阶段 2b 拆分前的
 * validateMove/validateCastSkill/validateSkillResult），校验语义与错误行为零漂移；
 * 私有积木（messageRecord/optionalMessageString/MAX_MESSAGE_ID）随文件重发。
 * 新增本玩法消息只改本文件，再跑 `npm --workspace @game/server run codegen:gameplays`。
 */

const MAX_MESSAGE_ID = 64;

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

export interface ISkillResultRes {
    casterId: string;
    skillId: number;
    targetId?: string;
    damage: number;
}

function messageRecord(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function optionalMessageString(value: PlainRecord, key: string, path: string, max: number): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined) return undefined;
    return boundedString(value[key], `${path}.${key}`, 1, max);
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

/** 玩家移动输入 */
export const Move = defineC2S("c2s.move", validateMove, {
    phases: [GamePhase.Playing],
    rateCost: 1,
});

/** 释放技能 */
export const CastSkill = defineC2S("c2s.castSkill", validateCastSkill, {
    phases: [GamePhase.Playing],
    rateCost: 1,
});

/** 技能释放结果广播 */
export const SkillResult = defineS2C("s2c.skillResult", validateSkillResult);
