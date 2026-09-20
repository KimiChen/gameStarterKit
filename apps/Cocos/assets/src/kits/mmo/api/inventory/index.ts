/**
 * mmo kit · `inventory` api 面（客户端，docs/MMO.md §7.2；MK2-B3 掉落半边：最近掉落 / 拾取半径；MK3-B1 补背包视图模型并 bump）。
 * ⛔ 不 import cc；本面任何导出变化都要 bump `api.inventory.version`。
 */
export { MMO_LOOT_EXPIRE_MS, MMO_PICKUP_RADIUS, nearestLoot } from "../../../../shared/kits/mmo/api/inventory/index";
export type { ILootRoll } from "../../../../shared/kits/mmo/api/inventory/index";
