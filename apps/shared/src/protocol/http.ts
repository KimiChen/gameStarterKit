import {
    WebPlatformMethod,
    WebPlatformPath,
    type WebPlatformAreaListResponse,
    type WebPlatformAreaServer,
    type WebPlatformLoginResponse,
    type VerifySessionRequest,
    type VerifySessionResponse,
    type RegisterCharacterResponse,
    type HasCharacterResponse,
} from "../generated/webplatform/index";

/**
 * HTTP 端点协议 —— 双端共享（全部为**真实**端点，mock 层已随「去 mock」移除）。
 *
 * 本文件只描述游戏服仍拥有的 HTTP 端点。登录、选服和账号管理属于独立
 * WebPlatform，其契约由 `generated/webplatform` 中的 OpenAPI 生成物提供。
 * 端点直接返回数据体（非 2xx 时 core/http.ts reject），⛔ 无 IApiResponse 包裹层。
 */

/**
 * HTTP 接口路径常量。所有游戏服 endpoint 都必须先在这里登记，再由 server router 与
 * client wrapper 引用；这样 path/method 漂移会在契约测试中失败，而不是等到联调才发现。
 */
export const ApiPath = {
    /** 进程级健康检查（GET） */
    Health: "/healthz",
    /** 部署自检（GET） */
    Version: "/version",
    /** 服务端权威时钟（GET） */
    ClockNow: "/clock/now",
    /** 登录前公告（GET） */
    NoticeList: "/notice/list",
    /** GM 强制下线参考端点（POST，默认需密钥） */
    AdminKick: "/admin/kick",
    /** 微信支付回调参考端点（POST，默认关闭） */
    PayWxNotify: "/pay/wx-notify",
} as const;

export type ApiPathType = (typeof ApiPath)[keyof typeof ApiPath];

// ---------------- shared runtime helpers ----------------

/** 零依赖 runtime validator 类型；实现只依赖 ES 标准库，客户端可直接同步使用。 */
export type RuntimeValidator<T> = (input: unknown) => T;

/** 跨 HTTP/RPC/S2C 边界共用的可判别校验错误。 */
export class WireValidationError extends Error {
    readonly code: string;
    readonly path: string;

    constructor(code: string, path = "", detail = "") {
        super(`${code}${path ? ` at ${path}` : ""}${detail ? `: ${detail}` : ""}`);
        this.name = "WireValidationError";
        this.code = code;
        this.path = path;
    }
}

export type PlainRecord = Record<string, unknown>;

/** 只接受普通 JSON object；数组、类实例和 null 原型对象以外的值均拒绝。 */
export function isPlainRecord(value: unknown): value is PlainRecord {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/** exact-key 检查：required 必须存在，optional 可选，除此之外一律拒绝。 */
export function hasExactKeys(
    value: PlainRecord,
    required: readonly string[],
    optional: readonly string[] = [],
): boolean {
    const allowed = new Set([...required, ...optional]);
    const actual = Object.keys(value);
    if (actual.some((key) => !allowed.has(key))) return false;
    return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function assertExactKeys(
    value: unknown,
    required: readonly string[],
    optional: readonly string[] = [],
    path = "value",
): asserts value is PlainRecord {
    if (!isPlainRecord(value) || !hasExactKeys(value, required, optional)) {
        throw new WireValidationError("WIRE_KEYS", path);
    }
}

const fail = (code: string, path: string, detail?: string): never => {
    throw new WireValidationError(code, path, detail);
};

export function finiteNumber(value: unknown, path: string, min = -Infinity, max = Infinity): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        fail("WIRE_NUMBER", path);
    }
    return value as number;
}

export function finiteInteger(value: unknown, path: string, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
        fail("WIRE_INTEGER", path);
    }
    return value as number;
}

export function boundedString(value: unknown, path: string, min = 0, max = 1024): string {
    if (typeof value !== "string" || value.length < min || value.length > max) {
        fail("WIRE_STRING", path);
    }
    return value as string;
}

