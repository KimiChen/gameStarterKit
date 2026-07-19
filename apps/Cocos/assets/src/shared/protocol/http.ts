/**
 * HTTP 模拟接口协议 —— 双端共享。
 *
 * 服务端在 app.config.ts 的 defineServer({ express }) 回调中通过
 * src/mock 扫描 api/ 目录按 ApiPath 挂载 mock 路由（/mock/ 前缀 = 假数据）；
 * 客户端 net/mock/<接口>.ts（core/http.ts XHR 底座）按同一份 ApiPath 请求。
 * 所有接口统一返回 IApiResponse<T> 包裹。
 */

/** HTTP 接口路径 */
export const ApiPath = {
    /** 登录（mock：任意 code 都成功） */
    Login: "/mock/login",
    /** 拉取玩家档案 */
    Profile: "/mock/player/profile",
    /** 排行榜 */
    Rank: "/mock/rank",
    /** 服务器时间/健康检查 */
    Health: "/mock/health",
} as const;

export type ApiPathType = (typeof ApiPath)[keyof typeof ApiPath];

/** 统一响应包装；失败时（code !== 0）data 为 null */
export interface IApiResponse<T> {
    /** 0 表示成功，其余见 constants/errors.ts */
    code: number;
    message: string;
    data: T | null;
}

// ---------------- /mock/login ----------------

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

// ---------------- /mock/player/profile ----------------

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

// ---------------- /mock/rank ----------------

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

// ---------------- /mock/health ----------------

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

// ---------------- GET /area/list ----------------

/**
 * 选服列表单项（登录前展示，无鉴权）。t 驱动角标、status 驱动负载图标。
 */
export interface IAreaServer {
    /** 区服 id */
    sId: number;
    /** 区服名 */
    name: string;
    /** 角标标记：0=正常 1=新服(推荐) 2=爆满 9=维护 */
    t: number;
    /** 负载状态：1=流畅 2=繁忙 9=维护（驱动状态图标 login_status_{n}） */
    status: number;
    /** 开服时间（unix 秒）；0=未开服 */
    openTime: number;
    /**
     * ★ 该区服游戏服连接地址（`ws(s)://host:port`）。**区服 = 独立实例**：选服后客户端连它
     * （Main 用它连 RoomClient，非固定 serverUrl）。starter kit demo 全部指向同一 dev server；
     * 真实实现由 /area/list（中心服/调度）按 sId 返回各区服实例地址。
     */
    wsUrl: string;
}

/**
 * 选服列表响应。真实实现可从配置表/运维后台读；starter kit 用服务端 demo 配置。
 * `ul` 需用户身份（登录后回填最近登录区服），匿名请求为空数组。
 */
export interface IAreaListRes {
    /** 运维模式标记（1=灰度/维护中，客户端据此提示） */
    isOps: number;
    /** 全部区服 */
    al: IAreaServer[];
    /** 当前用户最近登录过的区服 sId（匿名为空；带 token 时回填） */
    ul: number[];
    /** serverList 一致性哈希（连服/踢人校验 token，对应原项目 serverList.h） */
    h: string;
}

// ---------------- GET /notice/list ----------------

/**
 * 公告单项（登录前展示，无鉴权）。desc=列表摘要，content=详情富文本。
 */
export interface INoticeItem {
    id: number;
    /** 分类：activity=活动 notice=公告 maintain=维护 */
    category: string;
    title: string;
    /** 列表摘要 */
    desc: string;
    /** 详情富文本（点开公告项展示） */
    content: string;
    /** 发布时间（unix 秒） */
    at: number;
}

/** 公告列表响应。按 at 倒序（新在前）。 */
export interface INoticeListRes {
    list: INoticeItem[];
}
