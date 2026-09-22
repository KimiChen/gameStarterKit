/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/arenaShop.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite } from "../defineDomain";
import { validateTileIndex } from "../../../kits/arena/api/board/index";
import { validateArenaPower } from "../checks/arena";

/** arenaShop 域路由名 */
export const ArenaShopRpc = {
    BuyBoost: "arenaShop.buyBoost",
} as const;

export interface IArenaShopBuyBoostReq {
    clientReqId: string
    tile: number
}

export interface IArenaShopBuyBoostRes {
    tile: number
    power: number
    balance: number | null
}

function parseIArenaShopBuyBoostReq(input: unknown, path: string): IArenaShopBuyBoostReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "tile"], [], path)
    const out: IArenaShopBuyBoostReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        tile: validateTileIndex(value.tile, `${path}.tile`),
    }
    return out
}

function parseIArenaShopBuyBoostRes(input: unknown, path: string): IArenaShopBuyBoostRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["tile", "power", "balance"], [], path)
    const out: IArenaShopBuyBoostRes = {
        tile: validateTileIndex(value.tile, `${path}.tile`),
        power: validateArenaPower(value.power, `${path}.power`),
        balance: ((v) => (v === null ? null : finiteInteger(v, `${path}.balance`, 0, Number.MAX_SAFE_INTEGER)))(value.balance),
    }
    return out
}

export const validateArenaShopBuyBoostReq: RuntimeValidator<IArenaShopBuyBoostReq> = (input) => parseIArenaShopBuyBoostReq(input, "payload")

export const validateArenaShopBuyBoostRes: RuntimeValidator<IArenaShopBuyBoostRes> = (input) => parseIArenaShopBuyBoostRes(input, "response")

export default defineLobbyRpcDomain({
    domain: "arenaShop",
    contractVersion: 6,
    errorCodes: ["ARENA_SHOP_TILE_NOT_OWNED"],
    pushes: [],
    routes: [
        defineRpcIdempotentWrite(ArenaShopRpc.BuyBoost, { request: validateArenaShopBuyBoostReq, response: validateArenaShopBuyBoostRes }),
    ],
});
