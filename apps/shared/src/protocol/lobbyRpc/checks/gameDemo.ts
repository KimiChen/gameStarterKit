/**
 * gameDemo 玩法验证 kit 的公开数值与公式（双端单源）。
 *
 * 服务端 Action 用同一份常量做最终校验与结算；客户端只用于展示与预判，⛔ 不得让客户端上传价格、
 * 经验或伤害。改动数值会直接改变结算，调整时同步检查 serverNew `test/modules/gameDemo/`。
 */
import { WireValidationError } from "../../http";

export type GameDemoBossId = "tiger" | "dragon" | "phoenix";

export const GAME_DEMO_CONFIG = {
  /** 开发资源（GAME_DEMO_DEV_TOOLS=1）一次性发放：金币记入宿主 User.copper。 */
  initialGold: 5000,
  initialPills: { pill: 100, finePill: 100 },
  welcomeMailGold: 100,
  heroMaxLevel: 100,
  heroBaseAttack: 10,
  heroAttackPerLevel: 5,
  heroExpPerLevel: 20,
  upgradeCounts: [1, 10] as readonly number[],
  shop: [
    { id: "herb" as const, name: "灵草", price: 10, dailyLimit: 100 },
    { id: "dew" as const, name: "灵露", price: 20, dailyLimit: 50 },
  ],
  alchemy: { herbPerBatch: 2, dewPerBatch: 1, animationMs: 2000, maxBatch: 10, fineChancePercent: 25 },
  pillExp: { normal: 10, fine: 30 },
  pillScore: { normal: 1, fine: 3 },
  mailboxCapacity: 100,
  seasonDurationMs: 600000,
  /** 截止后等待在途积分投递的宽限；超过宽限才定榜。 */
  seasonSettleGraceMs: 3000,
  seasonNextDelayMs: 5000,
  seasonTopSize: 20,
  seasonGoldRewards: [1000, 500, 200] as readonly number[],
  guildCapacity: 3,
  guildInviteLimit: 20,
  bossMaxParticipants: 100,
  bossCooldownMs: 1000,
  bossPlayerHp: 150,
  bossCounterMs: 3000,
  bossCounterDamage: 55,
  bossReviveMs: 5000,
  bossEventLimit: 64,
  bossRespawnMs: 60000,
  bosses: [
    { id: "tiger" as GameDemoBossId, name: "山君", maxHp: 2000, goldReward: 100 },
    { id: "dragon" as GameDemoBossId, name: "蛟龙", maxHp: 4000, goldReward: 200 },
    { id: "phoenix" as GameDemoBossId, name: "炎凰", maxHp: 6000, goldReward: 300 },
  ],
} as const;

export function gameDemoAttack(level: number): number {
  return GAME_DEMO_CONFIG.heroBaseAttack + (level - 1) * GAME_DEMO_CONFIG.heroAttackPerLevel;
}

/** 业务日按 UTC+8 计算，与进程时区无关。 */
export function gameDemoBusinessDate(nowMs: number): string {
  return new Date(nowMs + 8 * 3600000).toISOString().slice(0, 10);
}

/** 每位造成伤害的参与者都按名次获得邮件奖励。 */
export function gameDemoBossGoldReward(baseGold: number, rank: number): number {
  return Math.max(1, Math.floor(baseGold / rank));
}

export function gameDemoBossConfig(bossId: GameDemoBossId) {
  for (const boss of GAME_DEMO_CONFIG.bosses) if (boss.id === bossId) return boss;
  throw new WireValidationError("GAME_DEMO_BOSS_ID", "bossId");
}

/** 英雄培养一次只允许 1 或 10 枚。 */
export function validateGameDemoUpgradeCount(value: unknown, path = "payload.count"): number {
  if (typeof value !== "number" || GAME_DEMO_CONFIG.upgradeCounts.indexOf(value) < 0) {
    throw new WireValidationError("GAME_DEMO_UPGRADE_COUNT", path);
  }
  return value;
}

/** 单批炼丹数量上限来自同一份配置。 */
export function validateGameDemoAlchemyCount(value: unknown, path = "payload.count"): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > GAME_DEMO_CONFIG.alchemy.maxBatch
  ) {
    throw new WireValidationError("GAME_DEMO_ALCHEMY_COUNT", path);
  }
  return value;
}
