/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/user.json; validators are generated, complex leaf checks stay in ../checks/. */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { boolField, rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";

/** user 域路由名 */
export const UserRpc = {
    GetUserId: "user.getUserId",
    GetInfo: "user.getInfo",
    GetProfile: "user.getProfile",
    UpdateProfile: "user.updateProfile",
} as const;

export interface IGetUserIdReq {
    readonly [key: string]: never
}

export interface IGetUserIdRes {
    uid: string
}

export interface IGetInfoReq {
    readonly [key: string]: never
}

export interface IUserView {
    uid: string
    star: number
    maxRound: number
    wins: number
    losses: number
    stamina: number
    lastStaminaRecoverAt: number
    musicOn: boolean
    sfxOn: boolean
    guildId: number
    ver: number
}

export interface IGetInfoRes {
    user: IUserView
}

export interface IGetProfileReq {
    uid: string
}

export interface IPublicUserView {
    readonly uid: string
    readonly nickname: string
    readonly avatarId: number
    readonly province: string
    readonly star: number
    readonly maxRound: number
    readonly wins: number
    readonly losses: number
}

export interface IGetProfileRes {
    profile: IPublicUserView | null
}

export interface IUpdateProfileReq {
    clientReqId: string
    nickname?: string
    avatarId?: number
    province?: string
    musicOn?: boolean
    sfxOn?: boolean
}

export interface IUpdateProfileRes {
    ok: boolean
}

function parseIGetUserIdReq(input: unknown, path: string): IGetUserIdReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], [], path)
    const out: IGetUserIdReq = {
    }
    return out
}

function parseIGetUserIdRes(input: unknown, path: string): IGetUserIdRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid"], [], path)
    const out: IGetUserIdRes = {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
    }
    return out
}

function parseIGetInfoReq(input: unknown, path: string): IGetInfoReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], [], path)
    const out: IGetInfoReq = {
    }
    return out
}

function parseIUserView(input: unknown, path: string): IUserView {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid", "star", "maxRound", "wins", "losses", "stamina", "lastStaminaRecoverAt", "musicOn", "sfxOn", "guildId", "ver"], [], path)
    const out: IUserView = {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
        star: finiteInteger(value.star, `${path}.star`, 0, Number.MAX_SAFE_INTEGER),
        maxRound: finiteInteger(value.maxRound, `${path}.maxRound`, 0, Number.MAX_SAFE_INTEGER),
        wins: finiteInteger(value.wins, `${path}.wins`, 0, Number.MAX_SAFE_INTEGER),
        losses: finiteInteger(value.losses, `${path}.losses`, 0, Number.MAX_SAFE_INTEGER),
        stamina: finiteInteger(value.stamina, `${path}.stamina`, 0, Number.MAX_SAFE_INTEGER),
        lastStaminaRecoverAt: finiteInteger(value.lastStaminaRecoverAt, `${path}.lastStaminaRecoverAt`, 0, Number.MAX_SAFE_INTEGER),
        musicOn: boolField(value, "musicOn"),
        sfxOn: boolField(value, "sfxOn"),
        guildId: finiteInteger(value.guildId, `${path}.guildId`, 0, Number.MAX_SAFE_INTEGER),
        ver: finiteInteger(value.ver, `${path}.ver`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGetInfoRes(input: unknown, path: string): IGetInfoRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["user"], [], path)
    const out: IGetInfoRes = {
        user: parseIUserView(value.user, `${path}.user`),
    }
    return out
}

function parseIGetProfileReq(input: unknown, path: string): IGetProfileReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid"], [], path)
    const out: IGetProfileReq = {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
    }
    return out
}

function parseIPublicUserView(input: unknown, path: string): IPublicUserView {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid", "nickname", "avatarId", "province", "star", "maxRound", "wins", "losses"], [], path)
    const out: IPublicUserView = {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
        nickname: boundedString(value.nickname, `${path}.nickname`, 0, 128),
        avatarId: finiteInteger(value.avatarId, `${path}.avatarId`, -1, Number.MAX_SAFE_INTEGER),
        province: boundedString(value.province, `${path}.province`, 0, 64),
        star: finiteInteger(value.star, `${path}.star`, 0, Number.MAX_SAFE_INTEGER),
        maxRound: finiteInteger(value.maxRound, `${path}.maxRound`, 0, Number.MAX_SAFE_INTEGER),
        wins: finiteInteger(value.wins, `${path}.wins`, 0, Number.MAX_SAFE_INTEGER),
        losses: finiteInteger(value.losses, `${path}.losses`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGetProfileRes(input: unknown, path: string): IGetProfileRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["profile"], [], path)
    const out: IGetProfileRes = {
        profile: ((v) => (v === null ? null : parseIPublicUserView(v, `${path}.profile`)))(value.profile),
    }
    return out
}

function parseIUpdateProfileReq(input: unknown, path: string): IUpdateProfileReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId"], ["nickname", "avatarId", "province", "musicOn", "sfxOn"], path)
    const out: IUpdateProfileReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
    }
    if (value.nickname !== undefined) out.nickname = boundedString(value.nickname, `${path}.nickname`, 0, 24)
    if (value.avatarId !== undefined) out.avatarId = finiteInteger(value.avatarId, `${path}.avatarId`, -1, 999)
    if (value.province !== undefined) out.province = boundedString(value.province, `${path}.province`, 0, 16)
    if (value.musicOn !== undefined) out.musicOn = boolField(value, "musicOn")
    if (value.sfxOn !== undefined) out.sfxOn = boolField(value, "sfxOn")
    return out
}

function parseIUpdateProfileRes(input: unknown, path: string): IUpdateProfileRes {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["ok"], [], path)
    const out: IUpdateProfileRes = {
        ok: boolField(value, "ok"),
    }
    return out
}

export const validateUserGetUserIdReq: RuntimeValidator<IGetUserIdReq> = (input) => parseIGetUserIdReq(input, "payload")

export const validateUserGetUserIdRes: RuntimeValidator<IGetUserIdRes> = (input) => parseIGetUserIdRes(input, "response")

export const validateUserGetInfoReq: RuntimeValidator<IGetInfoReq> = (input) => parseIGetInfoReq(input, "payload")

export const validateUserGetInfoRes: RuntimeValidator<IGetInfoRes> = (input) => parseIGetInfoRes(input, "response")

export const validateUserGetProfileReq: RuntimeValidator<IGetProfileReq> = (input) => parseIGetProfileReq(input, "payload")

export const validateUserGetProfileRes: RuntimeValidator<IGetProfileRes> = (input) => parseIGetProfileRes(input, "response")

export const validateUserUpdateProfileReq: RuntimeValidator<IUpdateProfileReq> = (input) => parseIUpdateProfileReq(input, "payload")

export const validateUserUpdateProfileRes: RuntimeValidator<IUpdateProfileRes> = (input) => parseIUpdateProfileRes(input, "response")

export default defineLobbyRpcDomain({
    domain: "user",
    contractVersion: 5,
    errorCodes: [],
    pushes: [],
    routes: [
        defineRpcQuery(UserRpc.GetUserId, { request: validateUserGetUserIdReq, response: validateUserGetUserIdRes }),
        defineRpcQuery(UserRpc.GetInfo, { request: validateUserGetInfoReq, response: validateUserGetInfoRes }),
        defineRpcQuery(UserRpc.GetProfile, { request: validateUserGetProfileReq, response: validateUserGetProfileRes }),
        defineRpcIdempotentWrite(UserRpc.UpdateProfile, { request: validateUserUpdateProfileReq, response: validateUserUpdateProfileRes }),
    ],
});
