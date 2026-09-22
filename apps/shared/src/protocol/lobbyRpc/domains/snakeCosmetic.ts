/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/snakeCosmetic.json; validators are generated, complex leaf checks stay in ../checks/. */
import { WireValidationError, assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { boundedArray, rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcNaturalWrite, defineRpcQuery } from "../defineDomain";

/** snakeCosmetic 域路由名 */
export const SnakeCosmeticRpc = {
    GetSnapshot: "snakeCosmetic.getSnapshot",
    Equip: "snakeCosmetic.equip",
    Unlock: "snakeCosmetic.unlock",
} as const;

export interface ISnakeCosmeticGetSnapshotReq {
    readonly [key: string]: never
}

export interface ISnakeCosmeticProfile {
    readonly version: number
    readonly equippedSkinId: number
    readonly ownedSkinIds: readonly number[]
    readonly fragmentBalances: { readonly [key: string]: number }
}

export interface ISnakeCosmeticCatalogEntry {
    readonly skinId: number
    readonly displayName: string
    readonly rarity: number
    readonly acquisition: string
    readonly fragmentThreshold: number | null
}

export interface ISnakeCosmeticSnapshotRes {
    readonly profile: ISnakeCosmeticProfile
    readonly catalog: readonly ISnakeCosmeticCatalogEntry[]
}

export interface ISnakeCosmeticSkinReq {
    readonly skinId: number
}

export interface ISnakeCosmeticProfileRes {
    readonly profile: ISnakeCosmeticProfile
}

function parseISnakeCosmeticGetSnapshotReq(input: unknown, path: string): ISnakeCosmeticGetSnapshotReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], [], path)
    const out: ISnakeCosmeticGetSnapshotReq = {
    }
    return out
}

function parseISnakeCosmeticProfile(input: unknown, path: string): ISnakeCosmeticProfile {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["version", "equippedSkinId", "ownedSkinIds", "fragmentBalances"], [], path)
    const out: ISnakeCosmeticProfile = {
        version: finiteInteger(value.version, `${path}.version`, 0, Number.MAX_SAFE_INTEGER),
        equippedSkinId: finiteInteger(value.equippedSkinId, `${path}.equippedSkinId`, 1, Number.MAX_SAFE_INTEGER),
        ownedSkinIds: boundedArray(value.ownedSkinIds, `${path}.ownedSkinIds`, 0, 512, "WIRE_ARRAY").map((item, i) => finiteInteger(item, `${path}.ownedSkinIds[${i}]`, 1, Number.MAX_SAFE_INTEGER)),
        fragmentBalances: ((v) => { const entries = rpcRecord(v, `${path}.fragmentBalances`); const keys = Object.keys(entries); if (keys.length > 64) throw new WireValidationError("WIRE_KEYS", `${path}.fragmentBalances`); for (const key of keys) if (!/^[1-9][0-9]{0,8}$/u.test(key)) throw new WireValidationError("WIRE_KEYS", `${path}.fragmentBalances`); const out: Record<string, number> = {}; for (const key of keys) out[key] = finiteInteger(entries[key], `${path}.fragmentBalances.${key}`, 0, Number.MAX_SAFE_INTEGER); return out; })(value.fragmentBalances),
    }
    return out
}

function parseISnakeCosmeticCatalogEntry(input: unknown, path: string): ISnakeCosmeticCatalogEntry {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["skinId", "displayName", "rarity", "acquisition", "fragmentThreshold"], [], path)
    const out: ISnakeCosmeticCatalogEntry = {
        skinId: finiteInteger(value.skinId, `${path}.skinId`, 1, Number.MAX_SAFE_INTEGER),
        displayName: boundedString(value.displayName, `${path}.displayName`, 1, 64),
        rarity: finiteInteger(value.rarity, `${path}.rarity`, 0, 5),
        acquisition: boundedString(value.acquisition, `${path}.acquisition`, 1, 32),
        fragmentThreshold: ((v) => (v === null ? null : finiteInteger(v, `${path}.fragmentThreshold`, 1, Number.MAX_SAFE_INTEGER)))(value.fragmentThreshold),
    }
    return out
}

function parseISnakeCosmeticSnapshotRes(input: unknown, path: string): ISnakeCosmeticSnapshotRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["profile", "catalog"], [], path)
    const out: ISnakeCosmeticSnapshotRes = {
        profile: parseISnakeCosmeticProfile(value.profile, `${path}.profile`),
        catalog: boundedArray(value.catalog, `${path}.catalog`, 0, 256, "WIRE_ARRAY").map((item, i) => parseISnakeCosmeticCatalogEntry(item, `${path}.catalog[${i}]`)),
    }
    return out
}

function parseISnakeCosmeticSkinReq(input: unknown, path: string): ISnakeCosmeticSkinReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["skinId"], [], path)
    const out: ISnakeCosmeticSkinReq = {
        skinId: finiteInteger(value.skinId, `${path}.skinId`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseISnakeCosmeticProfileRes(input: unknown, path: string): ISnakeCosmeticProfileRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["profile"], [], path)
    const out: ISnakeCosmeticProfileRes = {
        profile: parseISnakeCosmeticProfile(value.profile, `${path}.profile`),
    }
    return out
}

export const validateSnakeCosmeticGetSnapshotReq: RuntimeValidator<ISnakeCosmeticGetSnapshotReq> = (input) => parseISnakeCosmeticGetSnapshotReq(input, "payload")

export const validateSnakeCosmeticGetSnapshotRes: RuntimeValidator<ISnakeCosmeticSnapshotRes> = (input) => parseISnakeCosmeticSnapshotRes(input, "response")

export const validateSnakeCosmeticEquipReq: RuntimeValidator<ISnakeCosmeticSkinReq> = (input) => parseISnakeCosmeticSkinReq(input, "payload")

export const validateSnakeCosmeticEquipRes: RuntimeValidator<ISnakeCosmeticProfileRes> = (input) => parseISnakeCosmeticProfileRes(input, "response")

export const validateSnakeCosmeticUnlockReq: RuntimeValidator<ISnakeCosmeticSkinReq> = (input) => parseISnakeCosmeticSkinReq(input, "payload")

export const validateSnakeCosmeticUnlockRes: RuntimeValidator<ISnakeCosmeticProfileRes> = (input) => parseISnakeCosmeticProfileRes(input, "response")

export default defineLobbyRpcDomain({
    domain: "snakeCosmetic",
    contractVersion: 7,
    errorCodes: ["SNAKE_SKIN_UNKNOWN","SNAKE_SKIN_NOT_OWNED","SNAKE_SKIN_NOT_CRAFTABLE","SNAKE_SKIN_FRAGMENTS_INSUFFICIENT","SNAKE_COSMETIC_WRITES_DISABLED"],
    pushes: [],
    routes: [
        defineRpcQuery(SnakeCosmeticRpc.GetSnapshot, { request: validateSnakeCosmeticGetSnapshotReq, response: validateSnakeCosmeticGetSnapshotRes }),
        defineRpcNaturalWrite(SnakeCosmeticRpc.Equip, { request: validateSnakeCosmeticEquipReq, response: validateSnakeCosmeticEquipRes }),
        defineRpcNaturalWrite(SnakeCosmeticRpc.Unlock, { request: validateSnakeCosmeticUnlockReq, response: validateSnakeCosmeticUnlockRes }),
    ],
});
