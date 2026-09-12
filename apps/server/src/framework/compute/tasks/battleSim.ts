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

/**
 * 任务级 admission 边界。
 *
 * compute pool 的 structured clone 只保证「能传进 worker」，不能保证任务能在
 * 有界时间内完成；这里把循环次数和公式输入都收口，避免 NaN 绕过循环、Infinity
 * 制造不可终止的工作，或极端等级把结果推成非有限数。
 */
export const BATTLE_SIM_MAX_ITERATIONS = 1_000_000;
export const BATTLE_SIM_MIN_ATTACKER_LEVEL = 1;
export const BATTLE_SIM_MAX_ATTACKER_LEVEL = 100;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readSafeInteger(
  value: unknown,
  field: "iterations" | "attackerLevel",
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`battleSim.${field} must be a finite safe integer`);
  }
  if (value < min || value > max) {
    throw new RangeError(`battleSim.${field} must be in range ${min}..${max}`);
  }
  return value;
}

/** Validate and copy untrusted worker input before it reaches the simulation loop. */
export function validateBattleSimInput(input: unknown): IBattleSimInput {
  if (!isPlainRecord(input)) {
    throw new TypeError("battleSim input must be a plain object");
  }
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("iterations") || !keys.includes("attackerLevel")) {
    throw new TypeError("battleSim input must contain exactly iterations and attackerLevel");
  }
  return {
    iterations: readSafeInteger(
      input.iterations,
      "iterations",
      0,
      BATTLE_SIM_MAX_ITERATIONS,
    ),
    attackerLevel: readSafeInteger(
      input.attackerLevel,
      "attackerLevel",
      BATTLE_SIM_MIN_ATTACKER_LEVEL,
      BATTLE_SIM_MAX_ATTACKER_LEVEL,
    ),
  };
}

export default function battleSim(input: IBattleSimInput): IBattleSimResult {
  const valid = validateBattleSimInput(input);
  const iters = valid.iterations;
  let total = 0;
  for (let i = 0; i < iters; i++) {
    const skill = SKILL_TABLE[i % SKILL_TABLE.length];
    const damage = calcDamage(skill, valid.attackerLevel, (i % 100) / 100);
    if (!Number.isFinite(damage)) {
      throw new RangeError("battleSim damage result is not finite");
    }
    total += damage;
  }
  if (!Number.isFinite(total)) {
    throw new RangeError("battleSim totalDamage is not finite");
  }
  return { iterations: iters, totalDamage: total };
}
