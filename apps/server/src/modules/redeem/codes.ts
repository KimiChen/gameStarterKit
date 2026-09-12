/**
 * 兑换码表——首版是**进程内静态表**（开发期演示口径）。真实运营需要码表来自运营后台/DB
 * 并带有效期、总量与批次；那属于插件自身的后续版本（递增 plugin.json version 与
 * redeem 域 contractVersion），⛔ 不在框架侧承诺。
 */
import type { IRedeemReward } from "@game/shared/protocol/lobbyRpc/domains/redeem";

const TABLE: ReadonlyMap<string, IRedeemReward> = new Map<string, IRedeemReward>([
  ["WELCOME2026", { kind: "coins", amount: 100 }],
  ["SNAKE90", { kind: "coins", amount: 90 }],
  ["DEVTEST", { kind: "coins", amount: 1 }],
]);

/** 查码：未登记返回 null（调用方翻译为 REDEEM_CODE_INVALID）。 */
export function lookupRedeemCode(code: string): IRedeemReward | null {
  return TABLE.get(code) ?? null;
}