function objectAt(value: unknown, path: string): PlainRecord {
    if (!isPlainRecord(value)) fail("WIRE_OBJECT", path);
    return value as PlainRecord;
}

function arrayAt(value: unknown, path: string, max: number): unknown[] {
    if (!Array.isArray(value) || value.length > max) fail("WIRE_ARRAY", path);
    return value as unknown[];
}

function optionalString(value: PlainRecord, key: string, path: string, max: number): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined) return undefined;
    return boundedString(value[key], `${path}.${key}`, 0, max);
}

/**
 * 验证并返回 HTTP(S)/WS(S) origin。共享层不能依赖 DOM 的 URL，因此这里使用
 * 一个刻意保守的绝对-origin解析器：禁止 userinfo、path、query、fragment 和非法端口。
 */
export function validateOrigin(value: unknown, protocols: readonly ("http" | "https" | "ws" | "wss")[], path = "url"): string {
    const raw = boundedString(value, path, 1, 2048).trim();
    const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i.exec(raw);
    if (!match) throw new WireValidationError("WIRE_URL", path);
    const parsedMatch = match;
    const protocol = parsedMatch[1].toLowerCase() as "http" | "https" | "ws" | "wss";
    if (!protocols.includes(protocol)) fail("WIRE_URL_PROTOCOL", path);
    const authority = parsedMatch[2];
    if (!authority || authority.includes("@") || /[\\\s]/.test(authority)) fail("WIRE_URL_HOST", path);
    // A trailing slash is presentation-only; any other path would make the
    // directory response point at an unexpected gateway endpoint.
    if (parsedMatch[3] && !/^\/+$/u.test(parsedMatch[3])) fail("WIRE_URL_PATH", path);
    if (parsedMatch[4] || parsedMatch[5]) fail("WIRE_URL_PATH", path);

    let host = authority;
    let port: string | undefined;
    if (authority.startsWith("[")) {
        const close = authority.indexOf("]");
        if (close < 2) fail("WIRE_URL_HOST", path);
        host = authority.slice(1, close);
        const rest = authority.slice(close + 1);
        if (rest !== "") {
            if (!rest.startsWith(":")) fail("WIRE_URL_HOST", path);
            port = rest.slice(1);
        }
        if (!/^[0-9a-f:.]+$/i.test(host)) fail("WIRE_URL_HOST", path);
    } else {
        const colon = authority.lastIndexOf(":");
        if (colon >= 0) {
            host = authority.slice(0, colon);
            port = authority.slice(colon + 1);
        }
        if (!host || !/^[A-Za-z0-9.-]+$/.test(host)) fail("WIRE_URL_HOST", path);
        if (host.startsWith(".") || host.endsWith(".") || host.includes("..")) fail("WIRE_URL_HOST", path);
    }
    if (port !== undefined) {
        if (!/^[0-9]+$/.test(port)) fail("WIRE_URL_PORT", path);
        const n = Number(port);
        if (!Number.isSafeInteger(n) || n < 1 || n > 65535) fail("WIRE_URL_PORT", path);
    }
    return raw;
}

export const validateHttpOrigin = (value: unknown, path = "url"): string =>
    validateOrigin(value, ["http", "https"], path);
export const validateWebSocketOrigin = (value: unknown, path = "url"): string =>
    validateOrigin(value, ["ws", "wss"], path);
export const isHttpOrigin = (value: unknown): value is string => {
    try { validateHttpOrigin(value); return true; } catch { return false; }
};
export const isWebSocketOrigin = (value: unknown): value is string => {
    try { validateWebSocketOrigin(value); return true; } catch { return false; }
};

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

// ---------------- optional/reference HTTP payloads ----------------

/** `/admin/kick` 参考端点的请求/响应（默认由服务端密钥保护）。 */
export interface IAdminKickReq {
    uid: string;
    reason?: "banned" | "revoked";
}

export interface IAdminKickRes {
    kicked: boolean;
}

