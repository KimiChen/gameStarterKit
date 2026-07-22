/**
 * HTTP 端点协议 —— 双端共享（全部为**真实**端点，mock 层已随「去 mock」移除）。
 *
 * 服务端 http/<域>/<接口>.ts（createEndpoint + zod）按 ApiPath 提供；
 * 客户端 net/http/<域>.ts（core/http.ts XHR 底座）按同一份 ApiPath 请求。
 * 端点直接返回数据体（非 2xx 时 core/http.ts reject），⛔ 无 IApiResponse 包裹层。
 */

/** HTTP 接口路径（真实端点单源；服务端路由与客户端调用都 import 它） */
export const ApiPath = {
    /** 微信登录（POST；code2session → 建号/复用 → 签发 token） */
    WxLogin: "/account/wx-login",
    /** 本地/CI 登录（POST；绕过 code2session、其余全走真实链路——AUTH_DEV_ENABLED 控制，生产禁用） */
    DevLogin: "/account/dev-login",
    /** 进程级健康检查（GET） */
    Health: "/healthz",
} as const;

export type ApiPathType = (typeof ApiPath)[keyof typeof ApiPath];

// ---------------- POST /account/wx-login | /account/dev-login ----------------

/** wx-login 入参（dev-login 为 { devKey, deviceId? }，见服务端 devLogin.ts schema）。 */
export interface ILoginReq {
    /** 微信 wx.login 拿到的临时 code */
    code: string;
    deviceId?: string;
}

/** 登录响应（wx 与 dev 同契约）。⛔ 禁含 openid/unionid/session_key（09·G8）。 */
export interface ILoginRes {
    userId: string;
    /** 不透明 token（`{uid}.{hex}`），后续 HTTP Bearer / 房间 join 携带 */
    token: string;
    /** 新建账号 = true（新手引导用） */
    isNew: boolean;
}

// ---------------- GET /healthz ----------------

/** 进程级健康检查：只证明进程活着；依赖健康另走 smoke:framework / readiness（M10）。 */
export interface IHealthRes {
    status: "ok";
    serverTime: number;
    version: string;
}

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
 * 区服可进入判定——客户端三处统一复用（默认选服 pickDefaultServer / 选服 choose / 进服闸），
 * 服务端 SERVER_ID 准入硬校验（todo「区服 openTime 统一校验」后半）将来复用同一函数。
 * t===9=维护、openTime===0=未开服（字段语义见 IAreaServer）均不可进。
 * 运维豁免（isOps，部署环境级开关）不属于区服本身属性，由调用方叠加；
 * ⛔ 客户端判断只改善 UX，不是安全闸——真闸在服务端准入层。
 */
export function isServerEnterable(s: Pick<IAreaServer, "t" | "openTime">): boolean {
    return s.t !== 9 && s.openTime > 0;
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
