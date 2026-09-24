import { Call, LocalActionRegistry, MessageHelper, PlayerWorkerOwner, UserOnlineMgr } from '@arthropoda/game-engine'
import { ActionUserLobbyEnter } from '../action/ActionUserLobbyEnter'
import { ActionUserLobbyLeave } from '../action/ActionUserLobbyLeave'

/**
 * user 的会话开始入口：认证成功后**先保证 `User` 档存在**。
 *
 * 为什么需要它：旧通道的建档在 `base/Login`，原生 Lobby 没有那条路由，于是「新角色没有档」
 * 会被 `ActionUser.actionBefore` 的「无档就安全返回」吸收掉 —— 所有 Bean 类业务对新角色静默
 * 失效（最直观的一条：income 的收益时间轴永远不建立）。本入口把建档补回认证链。
 *
 * 顺序约定：本入口必须排在其它模块的登录钩子**之前**（`IncomeModule` 的
 * `income-native-lobby-auth` 已声明 `after: ['user-native-lobby-auth']`），因为那些钩子的
 * Action 都以 `User` 档为前提。
 *
 * ⛔ 不要在裸认证回调里直接 `new User()`：没有 Action 上下文时写入既不会被 `RedisTask` 保存，
 * 也不会进 `ModSync`（同 `IncomeNativeLobbyAuth` 的理由）。
 * ⛔ 也不要在这里预读「档是否存在」：`loadOrCreate` 本身就是幂等的。
 */
export class NativeLobbyUserEnter {
    static registerActions(): void {
        LocalActionRegistry.register({
            'user.lobbyEnter': ActionUserLobbyEnter,
            'user.lobbyLeave': ActionUserLobbyLeave,
        })
    }

    static async enter(internalUid: number, sId: number): Promise<void> {
        const workerId = (globalThis as typeof globalThis & { WORKER_ID?: number | null }).WORKER_ID
        if (workerId === null) throw new Error('native Lobby authentication cannot run in master')
        const workerNum = Math.max(1, (globalThis as typeof globalThis & { WORKER_NUM?: number }).WORKER_NUM ?? 1)
        const owner = await PlayerWorkerOwner.claim(
            internalUid,
            sId,
            workerNum,
            PlayerWorkerOwner.preferred(internalUid, workerNum),
        )
        // 原生 Lobby 不占 alloy-core 的数值 session；在线表直接镜像玩家 Event Worker Owner。
        await UserOnlineMgr.replace(internalUid, sId, 0, owner)
        const result = await MessageHelper.syncDoAction(
            internalUid,
            sId,
            new Call('user.lobbyEnter', {}),
            ActionUserLobbyEnter,
        )
        if (!result.isSucc) {
            await UserOnlineMgr.del(internalUid, sId)
            throw result.res ?? new Error(result.errMsg)
        }
    }

    static async clearOnlinePresence(internalUid: number, sId: number): Promise<void> {
        await UserOnlineMgr.del(internalUid, sId)
    }

    static async leave(internalUid: number, sId: number): Promise<void> {
        const result = await MessageHelper.syncDoAction(
            internalUid,
            sId,
            new Call('user.lobbyLeave', {}),
            ActionUserLobbyLeave,
        )
        if (!result.isSucc) throw result.res ?? new Error(result.errMsg)
    }
}