/** `/pay/wx-notify` 参考端点的请求/响应。 */
export interface IPayWxNotifyReq {
    orderId: string;
    wxTxnId: string;
    amountFen: number;
}

export interface IPayWxNotifyRes {
    code: "SUCCESS";
}

const HTTP_MAX_NOTICE_ITEMS = 100;
const HTTP_MAX_AREA_SERVERS = 1000;
const HTTP_MAX_USER_IDS = 1000;

function validateNoBody(input: unknown): Record<string, never> {
    assertExactKeys(input, [], [], "request");
    return {};
}

function validateHealthResponse(input: unknown): IHealthRes {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["status", "serverTime", "version"], [], "response");
    if (value.status !== "ok") fail("HTTP_STATUS", "response.status");
    return {
        status: "ok",
        serverTime: finiteInteger(value.serverTime, "response.serverTime", 0),
        version: boundedString(value.version, "response.version", 1, 64),
    };
}

function validateVersionResponse(input: unknown): IVersionRes {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["name", "protocol"], [], "response");
    return {
        name: boundedString(value.name, "response.name", 1, 64),
        protocol: finiteInteger(value.protocol, "response.protocol", 1, 0xffff),
    };
}

function validateClockResponse(input: unknown): IClockNowRes {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["serverTime"], [], "response");
    return { serverTime: finiteInteger(value.serverTime, "response.serverTime", 0) };
}

function validateNoticeItem(input: unknown, index: number): INoticeItem {
    const path = `response.list[${index}]`;
    const value = objectAt(input, path);
    assertExactKeys(value, ["id", "category", "title", "desc", "content", "at"], [], path);
    if (value.category !== "activity" && value.category !== "notice" && value.category !== "maintain") {
        fail("HTTP_NOTICE_CATEGORY", `${path}.category`);
    }
    return {
        id: finiteInteger(value.id, `${path}.id`, 1),
        category: value.category as INoticeItem["category"],
        title: boundedString(value.title, `${path}.title`, 1, 256),
        desc: boundedString(value.desc, `${path}.desc`, 0, 2048),
        content: boundedString(value.content, `${path}.content`, 0, 64 * 1024),
        at: finiteInteger(value.at, `${path}.at`, 0),
    };
}

function validateNoticeListResponse(input: unknown): INoticeListRes {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["list"], [], "response");
    const list = arrayAt(value.list, "response.list", HTTP_MAX_NOTICE_ITEMS);
    return { list: list.map((item, i) => validateNoticeItem(item, i)) };
}

function validateAdminKickRequest(input: unknown): IAdminKickReq {
    const value = objectAt(input, "request");
    assertExactKeys(value, ["uid"], ["reason"], "request");
    const reason = optionalString(value, "reason", "request", 16);
    if (reason !== undefined && reason !== "banned" && reason !== "revoked") {
        fail("HTTP_KICK_REASON", "request.reason");
    }
    const uid = boundedString(value.uid, "request.uid", 1, 128);
    if (reason === undefined) return { uid };
    return { uid, reason: reason as "banned" | "revoked" };
}

function validateAdminKickResponse(input: unknown): IAdminKickRes {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["kicked"], [], "response");
    if (typeof value.kicked !== "boolean") fail("HTTP_BOOLEAN", "response.kicked");
    return { kicked: value.kicked as boolean };
}

function validatePayWxNotifyRequest(input: unknown): IPayWxNotifyReq {
    const value = objectAt(input, "request");
    assertExactKeys(value, ["orderId", "wxTxnId", "amountFen"], [], "request");
    return {
        orderId: boundedString(value.orderId, "request.orderId", 1, 64),
        wxTxnId: boundedString(value.wxTxnId, "request.wxTxnId", 1, 64),
        amountFen: finiteInteger(value.amountFen, "request.amountFen", 1, Number.MAX_SAFE_INTEGER),
    };
}

function validatePayWxNotifyResponse(input: unknown): IPayWxNotifyRes {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["code"], [], "response");
    if (value.code !== "SUCCESS") fail("HTTP_PAY_CODE", "response.code");
    return { code: "SUCCESS" };
}

