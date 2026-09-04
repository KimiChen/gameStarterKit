/** snake wire owner 的向量 sidecar（逐字迁自 game-room-wire-contract.test.ts 与 game-mode.test.ts）。 */
import { C2S } from "@game/shared";
import { symbolExtra, type WireVectorFile } from "./vectorTypes";

export default {
  c2s: {
    // SnakeInput（03 §4.1）：方向 [-1,1] 连续值 + boost 布尔 + seq 严格递增整数。
    [C2S.SnakeInput]: [
      { label: "zero vector", value: { dirX: 0, dirY: 0, boost: false, seq: 0 }, accepted: true },
      { label: "fraction direction", value: { dirX: 0.5, dirY: -0.5, boost: true, seq: 1 }, accepted: true },
      { label: "both bounds", value: { dirX: -1, dirY: 1, boost: false, seq: 2 }, accepted: true },
      { label: "dir below", value: { dirX: -1.01, dirY: 0, boost: false, seq: 0 }, accepted: false },
      { label: "dir above", value: { dirX: 0, dirY: 1.01, boost: false, seq: 0 }, accepted: false },
      { label: "dir nan", value: { dirX: Number.NaN, dirY: 0, boost: false, seq: 0 }, accepted: false },
      { label: "dir infinity", value: { dirX: 0, dirY: Number.POSITIVE_INFINITY, boost: false, seq: 0 }, accepted: false },
      { label: "boost wrong type", value: { dirX: 0, dirY: 0, boost: 1, seq: 0 }, accepted: false },
      { label: "seq negative", value: { dirX: 0, dirY: 0, boost: false, seq: -1 }, accepted: false },
      { label: "seq fraction", value: { dirX: 0, dirY: 0, boost: false, seq: 1.5 }, accepted: false },
      { label: "missing seq", value: { dirX: 0, dirY: 0, boost: false }, accepted: false },
      { label: "extra key", value: { dirX: 0, dirY: 0, boost: false, seq: 0, tick: 1 }, accepted: false },
      { label: "symbol key", value: symbolExtra({ dirX: 0, dirY: 0, boost: false, seq: 0 }), accepted: false },
    ],
    [C2S.SnakeReliveDecision]: [
      { label: "accept", value: { runId: "run-1", deathSeq: 1, clientReqId: "req-1", decision: "accept" }, accepted: true },
      { label: "decline", value: { runId: "run-1", deathSeq: 2, clientReqId: "req-2", decision: "decline" }, accepted: true },
      { label: "zero death", value: { runId: "run-1", deathSeq: 0, clientReqId: "req-1", decision: "accept" }, accepted: false },
      { label: "unknown decision", value: { runId: "run-1", deathSeq: 1, clientReqId: "req-1", decision: "later" }, accepted: false },
      { label: "extra key", value: { runId: "run-1", deathSeq: 1, clientReqId: "req-1", decision: "accept", coinCost: 1 }, accepted: false },
    ],
    [C2S.SnakeEndRun]: [
      { label: "valid", value: { runId: "run-1", clientReqId: "req-1" }, accepted: true },
      { label: "empty run", value: { runId: "", clientReqId: "req-1" }, accepted: false },
      { label: "missing request", value: { runId: "run-1" }, accepted: false },
      { label: "extra key", value: { runId: "run-1", clientReqId: "req-1", force: true }, accepted: false },
    ],
    [C2S.SnakeBaselineRequest]: [
      { label: "initial", value: { roomEpochId: "epoch-1", afterSeq: 0 }, accepted: true },
      { label: "resume", value: { roomEpochId: "epoch-1", afterSeq: 7 }, accepted: true },
      { label: "negative seq", value: { roomEpochId: "epoch-1", afterSeq: -1 }, accepted: false },
      { label: "empty epoch", value: { roomEpochId: "", afterSeq: 0 }, accepted: false },
      { label: "extra key", value: { roomEpochId: "epoch-1", afterSeq: 0, baselineId: "x" }, accepted: false },
    ],
  },
  admission: {
    [C2S.SnakeInput]: { dirX: 1, dirY: 0, boost: false, seq: 1 },
    [C2S.SnakeReliveDecision]: {
      runId: "matrix-run",
      deathSeq: 1,
      clientReqId: "matrix-relive",
      decision: "decline",
    },
    [C2S.SnakeEndRun]: { runId: "matrix-run", clientReqId: "matrix-end" },
    [C2S.SnakeBaselineRequest]: { roomEpochId: "matrix-epoch", afterSeq: 0 },
  },
} satisfies WireVectorFile;
