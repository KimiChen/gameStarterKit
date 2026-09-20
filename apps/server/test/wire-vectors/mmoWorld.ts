/** mmoWorld wire owner 的向量 sidecar（mmo kit 自带；docs/MMO.md §7.4：八个 C2S token 的接受 / 拒绝样本 + 准入载荷）。 */
import { C2S } from "@game/shared";
import { symbolExtra, type WireVectorFile } from "./vectorTypes";

export default {
  c2s: {
    [C2S.MmoWorldMove]: [
      { label: "dir idle", value: { seq: 0, dir: { x: 0, y: 0 } }, accepted: true },
      { label: "dir diagonal（非整数分量）", value: { seq: 7, dir: { x: 0.7071, y: -0.7071 } }, accepted: true },
      { label: "target", value: { seq: 8, target: { x: 120.5, y: 40 } }, accepted: true },
      { label: "dir out of range", value: { seq: 1, dir: { x: 2, y: 0 } }, accepted: false },
      { label: "dir + target 同时", value: { seq: 1, dir: { x: 0, y: 0 }, target: { x: 1, y: 1 } }, accepted: false },
      { label: "target negative", value: { seq: 1, target: { x: -1, y: 0 } }, accepted: false },
      { label: "negative seq", value: { seq: -1, dir: { x: 0, y: 0 } }, accepted: false },
      { label: "missing seq", value: { dir: { x: 0, y: 0 } }, accepted: false },
      { label: "extra key（坐标 ⛔ 客户端上报）", value: { seq: 1, dir: { x: 0, y: 0 }, x: 10 }, accepted: false },
      { label: "symbol key", value: symbolExtra({ seq: 1, dir: { x: 0, y: 0 } }), accepted: false },
      { label: "null", value: null, accepted: false },
    ],
    [C2S.MmoWorldTarget]: [
      { label: "entity", value: { entityId: "creature:1" }, accepted: true },
      { label: "clear", value: { entityId: null }, accepted: true },
      { label: "bad id", value: { entityId: "bad id" }, accepted: false },
      { label: "missing", value: {}, accepted: false },
      { label: "extra key", value: { entityId: null, x: 1 }, accepted: false },
    ],
    [C2S.MmoWorldCast]: [
      { label: "self cast", value: { seq: 1, spellId: "strike" }, accepted: true },
      { label: "with target", value: { seq: 2, spellId: "strike", targetId: "creature:1" }, accepted: true },
      { label: "bad spell", value: { seq: 1, spellId: "" }, accepted: false },
      { label: "bad target", value: { seq: 1, spellId: "strike", targetId: "" }, accepted: false },
      { label: "extra key", value: { seq: 1, spellId: "strike", power: 9 }, accepted: false },
    ],
    [C2S.MmoWorldInteract]: [
      { label: "entity", value: { entityId: "npc:1" }, accepted: true },
      { label: "with interact", value: { entityId: "npc:1", interactId: "talk" }, accepted: true },
      { label: "missing entity", value: { interactId: "talk" }, accepted: false },
      { label: "array", value: [], accepted: false },
    ],
    [C2S.MmoWorldChoose]: [
      { label: "choice", value: { promptId: "p1", choiceId: "yes" }, accepted: true },
      { label: "missing choice", value: { promptId: "p1" }, accepted: false },
      { label: "bad prompt", value: { promptId: "p 1", choiceId: "yes" }, accepted: false },
    ],
    [C2S.MmoWorldPickup]: [
      { label: "loot", value: { lootId: "loot:1", clientReqId: "c1" }, accepted: true },
      { label: "missing clientReqId", value: { lootId: "loot:1" }, accepted: false },
      { label: "extra key", value: { lootId: "loot:1", clientReqId: "c1", count: 2 }, accepted: false },
    ],
    [C2S.MmoWorldTransfer]: [
      { label: "portal", value: { portalId: "gate-east", clientReqId: "c2" }, accepted: true },
      { label: "empty portal", value: { portalId: "", clientReqId: "c2" }, accepted: false },
      { label: "extra key ticket（凭据由框架签发）", value: { portalId: "gate-east", clientReqId: "c2", ticket: "x".repeat(32) }, accepted: false },
      { label: "symbol key", value: symbolExtra({ portalId: "gate-east", clientReqId: "c2" }), accepted: false },
    ],
    [C2S.MmoWorldBaselineRequest]: [
      { label: "from start", value: { authorityEpoch: 1, afterSeq: 0 }, accepted: true },
      { label: "after seq", value: { authorityEpoch: 3, afterSeq: 120 }, accepted: true },
      { label: "epoch zero", value: { authorityEpoch: 0, afterSeq: 0 }, accepted: false },
      { label: "fraction seq", value: { authorityEpoch: 1, afterSeq: 1.5 }, accepted: false },
      { label: "roomEpochId（⛔ GameRoom 身份）", value: { authorityEpoch: 1, afterSeq: 0, roomEpochId: "r1" }, accepted: false },
    ],
  },
  admission: {
    [C2S.MmoWorldMove]: { seq: 1, dir: { x: 1, y: 0 } },
    [C2S.MmoWorldTarget]: { entityId: null },
    [C2S.MmoWorldCast]: { seq: 1, spellId: "strike" },
    [C2S.MmoWorldInteract]: { entityId: "npc:1" },
    [C2S.MmoWorldChoose]: { promptId: "p1", choiceId: "yes" },
    [C2S.MmoWorldPickup]: { lootId: "loot:1", clientReqId: "c1" },
    [C2S.MmoWorldTransfer]: { portalId: "gate-east", clientReqId: "c2" },
    [C2S.MmoWorldBaselineRequest]: { authorityEpoch: 1, afterSeq: 0 },
  },
} satisfies WireVectorFile;
