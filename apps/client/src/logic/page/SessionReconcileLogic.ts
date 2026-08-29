/**
 * Lobby 最终断线后的会话/角色快照对账（纯 TS）。
 *
 * transport 只提供精确 ownership；本层负责按旧 session identity 重进 Lobby、
 * 拉取权威自档并在同一世代内提交。失败或过期只释放本次 ownership，绝不调用
 * 全局 leave()，因此旧 continuation 无权关闭后来登录建立的连接。
 */

import type { SessionReconcileIdentity } from "../../net/session";

export const SESSION_PROFILE_RECONCILE_TIMEOUT_MS = 15_000;

export interface SessionReconcileOwnership {
    readonly ready: Promise<void>;
    leave(): Promise<void> | void;
}

export interface SessionProfileReconcileDeps<TUser extends { readonly uid: string }> {
    connect(
        identity: SessionReconcileIdentity,
        control: { readonly timeoutMs: number; readonly signal?: AbortSignal },
    ): SessionReconcileOwnership;
    getInfo(): Promise<{ user: TUser | null | undefined }>;
    isCurrent(identity: SessionReconcileIdentity): boolean;
    commitProfile(identity: SessionReconcileIdentity, user: TUser): boolean;
}

export type SessionProfileReconcileResult<TUser> =
    | { readonly status: "reconciled"; readonly user: TUser }
    | { readonly status: "stale" };

/**
 * Reconcile one captured session generation. Cancellation is cooperative for
 * GetInfo (the RPC has its own bounded timeout), while Lobby join receives both
 * the caller signal and an explicit deadline.
 */
export async function reconcileSessionProfile<TUser extends { readonly uid: string }>(
    identity: SessionReconcileIdentity,
    deps: SessionProfileReconcileDeps<TUser>,
    signal?: AbortSignal,
): Promise<SessionProfileReconcileResult<TUser>> {
    if (signal?.aborted || !deps.isCurrent(identity)) return { status: "stale" };

    let ownership: SessionReconcileOwnership | null = null;
    let keepOwnership = false;
    try {
        ownership = deps.connect(identity, {
            timeoutMs: SESSION_PROFILE_RECONCILE_TIMEOUT_MS,
            signal,
        });
        await ownership.ready;
        if (signal?.aborted || !deps.isCurrent(identity)) return { status: "stale" };

        const info = await deps.getInfo();
        if (signal?.aborted || !deps.isCurrent(identity)) return { status: "stale" };
        const user = info?.user;
        if (!user) throw new Error("会话对账成功但角色档案为空");
        if (user.uid !== identity.userId) {
            throw new Error("角色档案身份与登录会话不一致");
        }
        if (!deps.commitProfile(identity, user)) return { status: "stale" };

        keepOwnership = true;
        return { status: "reconciled", user };
    } finally {
        if (!keepOwnership && ownership) {
            try { await ownership.leave(); } catch { /* preserve reconcile result/error */ }
        }
    }
}
