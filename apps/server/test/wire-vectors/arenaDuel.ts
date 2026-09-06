/** arenaDuel wire owner 的向量 sidecar（kits/arena 自带；随 codegen:gameplays 汇入 wire-vectors/index.generated.ts）。 */
import { C2S } from "@game/shared";
import { symbolExtra, type WireVectorFile } from "./vectorTypes";

export default {
  c2s: {
    [C2S.ArenaDuelStrike]: [
      { label: "empty object", value: {}, accepted: true },
      { label: "null prototype", value: Object.create(null), accepted: true },
      { label: "extra key", value: { target: "x" }, accepted: false },
      { label: "symbol key", value: symbolExtra({}), accepted: false },
      { label: "array", value: [], accepted: false },
      { label: "null", value: null, accepted: false },
    ],
  },
  admission: {
    [C2S.ArenaDuelStrike]: {},
  },
} satisfies WireVectorFile;
