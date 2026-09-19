/** worldFixture wire owner 的向量 sidecar（MMO MF4 世界夹具：move 意图；MF5b：resync；MF8：portal 交接）。 */
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
    [C2S.WorldFixtureResync]: [
      { label: "empty object", value: {}, accepted: true },
      { label: "extra key", value: { afterSeq: 1 }, accepted: false },
      { label: "array", value: [], accepted: false },
    ],
    // MF8：传送门——toMap 必填（id 形状）、toLine 可选 0..65535；⛔ 不带 ticket / persona（凭据由框架签发）
    [C2S.WorldFixturePortal]: [
      { label: "map only", value: { toMap: "m2" }, accepted: true },
      { label: "map + line", value: { toMap: "m2", toLine: 3 }, accepted: true },
      { label: "line max", value: { toMap: "m2", toLine: 65535 }, accepted: true },
      { label: "empty map", value: { toMap: "" }, accepted: false },
      { label: "map bad shape", value: { toMap: "m 2" }, accepted: false },
      { label: "line negative", value: { toMap: "m2", toLine: -1 }, accepted: false },
      { label: "line overflow", value: { toMap: "m2", toLine: 65536 }, accepted: false },
      { label: "line fraction", value: { toMap: "m2", toLine: 1.5 }, accepted: false },
      { label: "extra key ticket", value: { toMap: "m2", ticket: "x".repeat(32) }, accepted: false },
      { label: "symbol key", value: symbolExtra({ toMap: "m2" }), accepted: false },
    ],
  },
  admission: {
    [C2S.WorldFixtureMove]: { dirX: 1, dirY: 0, seq: 1 },
    [C2S.WorldFixtureResync]: {},
    [C2S.WorldFixturePortal]: { toMap: "m2" },
  },
} satisfies WireVectorFile;
