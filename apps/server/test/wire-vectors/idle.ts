/** idle wire owner 的向量 sidecar（逐字迁自 game-room-wire-contract.test.ts 与 game-mode.test.ts）。 */
import { C2S } from "@game/shared";
import { symbolExtra, type WireVectorFile } from "./vectorTypes";

export default {
  c2s: {
    [C2S.IdlePulse]: [
      { label: "empty object", value: {}, accepted: true },
      { label: "null prototype", value: Object.create(null), accepted: true },
      { label: "extra key", value: { count: 1 }, accepted: false },
      { label: "symbol key", value: symbolExtra({}), accepted: false },
      { label: "array", value: [], accepted: false },
      { label: "null", value: null, accepted: false },
    ],
  },
  admission: {
    [C2S.IdlePulse]: {},
  },
} satisfies WireVectorFile;
