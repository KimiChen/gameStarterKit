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
                reject(new Error(`[http] HTTP ${xhr.status} ${method} ${path}: ${xhr.responseText?.slice(0, 200)}`));
                return;
            }
            try {
                resolve(JSON.parse(xhr.responseText) as T);
            } catch (e) {
                reject(new Error(`[http] 响应解析失败 ${method} ${path}: ${xhr.responseText?.slice(0, 200)}`));
            }
        };
        xhr.onerror = () => reject(new Error(`[http] 请求失败 ${method} ${path} (status=${xhr.status})`));
        xhr.ontimeout = () => reject(new Error(`[http] 请求超时 ${method} ${path}`));
        xhr.send(body != null ? JSON.stringify(body) : undefined);
    });
}
