import { Call, LocalActionRegistry, MessageHelper } from '@arthropoda/game-engine'
import { ActionIncomeParkOffline } from '../action/ActionIncomeParkOffline'

/**
 * income 的会话开始入口：认证成功后**只做一件事** —— 把离线暂存派发成一次完整 Action。
 *
 * ⛔ 不要在裸认证回调里直接改 `User` Bean：认证回调没有 Action 上下文，写入既不会被
 * `RedisTask` 保存，也不会进 `ModSync`。`parkOffline` 的语义（只累加待领、不直接进铜币）
 * 全部留在 `CopperIncome` 里，本文件只负责把它送进 Action 生命周期。
 *
 * ⛔ 也不要在这里预读 `User` 判存在性：`ActionUser.actionBefore` 已经按可信 uid 加载，
 * 新角色（尚无 Bean）时 `this.user` 为空，Action 自身会安全返回。多一次预读只是多一份
 * 需要与框架保持一致的假设。
 *
 * ⛔ 更不要把失败吞掉：玩家档 Redis 不可用时放行认证，等于「玩家登录成功、离线收益永久
 * 丢失且没有任何痕迹」。这条路必须 fail-closed —— 代价是测试夹具必须装上玩家档 Redis 假体
 * （见 `test/support/FakeCenterRedis.ts` 的 `player` 选项），而不是让生产代码容忍缺失。
 */
export class IncomeNativeLobbyAuth {
    static registerActions(): void {
        LocalActionRegistry.register({ 'income.parkOffline': ActionIncomeParkOffline })
    }

    static async onAuthenticated(internalUid: number, sId: number): Promise<void> {
        const result = await MessageHelper.syncDoAction(
            internalUid,
            sId,
            new Call('income.parkOffline', {}),
            ActionIncomeParkOffline,
        )
        if (!result.isSucc) throw result.res ?? new Error(result.errMsg)
    }
}