// ---------------- WebPlatform Public payloads ----------------

function validateDeviceId(value: unknown, path: string): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    // OpenAPI permits an empty optional device id, but caps it at 64 bytes/chars.
    return boundedString(value, path, 0, 64);
}

function validateServerId(value: unknown, path: string): number {
    return finiteInteger(value, path, 0, 0xffff);
}

function validateDevKey(value: unknown, path: string): string {
    const devKey = boundedString(value, path, 1, 32);
    if (!/^[a-zA-Z0-9_-]+$/.test(devKey)) fail("HTTP_DEV_KEY", path);
    return devKey;
}

export function validateWebPlatformDevLoginRequest(input: unknown): { devKey: string; serverId: number; deviceId?: string | null } {
    const value = objectAt(input, "request");
    assertExactKeys(value, ["devKey", "serverId"], ["deviceId"], "request");
    const deviceId = validateDeviceId(value.deviceId, "request.deviceId");
    return {
        devKey: validateDevKey(value.devKey, "request.devKey"),
        serverId: validateServerId(value.serverId, "request.serverId"),
        ...(deviceId === undefined ? {} : { deviceId }),
    };
}

export function validateWebPlatformWxLoginRequest(input: unknown): { code: string; serverId: number; deviceId?: string | null } {
    const value = objectAt(input, "request");
    assertExactKeys(value, ["code", "serverId"], ["deviceId"], "request");
    const deviceId = validateDeviceId(value.deviceId, "request.deviceId");
    return {
        code: boundedString(value.code, "request.code", 1, 128),
        serverId: validateServerId(value.serverId, "request.serverId"),
        ...(deviceId === undefined ? {} : { deviceId }),
    };
}

/** WebPlatform Internal session verification request (server-to-server only). */
export function validateWebPlatformVerifySessionRequest(input: unknown): VerifySessionRequest {
    const value = objectAt(input, "request");
    assertExactKeys(value, ["accessToken", "serverId"], [], "request");
    return {
        accessToken: boundedString(value.accessToken, "request.accessToken", 1, 256),
        serverId: validateServerId(value.serverId, "request.serverId"),
    };
}

export function validateWebPlatformLoginResponse(input: unknown): WebPlatformLoginResponse {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["userId", "accessToken", "isNewAccount"], [], "response");
    if (typeof value.isNewAccount !== "boolean") fail("HTTP_BOOLEAN", "response.isNewAccount");
    return {
        userId: boundedString(value.userId, "response.userId", 1, 128),
        accessToken: boundedString(value.accessToken, "response.accessToken", 1, 256),
        isNewAccount: value.isNewAccount as boolean,
    };
}

const WEBPLATFORM_VERIFY_REASONS = [
    "NOT_FOUND",
    "MISMATCH",
    "BANNED",
    "DEREGISTERED",
    "EXPIRED",
] as const;
type WebPlatformVerifyReason = (typeof WEBPLATFORM_VERIFY_REASONS)[number];

/** WebPlatform Internal verify response; valid=true/false are intentionally disjoint. */
export function validateWebPlatformVerifySessionResponse(input: unknown): VerifySessionResponse {
    const value = objectAt(input, "response");
    if (value.valid === true) {
        assertExactKeys(value, ["valid", "userId", "issuedAtMs"], [], "response");
        return {
            valid: true,
            userId: boundedString(value.userId, "response.userId", 1, 128),
            issuedAtMs: finiteInteger(value.issuedAtMs, "response.issuedAtMs", 0),
        };
    }
    if (value.valid === false) {
        assertExactKeys(value, ["valid", "reason"], [], "response");
        if (!(WEBPLATFORM_VERIFY_REASONS as readonly unknown[]).includes(value.reason)) {
            fail("HTTP_VERIFY_REASON", "response.reason");
        }
        return { valid: false, reason: value.reason as WebPlatformVerifyReason };
    }
    return fail("HTTP_VERIFY_VALID", "response.valid");
}

