import { assertExactKeys, isPlainRecord, type PlainRecord, WireValidationError } from "../../protocol/http";
import { GamePhase } from "../../constants/game";
import { defineC2S } from "../defineGameplayWire";

/**
 * arenaDuel 玩法的 wire 契约（kits/arena 的决斗 mode）。
 * 只有一条输入：strike——不带参数，服务端每次 hits +1，先让 hits ≥ hp 者胜。
 */

/** 一次出击不携带任何参数。 */
export interface IArenaDuelStrikeReq {
    readonly [key: string]: never;
}

function messageRecord(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function validateArenaDuelStrike(input: unknown): IArenaDuelStrikeReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, [], [], "payload");
    return {};
}

/** arenaDuel 玩法出击输入 */
export const ArenaDuelStrike = defineC2S("c2s.arenaDuel.strike", validateArenaDuelStrike, {
    phases: [GamePhase.Playing],
    rateCost: 1,
});
