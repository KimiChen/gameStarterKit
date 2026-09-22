/**
 * arenaShop 域的非生成 shared 面（BF2）。
 *
 * 本域的 wire 校验全部是声明式的（`validateTileIndex` 来自 kit api 面、`validateArenaPower`
 * 来自 `./arena`），因此这里**没有** check 函数；留在本文件的只有那件声明式表达不了的业务数据：
 * 插件自己的商品表价格。
 *
 * ⚠ 为什么必须搬家：域文件 `domains/arenaShop.ts` 现在是 schema 生成物（`Do not edit`），
 * 而本常量被 client / `apps/server` / serverNew 三端消费（`ARENA_SHOP_BOOST_COST` 是扣款额，
 * 与 `ArenaShopLogic.boostCost()` 的下单价格必须逐字相同，⛔ 不允许各处再写一个字面量）。
 */

/** 一次 boost 的金币价格（插件自己的商品表，首版只有这一件）。 */
export const ARENA_SHOP_BOOST_COST = 10;
