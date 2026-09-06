import { assertExactKeys, isPlainRecord, type PlainRecord, WireValidationError } from "../../protocol/http";
import { GamePhase } from "../../constants/game";
import { defineC2S } from "../defineGameplayWire";

/**
 * arenaCapture 玩法的 wire 契约（kits/arena 的占领赛 mode）。
 * 只有一条输入：capture——不带参数，服务端每次 +1，先到 captureGoal 者胜。
 */

/** 一次占领不携带任何参数。 */
export interface IArenaCaptureCaptureReq {
    readonly [key: string]: never;
}

function messageRecord(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("MESSAGE_OBJECT", path);
    return input;
}

function validateArenaCaptureCapture(input: unknown): IArenaCaptureCaptureReq {
    const value = messageRecord(input, "payload");
    assertExactKeys(value, [], [], "payload");
    return {};
}

/** arenaCapture 玩法占领输入 */
export const ArenaCaptureCapture = defineC2S("c2s.arenaCapture.capture", validateArenaCaptureCapture, {
    phases: [GamePhase.Playing],
    rateCost: 1,
});
