/** Versioned demo rules. Persist this version with timed batches and Boss runs. */
export const GAME_DEMO_CONFIG = {
    version: 5,
    initialGold: 5000,
    initialPills: { pill: 100, finePill: 100 },
    welcomeMailGold: 100,
    heroMaxLevel: 100,
    heroBaseAttack: 10,
    heroAttackPerLevel: 5,
    heroExpPerLevel: 20,
    itemIds: { herb: 900001, dew: 900002, pill: 900003, finePill: 900004 },
    shop: [
        { id: "herb", itemId: 900001, name: "灵草", price: 10, dailyLimit: 100 },
        { id: "dew", itemId: 900002, name: "灵露", price: 20, dailyLimit: 50 },
    ],
    alchemy: { herbPerBatch: 2, dewPerBatch: 1, animationMs: 2000, maxBatch: 10, fineChancePercent: 25 },
    pillExp: { normal: 10, fine: 30 },
    pillScore: { normal: 1, fine: 3 },
    seasonDurationMs: 600000,
    seasonGoldRewards: [1000, 500, 200],
    guildCapacity: 3,
    bossMaxParticipants: 100,
    bossCooldownMs: 1000,
    bossPlayerHp: 150,
    bossCounterMs: 3000,
    bossCounterDamage: 55,
    bossReviveMs: 5000,
    bossEventLimit: 64,
    bossRespawnMs: 60000,
    bosses: [
        { id: "tiger", name: "山君", maxHp: 2000, goldReward: 100 },
        { id: "dragon", name: "蛟龙", maxHp: 4000, goldReward: 200 },
        { id: "phoenix", name: "炎凰", maxHp: 6000, goldReward: 300 },
    ],
} as const;

export function gameDemoAttack(level: number): number {
    return GAME_DEMO_CONFIG.heroBaseAttack + (level - 1) * GAME_DEMO_CONFIG.heroAttackPerLevel;
}

/** Business date is UTC+8, independent of the process timezone. */
export function gameDemoBusinessDate(nowMs: number): string {
    return new Date(nowMs + 8 * 3600000).toISOString().slice(0, 10);
}

/** Every damaging participant receives a rank-based mail attachment. */
export function gameDemoBossGoldReward(baseGold: number, rank: number): number {
    return Math.max(1, Math.floor(baseGold / rank));
}
