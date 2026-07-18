/**
 * 演示任务：批量战斗伤害模拟（用 shared 共享公式，证明 worker 内可加载 shared/TS）。
 * 真实玩法的结算模拟照此模式：纯函数、确定性、⛔ 无 IO 无副作用（超时弃车安全的前提）。
 */
import { SKILL_TABLE, calcDamage } from "@game/shared";

export interface IBattleSimInput {
  iterations: number;
  attackerLevel: number;
}
export interface IBattleSimResult {
  iterations: number;
  totalDamage: number;
}

export default function battleSim(input: IBattleSimInput): IBattleSimResult {
  const iters = Math.max(0, Math.floor(input.iterations));
  let total = 0;
  for (let i = 0; i < iters; i++) {
    const skill = SKILL_TABLE[i % SKILL_TABLE.length];
    total += calcDamage(skill, input.attackerLevel, (i % 100) / 100);
  }
  return { iterations: iters, totalDamage: total };
}
