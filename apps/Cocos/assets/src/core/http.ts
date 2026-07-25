/**
 * XHR 请求底座 + token 存取（平台桥基建，原 net/HttpApi.ts 的底层部分）。
 *
 * 用 XHR 而不用 fetch：微信小游戏没有 fetch，而 Cocos 微信适配层提供 XHR 包装
 * （wx.request），XHR 在 Web 预览 / 微信 / 原生三端行为一致。
 * 业务调用面在 net/http/（真实接口）——本文件只管收发。
 */
let baseUrl = "http://localhost:2568";
let portalUrl = "";
let token = "";

/**
 * 非 2xx 的结构化错误：**状态码与服务端错误码是可判别字段**，不是 message 里的字符串。
 *
 * ⚠ 曾经只 reject 一个拼好的 `Error("[http] HTTP 409 …")`：业务层想区分「系统繁忙可重试」
 * 与「登录失败」就只能正则抠 message —— 于是全都被 `.catch(() => null)` 抹平成同一个失败。
 * 端点错误体统一是 `{ error: <ErrCode> }`（见 http/account/*.ts），故这里解出来放 `code`。
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

/** 从错误体 `{ error: "BUSY" }` 取码；非 JSON / 无该字段 → 空串（⛔ 不抛，调用方在错误路径上）。 */
function errCodeOf(text: string | undefined): string {
    try {
        const c = (JSON.parse(text ?? "") as { error?: unknown }).error;
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
 * 初始化**门户地址**（账号服务 WebPlatform：登录 + 选服 /area/list）。DUAL_MODE §2.7：
 * dev/内嵌单机 = 与游戏服同址（留空即回退 baseUrl，行为不变）；prod-split = 独立 WebPlatform 域名。
 * 游戏服 WS（大厅）与区服 WS 仍连各自地址，⛔ 不走门户。
 */
export function initPortal(url: string): void {
    portalUrl = url.replace(/\/+$/, "");
}

/** 门户地址：留空则跟随游戏服 baseUrl（内嵌单机同址）。 */
export function getPortalUrl(): string {
    return portalUrl || baseUrl;
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
 * 门户请求（登录 / 选服 → WebPlatform）。split 部署时命中门户地址，dev/内嵌回退游戏服（同 request）。
 * ⚠ 登录/选服的凭据在 body 内（选服 token、登录无 token），Bearer 头顺带无害（门户端点不读它）。
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
