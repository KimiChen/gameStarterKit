/**
 * 战斗公式示例 —— 双端共享的纯逻辑。
 * 服务端结算与客户端表现预测使用同一份公式，保证数值一致。
 */
import { clamp } from "./math";

export interface ISkillDef {
    id: number;
    name: string;
    /** 基础伤害 */
    baseDamage: number;
    /** 冷却（ms） */
    cooldownMs: number;
}

/** 演示用技能表（真实项目应改为配置表驱动） */
export const SKILL_TABLE: readonly ISkillDef[] = [
    { id: 1, name: "普攻", baseDamage: 10, cooldownMs: 500 },
    { id: 2, name: "重击", baseDamage: 25, cooldownMs: 2000 },
    { id: 3, name: "旋风斩", baseDamage: 40, cooldownMs: 5000 },
] as const;

export function getSkillDef(skillId: number): ISkillDef | undefined {
    return SKILL_TABLE.find((s) => s.id === skillId);
}

/**
 * 伤害计算：基础伤害 × 等级成长 × 随机浮动(0.9 ~ 1.1)。
 * @param roll 随机浮动因子，取值 [0, 1)，由调用方的 SeededRandom 提供，保证双端一致
 */
export function calcDamage(skill: ISkillDef, attackerLevel: number, roll: number): number {
    const levelFactor = 1 + (attackerLevel - 1) * 0.1;
    const fluctuation = 0.9 + clamp(roll, 0, 1) * 0.2;
    return Math.round(skill.baseDamage * levelFactor * fluctuation);
}
