/**
 * HTTP 模拟接口客户端 —— 基于 XMLHttpRequest。
 *
 * 用 XHR 而不用 fetch：微信小游戏没有 fetch，而 Cocos 微信适配层提供 XHR 包装
 * （wx.request），XHR 在 Web 预览 / 微信 / 原生三端行为一致。
 * 路径与请求/响应类型全部来自双端共享的 shared/protocol/http.ts。
 */
import {
    ApiPath,
    ErrorCode,
    type IApiResponse,
    type ILoginReq,
    type ILoginRes,
    type IPlayerProfile,
    type IRankRes,
    type IHealthRes,
} from "../shared/index";

export class HttpApi {
    private static _baseUrl = "http://localhost:2568";
    private static _token = "";

    /** 初始化服务器地址，如 https://game.example.com */
    static init(baseUrl: string): void {
        this._baseUrl = baseUrl.replace(/\/+$/, "");
    }

    static get token(): string {
        return this._token;
    }

    // ---------------- 业务接口 ----------------

    /** 登录（mock：任意 code 都成功），成功后自动保存 token */
    static async login(code: string): Promise<IApiResponse<ILoginRes>> {
        const body: ILoginReq = { code };
        const res = await this.request<ILoginRes>("POST", ApiPath.Login, body);
        if (res.code === ErrorCode.Ok && res.data) {
            this._token = res.data.token;
        }
        return res;
    }

    /** 拉取玩家档案（需先 login） */
    static profile(): Promise<IApiResponse<IPlayerProfile>> {
        return this.request<IPlayerProfile>("GET", ApiPath.Profile);
    }

    /** 排行榜 */
    static rank(): Promise<IApiResponse<IRankRes>> {
        return this.request<IRankRes>("GET", ApiPath.Rank);
    }

    /** 健康检查 */
    static health(): Promise<IApiResponse<IHealthRes>> {
        return this.request<IHealthRes>("GET", ApiPath.Health);
    }

    // ---------------- 底层请求 ----------------

    private static request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<IApiResponse<T>> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, this._baseUrl + path);
            xhr.timeout = 10000;
            xhr.setRequestHeader("Content-Type", "application/json");
            if (this._token) {
                xhr.setRequestHeader("Authorization", `Bearer ${this._token}`);
            }
            xhr.onload = () => {
                try {
                    resolve(JSON.parse(xhr.responseText) as IApiResponse<T>);
                } catch (e) {
                    reject(new Error(`[HttpApi] 响应解析失败 ${method} ${path}: ${xhr.responseText?.slice(0, 200)}`));
                }
            };
            xhr.onerror = () => reject(new Error(`[HttpApi] 请求失败 ${method} ${path} (status=${xhr.status})`));
            xhr.ontimeout = () => reject(new Error(`[HttpApi] 请求超时 ${method} ${path}`));
            xhr.send(body != null ? JSON.stringify(body) : undefined);
        });
    }
}
