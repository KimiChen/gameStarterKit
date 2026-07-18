/**
 * 登录页面逻辑（纯 TS，无头单测）——mock 登录 + 进度。
 *
 * 登录本身经依赖注入（生产接 net/mock/login.login）；导航（打开选服/公告/主界面）在 view 层。
 * 进度 0~1 驱动登录页进度条与文案。
 */
export interface ILoginResult {
    openId: string;
    token: string;
    isNew: boolean;
}

export interface ILoginDeps {
    /** 生产 = (code) => login(code).then(r => r.data)；失败返回 null */
    login(code: string): Promise<ILoginResult | null>;
}

export class LoginLogic {
    private loggingIn = false;
    private result: ILoginResult | null = null;

    /** 进度回调（0~1 + 文案）——view 刷新进度条/txt_progress */
    onProgress: (ratio: number, text: string) => void = () => {};

    constructor(private readonly deps: ILoginDeps) {}

    get token(): string {
        return this.result?.token ?? "";
    }

    get isNew(): boolean {
        return this.result?.isNew ?? false;
    }

    /** 点「进入游戏」：登录（幂等，重复点忽略）。成功 resolve token，失败 resolve null。 */
    async doLogin(code = "wx-mock-code"): Promise<string | null> {
        if (this.loggingIn) return this.token || null;
        this.loggingIn = true;
        this.onProgress(0.1, "正在连接服务器…");
        try {
            const r = await this.deps.login(code);
            if (!r) {
                this.onProgress(0, "登录失败，请重试");
                return null;
            }
            this.result = r;
            this.onProgress(1, "登录成功");
            return r.token;
        } finally {
            this.loggingIn = false;
        }
    }
}
