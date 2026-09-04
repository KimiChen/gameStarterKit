/** core wire owner 的向量 sidecar（Ping/Chat/RoomReady/RoomStart；逐字迁自 game-room-wire-contract.test.ts）。 */
import { C2S } from "@game/shared";
import { symbolExtra, type WireVectorFile } from "./vectorTypes";

const pingClass = class {
  clientTime = 0;
};
const inheritedPing = Object.create({ clientTime: 0 }) as Record<string, unknown>;
const nonEnumerablePing: Record<string, unknown> = {};
Object.defineProperty(nonEnumerablePing, "clientTime", { value: 0, enumerable: false });

export default {
  c2s: {
    [C2S.Ping]: [
      { label: "zero", value: { clientTime: 0 }, accepted: true },
      { label: "safe integer max", value: { clientTime: Number.MAX_SAFE_INTEGER }, accepted: true },
      { label: "negative", value: { clientTime: -1 }, accepted: false },
      { label: "unsafe integer", value: { clientTime: Number.MAX_SAFE_INTEGER + 1 }, accepted: false },
      { label: "fraction", value: { clientTime: 1.5 }, accepted: false },
      { label: "nan", value: { clientTime: Number.NaN }, accepted: false },
      { label: "infinity", value: { clientTime: Number.POSITIVE_INFINITY }, accepted: false },
      { label: "wrong type", value: { clientTime: "1" }, accepted: false },
      { label: "missing", value: {}, accepted: false },
      { label: "extra key", value: { clientTime: 0, extra: true }, accepted: false },
      { label: "symbol key", value: symbolExtra({ clientTime: 0 }), accepted: false },
      { label: "class instance", value: new pingClass(), accepted: false },
      { label: "inherited required key", value: inheritedPing, accepted: false },
      { label: "known non-enumerable key", value: nonEnumerablePing, accepted: true },
      { label: "null prototype", value: Object.assign(Object.create(null), { clientTime: 0 }), accepted: true },
    ],
    [C2S.Chat]: [
      { label: "one character", value: { text: "x" }, accepted: true },
      { label: "max length", value: { text: "x".repeat(100) }, accepted: true },
      { label: "trimmed content", value: { text: " x " }, accepted: true },
      { label: "empty", value: { text: "" }, accepted: false },
      { label: "only spaces", value: { text: " ".repeat(100) }, accepted: false },
      { label: "only control whitespace", value: { text: " \t\n" }, accepted: false },
      { label: "overlong", value: { text: "x".repeat(101) }, accepted: false },
      { label: "wrong type", value: { text: 1 }, accepted: false },
      { label: "extra key", value: { text: "x", channel: "global" }, accepted: false },
      { label: "symbol key", value: symbolExtra({ text: "x" }), accepted: false },
    ],
    // §10.1：Ready/Start payload 均 exact（去掉任一 exact-keys 断言 → 本矩阵转红）。
    [C2S.RoomReady]: [
      { label: "ready true", value: { ready: true }, accepted: true },
      { label: "ready false", value: { ready: false }, accepted: true },
      { label: "missing", value: {}, accepted: false },
      { label: "wrong type", value: { ready: 1 }, accepted: false },
      { label: "stringly bool", value: { ready: "true" }, accepted: false },
      { label: "extra key", value: { ready: true, seat: 1 }, accepted: false },
      { label: "symbol key", value: symbolExtra({ ready: true }), accepted: false },
      { label: "null", value: null, accepted: false },
    ],
    [C2S.RoomStart]: [
      { label: "empty object", value: {}, accepted: true },
      { label: "null prototype", value: Object.create(null), accepted: true },
      { label: "extra key", value: { force: true }, accepted: false },
      { label: "symbol key", value: symbolExtra({}), accepted: false },
      { label: "array", value: [], accepted: false },
      { label: "null", value: null, accepted: false },
    ],
  },
} satisfies WireVectorFile;
