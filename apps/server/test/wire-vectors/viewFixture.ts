/** viewFixture wire owner 的向量 sidecar（MMO MF5a-B5 观察者同步夹具：look / resync）。 */
import { C2S } from "@game/shared";
import { symbolExtra, type WireVectorFile } from "./vectorTypes";

export default {
  c2s: {
    [C2S.ViewFixtureLook]: [
      { label: "origin", value: { x: 0, y: 0 }, accepted: true },
      { label: "far corner", value: { x: 1000, y: 1000 }, accepted: true },
      { label: "negative", value: { x: -1, y: 0 }, accepted: false },
      { label: "out of map", value: { x: 0, y: 1001 }, accepted: false },
      { label: "fraction", value: { x: 0.5, y: 0 }, accepted: false },
      { label: "missing y", value: { x: 0 }, accepted: false },
      { label: "extra key", value: { x: 0, y: 0, z: 0 }, accepted: false },
      { label: "symbol key", value: symbolExtra({ x: 0, y: 0 }), accepted: false },
      { label: "null", value: null, accepted: false },
    ],
    [C2S.ViewFixtureResync]: [
      { label: "empty object", value: {}, accepted: true },
      { label: "extra key", value: { afterSeq: 1 }, accepted: false },
      { label: "array", value: [], accepted: false },
    ],
  },
  admission: {
    [C2S.ViewFixtureLook]: { x: 1, y: 1 },
    [C2S.ViewFixtureResync]: {},
  },
} satisfies WireVectorFile;