/** Internal character registration response. */
export function validateWebPlatformRegisterCharacterResponse(input: unknown): RegisterCharacterResponse {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["registered"], [], "response");
    if (value.registered !== true) fail("HTTP_REGISTERED", "response.registered");
    return { registered: true };
}

/** Internal character existence response. */
export function validateWebPlatformHasCharacterResponse(input: unknown): HasCharacterResponse {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["exists"], [], "response");
    if (typeof value.exists !== "boolean") fail("HTTP_BOOLEAN", "response.exists");
    return { exists: value.exists as boolean };
}

function validateWebPlatformAreaServer(input: unknown, index: number): WebPlatformAreaServer {
    const path = `response.servers[${index}]`;
    const value = objectAt(input, path);
    assertExactKeys(value, ["serverId", "name", "status", "tag", "openTime", "gameHttpUrl", "gameWsUrl"], [], path);
    if (value.status !== "smooth" && value.status !== "busy" && value.status !== "maintenance") {
        fail("HTTP_AREA_STATUS", `${path}.status`);
    }
    if (value.tag !== "normal" && value.tag !== "new" && value.tag !== "full" && value.tag !== "maintenance") {
        fail("HTTP_AREA_TAG", `${path}.tag`);
    }
    return {
        serverId: validateServerId(value.serverId, `${path}.serverId`),
        name: boundedString(value.name, `${path}.name`, 1, 64),
        status: value.status as WebPlatformAreaServer["status"],
        tag: value.tag as WebPlatformAreaServer["tag"],
        openTime: finiteInteger(value.openTime, `${path}.openTime`, 0),
        gameHttpUrl: validateHttpOrigin(value.gameHttpUrl, `${path}.gameHttpUrl`),
        gameWsUrl: validateWebSocketOrigin(value.gameWsUrl, `${path}.gameWsUrl`),
    };
}

export function validateWebPlatformAreaListResponse(input: unknown): WebPlatformAreaListResponse {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["hash", "isOps", "myServerIds", "servers"], [], "response");
    if (typeof value.isOps !== "boolean") fail("HTTP_BOOLEAN", "response.isOps");
    const ids = arrayAt(value.myServerIds, "response.myServerIds", HTTP_MAX_USER_IDS);
    const myServerIds = ids.map((id, i) => validateServerId(id, `response.myServerIds[${i}]`));
    const serversInput = arrayAt(value.servers, "response.servers", HTTP_MAX_AREA_SERVERS);
    const servers = serversInput.map((item, i) => validateWebPlatformAreaServer(item, i));
    const seen = new Set<number>();
    for (const server of servers) {
        if (seen.has(server.serverId)) fail("HTTP_AREA_DUPLICATE", "response.servers");
        seen.add(server.serverId);
    }
    return {
        hash: boundedString(value.hash, "response.hash", 1, 256),
        isOps: value.isOps as boolean,
        myServerIds,
        servers,
    };
}

/** WebPlatform `/livez`、`/readyz` 的小型公共响应校验，供健康探针复用。 */
export function validateWebPlatformLiveResponse(input: unknown): { ok: true } {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["ok"], [], "response");
    if (value.ok !== true) fail("HTTP_HEALTH", "response.ok");
    return { ok: true };
}

export function validateWebPlatformReadyResponse(input: unknown): { ready: boolean } {
    const value = objectAt(input, "response");
    assertExactKeys(value, ["ready"], [], "response");
    if (typeof value.ready !== "boolean") fail("HTTP_BOOLEAN", "response.ready");
    return { ready: value.ready as boolean };
}

// ---------------- contract maps ----------------

export type HttpMethod = "GET" | "POST" | "PUT";
export type HttpAuthClass = "none" | "game" | "portal" | "portalOptional" | "internal";

