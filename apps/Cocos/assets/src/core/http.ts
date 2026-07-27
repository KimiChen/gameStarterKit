/**
 * XHR 请求底座 + token 存取（平台桥基建，原 net/HttpApi.ts 的底层部分）。
 *
 * 用 XHR 而不用 fetch：微信小游戏没有 fetch，而 Cocos 微信适配层提供 XHR 包装
 * （wx.request），XHR 在 Web 预览 / 微信 / 原生三端行为一致。
 * 业务调用面在 net/http/（真实接口）——本文件只管收发。
 */
let baseUrl = "http://localhost:2568";
let portalUrl: string | null = null;
let token = "";

/**
 * 非 2xx 的结构化错误：**状态码与服务端错误码是可判别字段**，不是 message 里的字符串。
 *
 * ⚠ 曾经只 reject 一个拼好的 `Error("[http] HTTP 409 …")`：业务层想区分「系统繁忙可重试」
 * 与「登录失败」就只能正则抠 message —— 于是全都被 `.catch(() => null)` 抹平成同一个失败。
 * WebPlatform v1 错误体是 `{ code, requestId }`；游戏服现有端点仍可能返回 `{ error }`。
 * 两者都解到同一个 `code` 字段，业务层不需要解析 message。
 */
export class HttpError extends Error {
    constructor(
        msg: string,
        /** HTTP 状态码；网络错误/超时为 0。 */
        readonly status: number,
        /** 服务端错误码（`{error}` 体解出，如 BUSY / RATE_LIMITED）；无则空串。 */
        readonly code: string,
    ) {
        super(msg);
        this.name = "HttpError";
    }
}

/** 从错误体 `{ code }` / `{ error }` 取码；非 JSON / 无字段 → 空串（⛔ 不抛，调用方在错误路径上）。 */
function errCodeOf(text: string | undefined): string {
    try {
        const body = JSON.parse(text ?? "") as { code?: unknown; error?: unknown };
        const c = typeof body.code === "string" ? body.code : body.error;
        return typeof c === "string" ? c : "";
    } catch {
        return "";
    }
}

/** 初始化服务器地址，如 https://game.example.com（尾部斜杠自动去除） */
export function initHttp(url: string): void {
    baseUrl = url.replace(/\/+$/, "");
}

/** 当前服务器地址（WebSocketClient 等复用同一 endpoint，不各自持有配置） */
export function getBaseUrl(): string {
    return baseUrl;
}

/**
 * 初始化独立 WebPlatform Public 地址（登录 + 选服）。
 *
 * HTTP-only 拆仓后 Portal 是必填启动配置：空值或非 http(s) 地址立即失败，
 * ⛔ 不再回退游戏服 baseUrl，否则配置遗漏会把账号请求静默打到错误进程。
 */
export function initPortal(url: string): void {
    portalUrl = null;
    const normalized = url.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^/]/i.test(normalized)) {
        throw new Error("[http] WebPlatform portalUrl 必填，且必须是 http(s) 绝对地址");
    }
    portalUrl = normalized;
}

/** 当前 WebPlatform Public 地址；初始化缺失时 fail-fast，绝不猜测游戏服地址。 */
export function getPortalUrl(): string {
    if (!portalUrl) {
        throw new Error("[http] WebPlatform portalUrl 尚未初始化");
    }
    return portalUrl;
}

/** 保存登录 token（后续请求自动带 Authorization: Bearer 头） */
export function setToken(t: string): void {
    token = t;
}

export function getToken(): string {
    return token;
}

/**
 * 发起 JSON 请求，返回解析后的响应体（原样，不假设外层结构）。
 * 真实端点直接返回数据体，用 `request<数据体类型>`（契约 import 自 shared）。
 * 非 2xx / 响应解析失败 / 网络错误 / 超时一律 reject。
 */
export function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    return doRequest(baseUrl, method, path, body);
}

/**
 * 门户请求（登录 / 选服 → WebPlatform Public）。选服通过已有 token 自动携带 Bearer；
 * 登录时本地尚无 token，不会附带 Authorization。
 */
export function portalRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    return doRequest(getPortalUrl(), method, path, body);
}

function doRequest<T>(base: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, base + path);
        xhr.timeout = 10000;
        xhr.setRequestHeader("Content-Type", "application/json");
        if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }
        xhr.onload = () => {
            // ⚠ onload 只代表「收到了响应」：401/403/429/500 也会走到这——必须先验状态码，
            // 否则错误体被 JSON.parse 后当正常数据 resolve，业务层拿着错误对象继续跑（曾是真实 bug）
            if (xhr.status < 200 || xhr.status >= 300) {
                const body = xhr.responseText?.slice(0, 200);
                reject(new HttpError(`[http] HTTP ${xhr.status} ${method} ${path}: ${body}`,
                    xhr.status, errCodeOf(xhr.responseText)));
                return;
            }
            try {
                resolve(JSON.parse(xhr.responseText) as T);
            } catch (e) {
                reject(new HttpError(`[http] 响应解析失败 ${method} ${path}: ${xhr.responseText?.slice(0, 200)}`, xhr.status, ""));
            }
        };
        xhr.onerror = () => reject(new HttpError(`[http] 请求失败 ${method} ${path} (status=${xhr.status})`, 0, ""));
        xhr.ontimeout = () => reject(new HttpError(`[http] 请求超时 ${method} ${path}`, 0, ""));
        xhr.send(body != null ? JSON.stringify(body) : undefined);
    });
}
