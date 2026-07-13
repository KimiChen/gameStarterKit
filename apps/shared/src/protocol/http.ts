/**
 * HTTP 模拟接口协议 —— 双端共享。
 *
 * 服务端在 app.config.ts 的 defineServer({ express }) 回调中通过
 * src/mock/routes.ts 的 registerMockRoutes 按 ApiPath 挂载 mock 路由；
 * 客户端 net/HttpApi.ts（HttpApi 类）按同一份 ApiPath 请求。
 * 所有接口统一返回 IApiResponse<T> 包裹。
 */

/** HTTP 接口路径 */
export const ApiPath = {
    /** 登录（mock：任意 code 都成功） */
    Login: "/api/login",
    /** 拉取玩家档案 */
    Profile: "/api/player/profile",
    /** 排行榜 */
    Rank: "/api/rank",
    /** 服务器时间/健康检查 */
    Health: "/api/health",
} as const;

export type ApiPathType = (typeof ApiPath)[keyof typeof ApiPath];

/** 统一响应包装；失败时（code !== 0）data 为 null */
export interface IApiResponse<T> {
    /** 0 表示成功，其余见 constants/errors.ts */
    code: number;
    message: string;
    data: T | null;
}

// ---------------- /api/login ----------------

export interface ILoginReq {
    /** 微信 wx.login 拿到的临时 code（mock 阶段任意字符串均可） */
    code: string;
}

export interface ILoginRes {
    /** mock 生成的用户 id */
    openId: string;
    /** 会话令牌（mock 为固定前缀 + 随机串） */
    token: string;
    /** 是否新用户 */
    isNew: boolean;
}

// ---------------- /api/player/profile ----------------

export interface IPlayerProfile {
    openId: string;
    nickname: string;
    level: number;
    exp: number;
    /** 金币 */
    gold: number;
    /** 已解锁技能 id 列表 */
    skills: number[];
}

// ---------------- /api/rank ----------------

export interface IRankItem {
    openId: string;
    nickname: string;
    score: number;
    rank: number;
}

export interface IRankRes {
    list: IRankItem[];
    /** 自己的名次，未上榜为 -1 */
    myRank: number;
}

// ---------------- /api/health ----------------

export interface IHealthRes {
    status: "ok";
    serverTime: number;
    version: string;
}

// ================ 以下为服务端框架**真实**端点（server/src/routes，非 mock） ================

// ---------------- GET /version ----------------

/** 部署自检：服务名 + 双端协议版本（PROTOCOL_VERSION，见 protocol/rooms.ts）。 */
export interface IVersionRes {
    name: string;
    protocol: number;
}

// ---------------- GET /clock/now ----------------

/**
 * 服务端权威时钟（无鉴权）。每日奖励/跨天判定/体力恢复展示的对时真源，
 * 防改本地时钟；客户端启动时取一次差值即可（毫秒）。
 */
export interface IClockNowRes {
    serverTime: number;
}
