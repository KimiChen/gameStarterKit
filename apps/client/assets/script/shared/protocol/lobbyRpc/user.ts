/**
 * user 域 ws-RPC 契约。
 *
 * 全域通用约定：
 *  - 路由名 `<域>.<接口>` 必须与服务端 handlers/<域>/<接口>.ts 的目录/文件名一致（loader 启动校验）
 *  - `as const` 不可省——键宽化成 string 后 keyof 塌掉，客户端类型推导全部静默失效
 *  - 写接口的 req 必须含 clientReqId（09·I2；客户端重试复用同一个，走 LobbyClient.rpcIdem）
 */

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

/** 自档视图 —— 镜像 apps/server/src/gameplay/userStore.ts 的 UserView（字段表见 docs/server/07）。 */
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
    ver: number;
}

/** 他档公开视图 —— 镜像 PublicUserView，⛔ 不含私有字段（体力/设置等）。 */
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
    /** null = 档不存在（可能冷档） */
    user: IUserView | null;
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