export interface HttpContract<TRequest = unknown, TResponse = unknown> {
    readonly method: HttpMethod;
    readonly path: string;
    readonly auth: HttpAuthClass;
    readonly request: RuntimeValidator<TRequest>;
    readonly response: RuntimeValidator<TResponse>;
}

/** 游戏服 HTTP 的唯一运行时契约表。 */
export const GameHttpContractMap = {
    Health: { method: "GET", path: ApiPath.Health, auth: "none", request: validateNoBody, response: validateHealthResponse },
    Version: { method: "GET", path: ApiPath.Version, auth: "none", request: validateNoBody, response: validateVersionResponse },
    ClockNow: { method: "GET", path: ApiPath.ClockNow, auth: "none", request: validateNoBody, response: validateClockResponse },
    NoticeList: { method: "GET", path: ApiPath.NoticeList, auth: "none", request: validateNoBody, response: validateNoticeListResponse },
    AdminKick: { method: "POST", path: ApiPath.AdminKick, auth: "internal", request: validateAdminKickRequest, response: validateAdminKickResponse },
    PayWxNotify: { method: "POST", path: ApiPath.PayWxNotify, auth: "internal", request: validatePayWxNotifyRequest, response: validatePayWxNotifyResponse },
} as const;

export type GameHttpContractKey = keyof typeof GameHttpContractMap;
export type GameHttpContract = (typeof GameHttpContractMap)[GameHttpContractKey];

/** WebPlatform Public 的本仓 consumer 子集；生成契约全集不会被误当成游戏仓能力。 */
export const WebPlatformHttpContractMap = {
    DevLogin: { method: WebPlatformMethod.DevLogin, path: WebPlatformPath.DevLogin, auth: "portal", request: validateWebPlatformDevLoginRequest, response: validateWebPlatformLoginResponse },
    WxLogin: { method: WebPlatformMethod.WxLogin, path: WebPlatformPath.WxLogin, auth: "portal", request: validateWebPlatformWxLoginRequest, response: validateWebPlatformLoginResponse },
    ListAreas: { method: WebPlatformMethod.ListAreas, path: WebPlatformPath.ListAreas, auth: "portalOptional", request: validateNoBody, response: validateWebPlatformAreaListResponse },
    VerifySession: { method: WebPlatformMethod.VerifySession, path: WebPlatformPath.VerifySession, auth: "internal", request: validateWebPlatformVerifySessionRequest, response: validateWebPlatformVerifySessionResponse },
    RegisterCharacter: { method: WebPlatformMethod.RegisterCharacter, path: WebPlatformPath.RegisterCharacter, auth: "internal", request: validateNoBody, response: validateWebPlatformRegisterCharacterResponse },
    HasCharacter: { method: WebPlatformMethod.HasCharacter, path: WebPlatformPath.HasCharacter, auth: "internal", request: validateNoBody, response: validateWebPlatformHasCharacterResponse },
    Livez: { method: WebPlatformMethod.Livez, path: WebPlatformPath.Livez, auth: "none", request: validateNoBody, response: validateWebPlatformLiveResponse },
    Readyz: { method: WebPlatformMethod.Readyz, path: WebPlatformPath.Readyz, auth: "none", request: validateNoBody, response: validateWebPlatformReadyResponse },
} as const;

export type WebPlatformHttpContractKey = keyof typeof WebPlatformHttpContractMap;
export type WebPlatformHttpContract = (typeof WebPlatformHttpContractMap)[WebPlatformHttpContractKey];

function findContract<T extends { method: string; path: string }>(
    map: Record<string, T>, method: string, path: string,
): T | undefined {
    for (const contract of Object.values(map)) {
        if (contract.method === method && contract.path === path) return contract;
    }
    return undefined;
}

export function gameHttpContract(method: string, path: string): GameHttpContract | undefined {
    return findContract(GameHttpContractMap, method, path) as GameHttpContract | undefined;
}

export function webPlatformHttpContract(method: string, path: string): WebPlatformHttpContract | undefined {
    return findContract(WebPlatformHttpContractMap, method, path) as WebPlatformHttpContract | undefined;
}
