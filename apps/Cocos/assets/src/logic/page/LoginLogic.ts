/**
 * 登录页面逻辑（纯 TS，无头单测）——真实登录 + 进度。
 *
 * 登录经依赖注入：生产接 net/http/account.devLogin（本地）或 wxLogin（微信侧接入后），
 * 出参统一 shared ILoginRes（铁律 6：⛔ 不自定义登录结果形状）。导航在 view 层。
 * 进度 0~1 驱动登录页进度条与文案。
 */
import type { ILoginRes } from "../../shared/index";

export interface ILoginDeps {
    /** 生产 = (key) => devLogin(key)（或 wxLogin(code)）；失败 reject/返回 null 均按失败处理 */
    login(key: string): Promise<ILoginRes | null>;
}

export class LoginLogic {
    /** 进行中的登录（并发重复点合流到同一次请求，双方拿同一结果） */
    private inflight: Promise<ILoginRes | null> | null = null;
    private result: ILoginRes | null = null;

    /** 进度回调（0~1 + 文案）——view 刷新进度条/txt_progress */
    onProgress: (ratio: number, text: string) => void = () => {};

    constructor(private readonly deps: ILoginDeps) {}

    get token(): string {
        return this.result?.token ?? "";
    }

    get userId(): string {
        return this.result?.userId ?? "";
    }

    get isNew(): boolean {
        return this.result?.isNew ?? false;
    }

    /** 点「进入游戏」：登录。并发重复点合流（同一结果）。成功 resolve ILoginRes，失败 resolve null。 */
    doLogin(key: string): Promise<ILoginRes | null> {
        if (this.inflight) return this.inflight;
        const p = this.run(key);
        this.inflight = p;
        // ⛔ 不用 .finally：客户端 lib 钉 ES2017（铁律 4），finally 是 ES2018
        const clear = () => { if (this.inflight === p) this.inflight = null; };
        p.then(clear, clear);
        return p;
    }

    private async run(key: string): Promise<ILoginRes | null> {
        this.onProgress(0.1, "正在连接服务器…");
        const r = await this.deps.login(key).catch(() => null);
        if (!r) {
            this.onProgress(0, "登录失败，请重试");
            return null;
        }
        this.result = r;
        // 账号验证只是链路前 40%：后续进大厅/拉档案由编排层（view/pages）继续推进到 1
        this.onProgress(0.4, "账号验证成功");
        return r;
    }
}
