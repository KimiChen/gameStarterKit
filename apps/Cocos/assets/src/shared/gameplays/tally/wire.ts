import { assertExactKeys, isPlainRecord, type PlainRecord, WireValidationError } from "../../protocol/http";
import { GamePhase } from "../../constants/game";
import { defineC2S } from "../defineGameplayWire";

/**
 * tally 玩法的 wire 契约（plugins/tally；gameplay 形态插件的实证样本）。
 * 只有一条输入：tap——不带参数，服务端每次 +1，先到 tapGoal 者胜。
 */

/** 一次点击不携带任何参数。 */
export interface ITallyTapReq {
    readonly [key: string]: never;
}

function messageRecord(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function validateTallyTap(input: unknown): ITallyTapReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, [], [], "payload");
    return {};
}

/** tally 玩法计数输入 */
export const TallyTap = defineC2S("c2s.tally.tap", validateTallyTap, {
    phases: [GamePhase.Playing],
    rateCost: 1,
});
