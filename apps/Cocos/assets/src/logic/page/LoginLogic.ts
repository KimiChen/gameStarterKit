/**
 * 登录页面逻辑（纯 TS，无头单测）——真实登录 + 进度。
 *
 * 登录经依赖注入：生产接 net/http/account.devLogin（本地）或 wxLogin（微信侧接入后），
 * 出参统一 shared ILoginRes（铁律 6：⛔ 不自定义登录结果形状）。导航在 view 层。
 * 进度 0~1 驱动登录页进度条与文案。
 *
 * ⚠ **BUSY 单次退避重试**（评审 [11]）：登录与冷档 freeze/thaw 抢**同一把** per-uid 锁（09·L1
 * 禁第二把），而 freeze/thaw 开看门狗可按秒持有、登录抢锁预算只有 ~350–500ms ⇒ 会吃到硬 409。
 * 这不是「登录失败」而是「稍后会好」，故：先自动退避重试一次，仍 BUSY 才如实报「系统繁忙」。
 */
import type { ILoginRes, RpcErrCode } from "../../shared/index";

export interface ILoginDeps {
    /** 生产 = (key) => devLogin(key)（或 wxLogin(code)）；失败 reject/返回 null 均按失败处理 */
    login(key: string): Promise<ILoginRes | null>;
}

/** 错误码字面量走 shared 联合类型收口（铁律 6：⛔ 不手写裸字符串，改名即编译红）。 */
const BUSY: RpcErrCode = "BUSY";

/**
 * BUSY 的单次退避重试延迟（ms）。服务端登录抢锁预算 ~350–500ms（LOCK_RETRY_MAX=3，退避 50/100/200），
 * 故这里等得更久一点再试，让上一个持锁者有机会释放。
 */
const BUSY_RETRY_DELAY_MS = 600;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 服务端 BUSY = 同 uid 的**登录锁**被占：并发顶号，或该号正在冷档 freeze/thaw
 * （09·L1 只允许一把 per-uid 锁，登录与 freeze/thaw 抢同一把）。dev-login/wx-login 端点映射成 409。
 * ⚠ 鸭子判别而非 `instanceof HttpError`：logic/ 不能依赖 core/http（那边用 XHR，无头单测里没有）。
 */
function isBusy(e: unknown): boolean {
    const o = e as { status?: number; code?: string } | null;
    return !!o && typeof o === "object" && (o.status === 409 || o.code === BUSY);
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
        let a = await this.attempt(key);
        if (a.busy) {
            // ⚠ 只重试**一次**：BUSY 可重试，但无界重试会把「该号正在 freeze/thaw」变成登录风暴
            // （09·L5 禁轮询的同精神）。仍失败就把「系统繁忙」如实告诉用户，由他决定再点。
            this.onProgress(0.1, "系统繁忙，正在重试…");
            await sleep(BUSY_RETRY_DELAY_MS);
            a = await this.attempt(key);
        }
        if (!a.res) {
            // 文案分两类：BUSY = 稍后会好（别让用户以为账号有问题）；其余 = 登录失败
            this.onProgress(0, a.busy ? "系统繁忙，请稍后重试" : "登录失败，请重试");
            return null;
        }
        const r = a.res;
        this.result = r;
        // 账号验证只是链路前 40%：后续进大厅/拉档案由编排层（view/pages）继续推进到 1
        this.onProgress(0.4, "账号验证成功");
        return r;
    }

    /** 单次登录尝试：把「失败」再分成 BUSY（可重试）与其余（不重试）。deps 返回 null 也算失败。 */
    private async attempt(key: string): Promise<{ res: ILoginRes | null; busy: boolean }> {
        try {
            return { res: await this.deps.login(key), busy: false };
        } catch (e) {
            return { res: null, busy: isBusy(e) };
        }
    }
}
