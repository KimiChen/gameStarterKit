/** ballMove wire owner 的向量 sidecar（逐字迁自 game-room-wire-contract.test.ts 与 game-mode.test.ts）。 */
import { C2S } from "@game/shared";
import { symbolExtra, type WireVectorFile } from "./vectorTypes";

export default {
  c2s: {
    [C2S.Move]: [
      { label: "both lower", value: { dirX: -1, dirY: -1 }, accepted: true },
      { label: "both upper", value: { dirX: 1, dirY: 1 }, accepted: true },
      { label: "fraction", value: { dirX: 0.25, dirY: -0.25 }, accepted: true },
      { label: "x below", value: { dirX: -1.01, dirY: 0 }, accepted: false },
      { label: "y above", value: { dirX: 0, dirY: 1.01 }, accepted: false },
      { label: "nan", value: { dirX: Number.NaN, dirY: 0 }, accepted: false },
      { label: "infinity", value: { dirX: Number.POSITIVE_INFINITY, dirY: 0 }, accepted: false },
      { label: "wrong type", value: { dirX: 0, dirY: "0" }, accepted: false },
      { label: "missing", value: { dirX: 0 }, accepted: false },
      { label: "extra key", value: { dirX: 0, dirY: 0, tick: 1 }, accepted: false },
      { label: "symbol key", value: symbolExtra({ dirX: 0, dirY: 0 }), accepted: false },
    ],
    [C2S.CastSkill]: [
      { label: "skill lower", value: { skillId: 0 }, accepted: true },
      { label: "skill upper", value: { skillId: 0xffff }, accepted: true },
      { label: "target lower", value: { skillId: 1, targetId: "a" }, accepted: true },
      { label: "target upper", value: { skillId: 1, targetId: "t".repeat(64) }, accepted: true },
      { label: "explicit undefined target", value: { skillId: 1, targetId: undefined }, accepted: true },
      { label: "skill negative", value: { skillId: -1 }, accepted: false },
      { label: "skill above", value: { skillId: 0x10000 }, accepted: false },
      { label: "skill fraction", value: { skillId: 1.5 }, accepted: false },
      { label: "skill nan", value: { skillId: Number.NaN }, accepted: false },
      { label: "target empty", value: { skillId: 1, targetId: "" }, accepted: false },
      { label: "target overlong", value: { skillId: 1, targetId: "t".repeat(65) }, accepted: false },
      { label: "target wrong type", value: { skillId: 1, targetId: 1 }, accepted: false },
      { label: "extra key", value: { skillId: 1, tick: 1 }, accepted: false },
      { label: "symbol key", value: symbolExtra({ skillId: 1 }), accepted: false },
    ],
  },
  admission: {
    [C2S.Move]: { dirX: 1, dirY: 0 },
    [C2S.CastSkill]: { skillId: 1 },
  },
} satisfies WireVectorFile;
