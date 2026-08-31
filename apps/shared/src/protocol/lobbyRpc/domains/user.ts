/**
 * user 域 ws-RPC 契约（阶段 3 起：路由名/类型/validator/descriptor 单文件自持）。
 *
 * 全域通用约定：
 *  - 路由名 `<域>.<接口>` 必须与服务端 websocket/<域>/<接口>.ts 的目录/文件名一致（loader 启动校验），
 *    同时必须与本文件名（domains/<域>.ts 的 <域>）一致（codegen:features 校验）
 *  - `as const` 不可省——键宽化成 string 后 keyof 塌掉，客户端类型推导全部静默失效
 *  - idempotent-write 路由的 req 必须含必选 clientReqId（09·I2；生成器 AST 层校验），
 *    客户端重试复用同一个，走 WebSocketClient.rpcIdem
 *  - 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）
 */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import { boolField, emptyPayload, optionalRpcString, requiredId, rpcRecord, validateOkRes } from "../primitives";

/** user 域路由名 */
export const UserRpc = {
    /** 取当前登录用户 uid（模式样板：uid 来自服务端 token 反查，⛔ 非客户端上报） */
    GetUserId: "user.getUserId",
    /** 只读自档 */
    GetInfo: "user.getInfo",
    /** 只读他档（公开视图） */
    GetProfile: "user.getProfile",
    /** 改自档资料（写路径，幂等） */
    UpdateProfile: "user.updateProfile",
} as const;

/** 自档视图（真源；服务端 player/userStore.ts 别名引用）。加字段流程见该文件头；档字段入口见 docs/SERVER.md §7 玩家档案。 */
export interface IUserView {
    uid: string;
    /** 段位星数（源 curStar） */
    star: number;
    maxRound: number;
    wins: number;
    losses: number;
    stamina: number;
    /** 体力恢复计时起点（ms）；0 = 满体力/未开始恢复（shared logic/stamina.ts） */
    lastStaminaRecoverAt: number;
    /** 音频偏好：字段缺失 = 默认开 */
    musicOn: boolean;
    sfxOn: boolean;
    /** 所属工会 id；0 = 无工会（缺失即默认，07 字段表） */
    guildId: number;
    ver: number;
}

/** 他档公开视图（真源；服务端 player/userStore.ts 别名引用），⛔ 不含私有字段（体力/设置等）。 */
export interface IPublicUserView {
    readonly uid: string;
    readonly nickname: string;
    readonly avatarId: number;
    readonly province: string;
    readonly star: number;
    readonly maxRound: number;
    readonly wins: number;
    readonly losses: number;
}

export interface IGetUserIdReq {}
export interface IGetUserIdRes {
    uid: string;
}

export interface IGetInfoReq {}
export interface IGetInfoRes {
    /** Lobby ready 契约：成功 join 后必须有角色档，不能传播 nullable 半状态。 */
    user: IUserView;
}

export interface IGetProfileReq {
    uid: string;
}
export interface IGetProfileRes {
    /** null = 档不存在 */
    profile: IPublicUserView | null;
}

export interface IUpdateProfileReq {
    /** 幂等 id（09·I2）：每个逻辑操作生成一次，重试复用 */
    clientReqId: string;
    nickname?: string;
    avatarId?: number;
    province?: string;
    musicOn?: boolean;
    sfxOn?: boolean;
}
export interface IUpdateProfileRes {
    ok: boolean;
}

/** 路由名 → { req, res }（计算键：名字与类型物理绑定，改一处必改另一处） */
export interface UserRpcMap {
    [UserRpc.GetUserId]: { req: IGetUserIdReq; res: IGetUserIdRes };
    [UserRpc.GetInfo]: { req: IGetInfoReq; res: IGetInfoRes };
    [UserRpc.GetProfile]: { req: IGetProfileReq; res: IGetProfileRes };
    [UserRpc.UpdateProfile]: { req: IUpdateProfileReq; res: IUpdateProfileRes };
}

