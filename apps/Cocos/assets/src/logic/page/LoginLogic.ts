/**
 * 登录页面逻辑（纯 TS，无头单测）——真实登录 + 进度。
 *
 * 登录经依赖注入：生产接 net/http/account.devLogin（本地）或 wxLogin（微信侧接入后），
 * 出参统一使用生成的 WebPlatformLoginResponse（铁律 6：⛔ 不自定义登录结果形状）。导航在 view 层。
 * 进度 0~1 驱动登录页进度条与文案。
 * 登录会签发/轮换 token，客户端不得自动重试；失败后由用户明确再次发起。
 */
import type { WebPlatformAreaServer, WebPlatformLoginResponse } from "../../shared/index";

export interface ILoginDeps {
    /** 生产 = (key) => devLogin(key)（或 wxLogin(code)）；失败 reject/返回 null 均按失败处理 */
    login(key: string): Promise<WebPlatformLoginResponse | null>;
}

export type LoginContinuation = (response: WebPlatformLoginResponse) => Promise<void> | void;

/**
 * Dependencies for the post-authentication boundary.  The composition root
 * supplies the real WebSocket client and session module; keeping the ports
 * here makes the failure/rollback contract testable without importing Cocos
 * or FairyGUI into the logic layer.
 */
export interface AuthenticatedLoginFlowDeps<TUser extends { readonly uid: string }> {
    setSession(response: WebPlatformLoginResponse): void;
    join(accessToken: string, signal?: AbortSignal): Promise<void>;
    getInfo(): Promise<{ user: TUser | null | undefined }>;
    /** Commit only when this flow still owns the captured session generation. */
    commitProfile(user: TUser): boolean;
    clearSession(): void;
    leave(): Promise<void> | void;
    /** Return false when a newer page/session owns the state; skip rollback. */
    shouldRollback?: () => boolean;
}

/** Narrow transport port for joining the Lobby advertised by one directory row. */
export interface SelectedServerLobbyPort {
    init(endpoint: string): void;
    join(accessToken: string, options: { sId: number }, signal?: AbortSignal): Promise<void>;
}

/**
 * Join Lobby using one selected-directory snapshot.  Reading both the endpoint
 * and server id before the first await prevents a concurrent directory change
 * from combining one zone's token/id with another zone's websocket endpoint.
 */
export async function joinSelectedServerLobby(
    server: Pick<WebPlatformAreaServer, "serverId" | "gameWsUrl">,
    accessToken: string,
    port: SelectedServerLobbyPort,
    signal?: AbortSignal,
): Promise<void> {
    const endpoint = server.gameWsUrl;
    const sId = server.serverId;
    port.init(endpoint);
    await port.join(accessToken, { sId }, signal);
}

/**
 * Complete the session after the Portal has issued a token.  A successful
 * result always contains a concrete user profile.  Any join/GetInfo failure
 * rolls back both the bearer/session state and the physical lobby connection,
 * so callers can never navigate with a half-established session.
 */
export async function runAuthenticatedLoginFlow<TUser extends { readonly uid: string }>(
    response: WebPlatformLoginResponse,
    deps: AuthenticatedLoginFlowDeps<TUser>,
    signal?: AbortSignal,
): Promise<TUser> {
    try {
        deps.setSession(response);
        await deps.join(response.accessToken, signal);
        const info = await deps.getInfo();
        if (!info || info.user === null || info.user === undefined) {
            throw new Error("登录成功但角色档案为空");
        }
        if (info.user.uid !== response.userId) {
            throw new Error("角色档案身份与登录会话不一致");
        }
        if (!deps.commitProfile(info.user)) {
            throw new Error("登录事务已失效");
        }
        return info.user;
    } catch (error) {
        let shouldRollback = true;
        try { shouldRollback = deps.shouldRollback?.() ?? true; } catch {
            // A stale/disposed page must not let a hostile lifecycle probe make
            // us clear a newer session; still release the physical room below.
            shouldRollback = false;
        }
        if (shouldRollback) {
            // Rollback is best-effort, but the original join/GetInfo failure is
            // the useful error for progress/UI and must remain observable.
            try { deps.clearSession(); } catch { /* preserve original failure */ }
            try { await deps.leave(); } catch { /* connection cleanup is best-effort */ }
        }
        // Without an ownership token, an invalidated page must not call the
        // global leave() at all: it may now refer to a newer session's slot.
        throw error;
    }
}

export class LoginLogic {
    /** 进行中的登录（并发重复点合流到同一次请求，双方拿同一结果） */
    private inflight: Promise<WebPlatformLoginResponse | null> | null = null;
    /** 覆盖登录后置步骤（Lobby/GetInfo/Home）的整段事务锁。 */
    private flowInflight: Promise<WebPlatformLoginResponse | null> | null = null;
    private result: WebPlatformLoginResponse | null = null;

    /** 进度回调（0~1 + 文案）——view 刷新进度条/txt_progress */
    onProgress: (ratio: number, text: string) => void = () => {};

    constructor(private readonly deps: ILoginDeps) {}

    get accessToken(): string {
        return this.result?.accessToken ?? "";
    }

    get userId(): string {
        return this.result?.userId ?? "";
    }

    get isNewAccount(): boolean {
        return this.result?.isNewAccount ?? false;
    }

    /** 点「进入游戏」：登录。并发重复点合流（同一结果）。成功 resolve response，失败 resolve null。 */
    doLogin(key: string): Promise<WebPlatformLoginResponse | null> {
        // 外层 flow 已进入 Lobby/档案/导航时，任何旧调用面也复用整段事务，
        // 不允许在 HTTP 已完成但后置步骤仍等待的窗口再签发第二个 token。
        if (this.flowInflight) return this.flowInflight;
        if (this.inflight) return this.inflight;
        const p = this.run(key);
        this.inflight = p;
        // ⛔ 不用 .finally：客户端 lib 钉 ES2017（铁律 4），finally 是 ES2018
        const clear = () => { if (this.inflight === p) this.inflight = null; };
        p.then(clear, clear);
        return p;
    }

    /**
     * 运行完整登录事务：HTTP 签发、会话入态及调用方提供的 Lobby/档案/导航 continuation
     * 共享同一把锁。这样 HTTP 完成后的 await 边界不会让重复点击再次执行后半段。
     */
    doLoginFlow(key: string, continuation: LoginContinuation): Promise<WebPlatformLoginResponse | null> {
        if (this.flowInflight) return this.flowInflight;
        const p = (async () => {
            const response = await this.doLogin(key);
            if (response) await continuation(response);
            return response;
        })();
        this.flowInflight = p;
        const clear = () => { if (this.flowInflight === p) this.flowInflight = null; };
        p.then(clear, clear);
        return p;
    }

    private async run(key: string): Promise<WebPlatformLoginResponse | null> {
        this.onProgress(0.1, "正在连接服务器…");
        const r = await this.attempt(key);
        if (!r) {
            this.onProgress(0, "登录失败，请重试");
            return null;
        }
        this.result = r;
        // 账号验证只是链路前 40%：后续进大厅/拉档案由编排层（view/pages）继续推进到 1
        this.onProgress(0.4, "账号验证成功");
        return r;
    }

    /** 单次登录尝试。签发请求不自动重试；deps 返回 null 也算失败。 */
    private async attempt(key: string): Promise<WebPlatformLoginResponse | null> {
        try {
            return await this.deps.login(key);
        } catch {
            return null;
        }
    }
}
