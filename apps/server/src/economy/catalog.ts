/**
 * 商品目录（M6 首版硬编码；后续接运营配置表时保持同一形状）。
 *
 * - shopSkus：游戏币购买（扣 gold + 发 Effect，走 outbox 三阶段协议，09·X1）
 * - rechargeSkus：真金充值（微信支付 → purchases 状态机 → 发 gold，纯 MySQL 无 outbox）
 */
import { CUR_GOLD } from "../infra/config";
import type { Effect } from "./outbox";

export interface ShopSku {
  sku: string;
  currency: number;
  price: number;
  grants: Effect;
}

export interface RechargeSku {
  sku: string;
  amountFen: number; // 真金价（分）
  gold: number;      // 到账游戏币
}

const SHOP: Record<string, ShopSku> = {
  // 武器碎片包：weaponFragments 是背包可数道具（bag 分片，field=weaponId）
  "shop.frag29x10": { sku: "shop.frag29x10", currency: CUR_GOLD, price: 100, grants: [{ kind: "item", itemId: 29, count: 10 }] },
  "shop.frag17x10": { sku: "shop.frag17x10", currency: CUR_GOLD, price: 100, grants: [{ kind: "item", itemId: 17, count: 10 }] },
};

const RECHARGE: Record<string, RechargeSku> = {
  "rc.gold600": { sku: "rc.gold600", amountFen: 600, gold: 600 },
  "rc.gold3000": { sku: "rc.gold3000", amountFen: 3000, gold: 3300 },
};

export const getShopSku = (sku: string): ShopSku | null => SHOP[sku] ?? null;
export const getRechargeSku = (sku: string): RechargeSku | null => RECHARGE[sku] ?? null;