function validateUserView(input: unknown, path = "response.user"): IUserView {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["uid", "star", "maxRound", "wins", "losses", "stamina", "lastStaminaRecoverAt", "musicOn", "sfxOn", "guildId", "ver"], [], path);
    return {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
        star: finiteInteger(value.star, `${path}.star`, 0),
        maxRound: finiteInteger(value.maxRound, `${path}.maxRound`, 0),
        wins: finiteInteger(value.wins, `${path}.wins`, 0),
        losses: finiteInteger(value.losses, `${path}.losses`, 0),
        stamina: finiteInteger(value.stamina, `${path}.stamina`, 0),
        lastStaminaRecoverAt: finiteInteger(value.lastStaminaRecoverAt, `${path}.lastStaminaRecoverAt`, 0),
        musicOn: boolField(value, "musicOn"),
        sfxOn: boolField(value, "sfxOn"),
        guildId: finiteInteger(value.guildId, `${path}.guildId`, 0),
        ver: finiteInteger(value.ver, `${path}.ver`, 0),
    };
}

function validatePublicUser(input: unknown, path = "response.profile"): IPublicUserView {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["uid", "nickname", "avatarId", "province", "star", "maxRound", "wins", "losses"], [], path);
    return {
        uid: boundedString(value.uid, `${path}.uid`, 1, 128),
        nickname: boundedString(value.nickname, `${path}.nickname`, 0, 128),
        avatarId: finiteInteger(value.avatarId, `${path}.avatarId`, -1),
        province: boundedString(value.province, `${path}.province`, 0, 64),
        star: finiteInteger(value.star, `${path}.star`, 0),
        maxRound: finiteInteger(value.maxRound, `${path}.maxRound`, 0),
        wins: finiteInteger(value.wins, `${path}.wins`, 0),
        losses: finiteInteger(value.losses, `${path}.losses`, 0),
    };
}

export const validateGetUserIdReq: RuntimeValidator<IGetUserIdReq> = emptyPayload;
export const validateGetInfoReq: RuntimeValidator<IGetInfoReq> = emptyPayload;
export const validateGetProfileReq: RuntimeValidator<IGetProfileReq> = (input) => {
    const value = rpcRecord(input); assertExactKeys(value, ["uid"], [], "payload"); return { uid: requiredId(value, "uid", 128) };
};
export const validateUpdateProfileReq: RuntimeValidator<IUpdateProfileReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId"], ["nickname", "avatarId", "province", "musicOn", "sfxOn"], "payload");
    const out: IUpdateProfileReq = { clientReqId: requiredId(value, "clientReqId") };
    const nickname = optionalRpcString(value, "nickname", 24); if (nickname !== undefined) out.nickname = nickname;
    const province = optionalRpcString(value, "province", 16); if (province !== undefined) out.province = province;
    if (Object.prototype.hasOwnProperty.call(value, "avatarId") && value.avatarId !== undefined) out.avatarId = finiteInteger(value.avatarId, "payload.avatarId", -1, 999);
    if (Object.prototype.hasOwnProperty.call(value, "musicOn") && value.musicOn !== undefined) out.musicOn = boolField(value, "musicOn");
    if (Object.prototype.hasOwnProperty.call(value, "sfxOn") && value.sfxOn !== undefined) out.sfxOn = boolField(value, "sfxOn");
    return out;
};

export const validateGetUserIdRes: RuntimeValidator<IGetUserIdRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["uid"], [], "response"); return { uid: boundedString(value.uid, "response.uid", 1, 128) };
};
export const validateGetInfoRes: RuntimeValidator<IGetInfoRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["user"], [], "response"); return { user: validateUserView(value.user) };
};
export const validateProfileRes: RuntimeValidator<IGetProfileRes> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["profile"], [], "response"); return { profile: value.profile === null ? null : validatePublicUser(value.profile) };
};
export const validateUpdateRes: RuntimeValidator<IUpdateProfileRes> = validateOkRes;

export default defineLobbyRpcDomain({
    domain: "user",
    errorCodes: [],
    routes: [
        defineRpcQuery(UserRpc.GetUserId, { request: validateGetUserIdReq, response: validateGetUserIdRes }),
        defineRpcQuery(UserRpc.GetInfo, { request: validateGetInfoReq, response: validateGetInfoRes }),
        defineRpcQuery(UserRpc.GetProfile, { request: validateGetProfileReq, response: validateProfileRes }),
        defineRpcIdempotentWrite(UserRpc.UpdateProfile, { request: validateUpdateProfileReq, response: validateUpdateRes }),
    ],
});
