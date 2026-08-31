import { assertExactKeys, isPlainRecord, type PlainRecord, WireValidationError } from "../../protocol/http";
import { GamePhase } from "../../constants/game";
import { defineC2S } from "../defineGameplayWire";

/**
 * idle 玩法自己的 wire 契约（Non-intrusive §4.5）。
 *
 * payload 接口与 validator **逐字迁移**自中央 `protocol/messages.ts`（validateIdlePulse），
 * 校验语义与错误行为零漂移；私有积木随文件重发。
 */

/** Idle 每次 pulse 只表达一次动作，不接受客户端参数。 */
export interface IIdlePulseReq {
    readonly [key: string]: never;
}

function messageRecord(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function validateIdlePulse(input: unknown): IIdlePulseReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, [], [], "payload");
    return {};
}

/** idle 玩法积分类输入 */
export const IdlePulse = defineC2S("c2s.idle.pulse", validateIdlePulse, {
    phases: [GamePhase.Playing],
    rateCost: 1,
});
