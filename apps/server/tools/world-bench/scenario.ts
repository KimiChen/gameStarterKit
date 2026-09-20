/** world-bench 剧本契约（docs/MMO-PLAN.md MF1-B1）：剧本只管「登记 mode / join 选项 / 机器人行为」，采样与落盘归 run.ts。 */
import type { Room as SDKRoom } from "@colyseus/sdk";
import type { IGameRoomJoinOptions, IWorldRoomJoinOptions } from "@game/shared";

export type Rng = () => number;

export interface BotStats {
  inputsSent: number;
  deltaMessages: number;
  deltaBytes: number;
  baselineBegins: number;
  baselineBytes: number;
  firstBaselineBytes: number;
  firstBaselineAtMs: number;
  relives: number;
  runResults: number;
}

export function emptyBotStats(): BotStats {
  return { inputsSent: 0, deltaMessages: 0, deltaBytes: 0, baselineBegins: 0, baselineBytes: 0, firstBaselineBytes: 0, firstBaselineAtMs: 0, relives: 0, runResults: 0 };
}

/** 世界形态剧本钩子（MMO MK0-B6）：RoomName.World；每机器人准入前的准备（建角 / world.enter 同形凭据）→ 并入 join 选项；跑完清理。 */
export interface WorldScenarioHooks {
  prepare(uid: string, sId: number, index: number): Promise<Record<string, unknown>>;
  cleanup(uid: string, sId: number): Promise<void>;
  /** 全部机器人清理后（分线行 / 租约键等）。 */
  cleanupAll?(sId: number): Promise<void>;
}

export interface Scenario {
  readonly id: string;
  readonly description: string;
  /** 把剧本用到的 mode 登进 registry；返回注销函数。 */
  register(): () => void;
  /** join 选项（世界形态剧本收到 `world.prepare` 的返回值并入）。 */
  joinOptions(sId: number, prepared?: Record<string, unknown>): IGameRoomJoinOptions | IWorldRoomJoinOptions;
  /** 世界形态剧本：有则房型 = RoomName.World（WorldRoom），采样接 WorldRoom.advance。 */
  readonly world?: WorldScenarioHooks;
  /** 房间就绪判据（缺省 phase === GamePhase.Playing；世界房 = WorldPhase.Active）。 */
  ready?(state: unknown): boolean;
  /** 给一个已 join 的 SDK room 挂机器人行为；返回停止函数。 */
  attach(room: SDKRoom, stats: BotStats, rng: Rng): () => void;
}

/** mulberry32：种子固定则机器人行为序列固定。 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
