/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/heroRecruit.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { boundedArray, rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import { validateHeroRecruitId } from "../checks/heroRecruit";

/** heroRecruit 域路由名 */
export const HeroRecruitRpc = {
    GetCatalog: "heroRecruit.getCatalog",
    Buy: "heroRecruit.buy",
} as const;

export interface IHeroRecruitGetCatalogReq {
    readonly [key: string]: never
}

export interface IHeroRecruitCatalogEntry {
    readonly heroId: number
    readonly name: string
    readonly title: string
    readonly rarity: number
    readonly copperPrice: number
}

export interface IHeroRecruitSnapshot {
    readonly copper: number
    readonly ownedHeroIds: readonly number[]
    readonly catalog: readonly IHeroRecruitCatalogEntry[]
}

export interface IHeroRecruitGetCatalogRes {
    snapshot: IHeroRecruitSnapshot
}

export interface IHeroRecruitBuyReq {
    clientReqId: string
    heroId: number
}

export interface IHeroRecruitBuyRes {
    purchasedHeroId: number
    snapshot: IHeroRecruitSnapshot
}

function parseIHeroRecruitGetCatalogReq(input: unknown, path: string): IHeroRecruitGetCatalogReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], [], path)
    const out: IHeroRecruitGetCatalogReq = {
    }
    return out
}

function parseIHeroRecruitCatalogEntry(input: unknown, path: string): IHeroRecruitCatalogEntry {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["heroId", "name", "title", "rarity", "copperPrice"], [], path)
    const out: IHeroRecruitCatalogEntry = {
        heroId: validateHeroRecruitId(value.heroId, `${path}.heroId`),
        name: boundedString(value.name, `${path}.name`, 1, 32),
        title: boundedString(value.title, `${path}.title`, 1, 32),
        rarity: finiteInteger(value.rarity, `${path}.rarity`, 1, 5),
        copperPrice: finiteInteger(value.copperPrice, `${path}.copperPrice`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIHeroRecruitSnapshot(input: unknown, path: string): IHeroRecruitSnapshot {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["copper", "ownedHeroIds", "catalog"], [], path)
    const out: IHeroRecruitSnapshot = {
        copper: finiteInteger(value.copper, `${path}.copper`, 0, Number.MAX_SAFE_INTEGER),
        ownedHeroIds: boundedArray(value.ownedHeroIds, `${path}.ownedHeroIds`, 0, 256, "WIRE_ARRAY").map((item, i) => finiteInteger(item, `${path}.ownedHeroIds[${i}]`, 1, Number.MAX_SAFE_INTEGER)),
        catalog: boundedArray(value.catalog, `${path}.catalog`, 0, 64, "WIRE_ARRAY").map((item, i) => parseIHeroRecruitCatalogEntry(item, `${path}.catalog[${i}]`)),
    }
    return out
}

function parseIHeroRecruitGetCatalogRes(input: unknown, path: string): IHeroRecruitGetCatalogRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["snapshot"], [], path)
    const out: IHeroRecruitGetCatalogRes = {
        snapshot: parseIHeroRecruitSnapshot(value.snapshot, `${path}.snapshot`),
    }
    return out
}

function parseIHeroRecruitBuyReq(input: unknown, path: string): IHeroRecruitBuyReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "heroId"], [], path)
    const out: IHeroRecruitBuyReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        heroId: validateHeroRecruitId(value.heroId, `${path}.heroId`),
    }
    return out
}

function parseIHeroRecruitBuyRes(input: unknown, path: string): IHeroRecruitBuyRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["purchasedHeroId", "snapshot"], [], path)
    const out: IHeroRecruitBuyRes = {
        purchasedHeroId: validateHeroRecruitId(value.purchasedHeroId, `${path}.purchasedHeroId`),
        snapshot: parseIHeroRecruitSnapshot(value.snapshot, `${path}.snapshot`),
    }
    return out
}

export const validateHeroRecruitGetCatalogReq: RuntimeValidator<IHeroRecruitGetCatalogReq> = (input) => parseIHeroRecruitGetCatalogReq(input, "payload")

export const validateHeroRecruitGetCatalogRes: RuntimeValidator<IHeroRecruitGetCatalogRes> = (input) => parseIHeroRecruitGetCatalogRes(input, "response")

export const validateHeroRecruitBuyReq: RuntimeValidator<IHeroRecruitBuyReq> = (input) => parseIHeroRecruitBuyReq(input, "payload")

export const validateHeroRecruitBuyRes: RuntimeValidator<IHeroRecruitBuyRes> = (input) => parseIHeroRecruitBuyRes(input, "response")

export default defineLobbyRpcDomain({
    domain: "heroRecruit",
    contractVersion: 3,
    errorCodes: ["HERO_RECRUIT_UNKNOWN","HERO_RECRUIT_ALREADY_OWNED","HERO_RECRUIT_INSUFFICIENT_COPPER","HERO_RECRUIT_USER_UNAVAILABLE"],
    pushes: [],
    routes: [
        defineRpcQuery(HeroRecruitRpc.GetCatalog, { request: validateHeroRecruitGetCatalogReq, response: validateHeroRecruitGetCatalogRes }),
        defineRpcIdempotentWrite(HeroRecruitRpc.Buy, { request: validateHeroRecruitBuyReq, response: validateHeroRecruitBuyRes }),
    ],
});
