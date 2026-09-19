/** worldFixture wire owner 的向量 sidecar（MMO MF4 世界夹具：move 意图）。 */
import { C2S } from "@game/shared";
import { symbolExtra, type WireVectorFile } from "./vectorTypes";

export default {
  c2s: {
    [C2S.WorldFixtureMove]: [
      { label: "idle", value: { dirX: 0, dirY: 0, seq: 0 }, accepted: true },
      { label: "diagonal", value: { dirX: 1, dirY: -1, seq: 7 }, accepted: true },
      { label: "dir out of range", value: { dirX: 2, dirY: 0, seq: 1 }, accepted: false },
      { label: "fraction dir", value: { dirX: 0.5, dirY: 0, seq: 1 }, accepted: false },
      { label: "negative seq", value: { dirX: 0, dirY: 0, seq: -1 }, accepted: false },
      { label: "missing seq", value: { dirX: 0, dirY: 0 }, accepted: false },
      { label: "extra key（坐标 ⛔ 客户端上报）", value: { dirX: 0, dirY: 0, seq: 1, x: 10 }, accepted: false },
      { label: "symbol key", value: symbolExtra({ dirX: 0, dirY: 0, seq: 1 }), accepted: false },
      { label: "null", value: null, accepted: false },
    ],
  },
  admission: {
    [C2S.WorldFixtureMove]: { dirX: 1, dirY: 0, seq: 1 },
  },
} satisfies WireVectorFile;
