/**
 * 剧本 snake-baseline（docs/MMO.md MF1-B1「先对 snake 房出当前基线」）：N 个机器人经真实 SDK 加入 snake dropIn 房
 * （每房 8 真人 + AI 补到 17 蛇），固定周期按种子随机方向发 `c2s.snake.input`，复活一律接受以维持负载；
 * 记录每机器人收到的 delta / baseline 字节（JSON 长度作代理）与首次 baseline 体积。
 * 服务端侧的 tick 耗时与每会话真实出站字节由 run.ts 统一采样。
 */
import type { Room as SDKRoom } from "@colyseus/sdk";
import {
  C2S,
  GAME_ROOM_PROTOCOL_VERSION,
  GAMEPLAY_CATALOG,
  S2C,
  type IGameRoomJoinOptions,
  type ISnakeBaselineChunk,
  type ISnakeBaselineEnd,
  type ISnakeReliveOffered,
} from "@game/shared";
import { gameModeRegistry } from "../../../src/rooms/GameMode";
import { createSnakeGameMode } from "../../../src/rooms/modes/snake/index";
import type { BotStats, Rng, Scenario } from "../scenario";

const MODE_ID = "snake";
const INPUT_INTERVAL_MS = 150;

export const snakeBaseline: Scenario = {
  id: "snake-baseline",
  description: "snake dropIn 房：真人机器人 + AI 补位，随机方向输入，复活即接受",
  register() {
    return gameModeRegistry.register(MODE_ID, () => createSnakeGameMode());
  },
  joinOptions(sId: number): IGameRoomJoinOptions {
    return { v: GAME_ROOM_PROTOCOL_VERSION, sId, mode: MODE_ID, modeVersion: GAMEPLAY_CATALOG.snake.modeVersion, profile: "dropIn" };
  },
  attach(room: SDKRoom, stats: BotStats, rng: Rng): () => void {
    let seq = 0;
    let firstBaselineBytes = 0;
    let firstBaselineDone = false;
    let currentBaselineId: string | null = null;
    room.onMessage(S2C.SnakeBaselineBegin, (value: unknown) => {
      const begin = value as { baselineId: string };
      if (!firstBaselineDone) { currentBaselineId = begin.baselineId; firstBaselineBytes = 0; }
      stats.baselineBegins += 1;
    });
    room.onMessage(S2C.SnakeBaselineChunk, (value: unknown) => {
      const chunk = value as ISnakeBaselineChunk;
      const bytes = JSON.stringify(chunk).length;
      stats.baselineBytes += bytes;
      if (!firstBaselineDone && chunk.baselineId === currentBaselineId) firstBaselineBytes += bytes;
    });
    room.onMessage(S2C.SnakeBaselineEnd, (value: unknown) => {
      const end = value as ISnakeBaselineEnd;
      if (!firstBaselineDone && end.baselineId === currentBaselineId) {
        firstBaselineDone = true;
        stats.firstBaselineBytes = firstBaselineBytes;
        stats.firstBaselineAtMs = Date.now();
      }
    });
    room.onMessage(S2C.SnakeDelta, (value: unknown) => {
      stats.deltaMessages += 1;
      stats.deltaBytes += JSON.stringify(value).length;
    });
    room.onMessage(S2C.SnakeReliveOffered, (value: unknown) => {
      const offer = value as ISnakeReliveOffered;
      stats.relives += 1;
      room.send(C2S.SnakeReliveDecision, { runId: offer.runId, deathSeq: offer.deathSeq, clientReqId: `bench-${offer.runId}-${offer.deathSeq}`, decision: "accept" });
    });
    room.onMessage(S2C.SnakeRunResult, () => { stats.runResults += 1; });
    // 其余 S2C（reliveDecisionResult / reliveResolved / runFinalizing）只需吞掉，避免 SDK 对未订阅消息告警。
    for (const type of [S2C.SnakeReliveDecisionResult, S2C.SnakeReliveResolved, S2C.SnakeRunFinalizing]) room.onMessage(type, () => undefined);
    room.onMessage("*", () => undefined); // welcome 等 core 消息：只吞掉，字节已在服务端 raw 接缝计入
    const timer = setInterval(() => {
      if (!room.connection?.isOpen) return;
      const angle = rng() * Math.PI * 2;
      seq += 1;
      room.send(C2S.SnakeInput, { dirX: Math.cos(angle), dirY: Math.sin(angle), boost: rng() < 0.1, seq });
      stats.inputsSent += 1;
    }, INPUT_INTERVAL_MS);
    return () => clearInterval(timer);
  },
};
