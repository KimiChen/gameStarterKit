/**
 * GameRoom wire 向量 sidecar 的类型与共用构造器（先例：test/lobbyRpcVectors/）。
 *
 * 每个 wire owner 一份 `wire-vectors/<owner>.ts`，default 导出该 owner 全部 C2S 的
 * 合法向量与边界反例，以及玩法准入矩阵要用的一份合法 payload。两个中央测试
 * （game-room-wire-contract / game-mode）只按 GAME_WIRE_OWNERS 做数据驱动探针，
 * ⛔ 不得再出现 `owner === "snake"` 这类具名玩法分支。
 *
 * ⚠ 这里只住 C2S：两个中央测试原本就没有 S2C 向量（S2C 判别力在 wire-contract.test.ts
 * 的 push/state vectors 与各玩法自有测试里），⛔ 不为形状对称凭空造数据。
 * ⛔ 向量只住测试侧——不进 shared/runtime descriptor，也不同步进 Cocos。
 */
import type { C2SType } from "@game/shared";

export type WireVector = {
  readonly label: string;
  readonly value: unknown;
  readonly accepted: boolean;
};

export type WireVectorFile = {
  /** 该 owner 每条 C2S 的合法向量与边界反例（exact validator 判别力矩阵）。 */
  readonly c2s: { readonly [K in C2SType]?: readonly WireVector[] };
  /**
   * 该 owner 每条**玩法** C2S 的一份合法 payload（owner 独占 + phase 准入矩阵用）。
   * ⛔ 必须合法，否则会先撞 exact validator，测不到准入闸。
   * core owner 无此项：core 消息的 phase 规则归 shell，不走玩法准入矩阵。
   */
  readonly admission?: { readonly [K in C2SType]?: unknown };
};

/** 敌意 shape 构造器：往合法对象上挂一个 symbol 键（exact-keys 闸的反例）。 */
export function symbolExtra(value: Record<string, unknown>): Record<string, unknown> {
  (value as Record<PropertyKey, unknown>)[Symbol("extra")] = true;
  return value;
}
