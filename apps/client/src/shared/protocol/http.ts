/**
 * HTTP 端点协议 —— 双端共享（全部为**真实**端点，mock 层已随「去 mock」移除）。
 *
 * 本文件只描述游戏服仍拥有的 HTTP 端点。登录、选服和账号管理属于独立
 * WebPlatform，其契约由 `generated/webplatform` 中的 OpenAPI 生成物提供。
 * 端点直接返回数据体（非 2xx 时 core/http.ts reject），⛔ 无 IApiResponse 包裹层。
 */

/**
 * HTTP 接口路径常量。⚠ 当前只登记 `/healthz`，且仅 `apps/server/test/smoke.ts` 引用；
 * `/version`、`/clock/now`、`/notice/list` 的路径仍由 endpoint 文件与客户端 wrapper 各自硬编码
 * （现状见 docs/SERVER.md §6，收敛计划见 plan.md P1-03）。
 * 新增核心 endpoint 时先在此补 path 真源，再让两端 import。
 */
export const ApiPath = {
    /** 进程级健康检查（GET） */
    Health: "/healthz",
} as const;

export type ApiPathType = (typeof ApiPath)[keyof typeof ApiPath];

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
