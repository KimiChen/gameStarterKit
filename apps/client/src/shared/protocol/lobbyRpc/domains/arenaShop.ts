/**
 * arenaShop 域 ws-RPC 契约——「竞技场商店」插件（apps/plugins/arenaShop）自带的域文件。
 * 插件建在 arena kit 的 `board` api 面上（plugin.json `requires.kits.arena.board = 1`）：
 * 本文件只消费框架助手与该 api 面的类型/常量，⛔ 不 import kit 内部模块。
 *
 * 执行模式：BuyBoost=idempotent-write（同一 clientReqId 重放返回首次结果；扣款经 kit-api 的账本幂等）。
 * 错误码：本域只声明 ARENA_SHOP_TILE_NOT_OWNED；扣款失败由框架抛 INSUFFICIENT_BALANCE（shop 域所有）/
 * STALE_FENCE（core），二者仍在 RPC_ERR_CODES 全集里到达客户端——codegen 要求一个码只由一个域声明，
 * 本域 ⛔ 不重复声明，客户端按码分派即可（ArenaShopLogic.describeArenaShopError）。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, finiteInteger, type RuntimeValidator } from "../../http";
import { ARENA_MAX_POWER, validateTileIndex } from "../../../kits/arena/api/board/index";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite } from "../defineDomain";
import { requiredId, rpcRecord } from "../primitives";

/** 一次 boost 的金币价格（插件自己的商品表，首版只有这一件）。 */
export const ARENA_SHOP_BOOST_COST = 10;

/** arenaShop 域路由名 */
export const ArenaShopRpc = {
    /** 花金币给自己的一格加守备 */
    BuyBoost: "arenaShop.buyBoost",
} as const;

export interface IArenaShopBuyBoostReq {
    /** 幂等 id（09·I2） */
    clientReqId: string;
    tile: number;
}
export interface IArenaShopBuyBoostRes {
    tile: number;
    /** boost 后该格守备值 */
    power: number;
    /** 扣款后金币余额；null = 同 opId 账本重放（本次未扣款，kit 面不带余额，插件不越过 kit 面另读） */
    balance: number | null;
}

/** 路由名 → { req, res } */
export interface ArenaShopRpcMap {
    [ArenaShopRpc.BuyBoost]: { req: IArenaShopBuyBoostReq; res: IArenaShopBuyBoostRes };
}

export const validateArenaShopBuyBoostReq: RuntimeValidator<IArenaShopBuyBoostReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId", "tile"], [], "payload");
    return { clientReqId: requiredId(value, "clientReqId"), tile: validateTileIndex(value.tile, "payload.tile") };
};

export const validateArenaShopBuyBoostRes: RuntimeValidator<IArenaShopBuyBoostRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["tile", "power", "balance"], [], "response");
    return {
        tile: validateTileIndex(value.tile, "response.tile"),
        power: finiteInteger(value.power, "response.power", 0, ARENA_MAX_POWER),
        balance: value.balance === null ? null : finiteInteger(value.balance, "response.balance", 0),
    };
};

export default defineLobbyRpcDomain({
    domain: "arenaShop",
    contractVersion: 2,
    errorCodes: ["ARENA_SHOP_TILE_NOT_OWNED"],
    pushes: [],
    routes: [
        defineRpcIdempotentWrite(ArenaShopRpc.BuyBoost, { request: validateArenaShopBuyBoostReq, response: validateArenaShopBuyBoostRes }),
    ],
});
