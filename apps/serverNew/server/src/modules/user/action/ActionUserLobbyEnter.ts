import type { ApiCall } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { UserLoginInitializer } from './UserLoginInitializer'

/**
 * 原生 Lobby 的建档 Action：把「本次认证的角色」load-or-create 成 `User` 档。
 *
 * 旧通道的建档在 `base/Login`（`ActionLogin` → `UserLoginInitializer.loadOrCreate`）。原生 Lobby
 * 没有 `base/Login`，而 **Bean 类业务全都以 `User` 档为前提**（income 的等级/铜币/收益时间轴、
 * mail 的收件人、guild 的成员……）。缺档时 `ActionUser.actionBefore` 会**安全返回**，
 * `income.parkOffline` 随之静默 no-op —— 症状是「登录一切正常，但收益时间轴永远不建立、
 * `User_<内部 uid>` 这个键根本不存在」，而不是任何报错。所以建档必须显式补上。
 *
 * ⛔ 不要在裸认证回调里直接 `new User()`：那里没有 Action 上下文，写入既不会被 `RedisTask`
 * 保存，也不会进 `ModSync`（同 `IncomeNativeLobbyAuth` 的理由）。
 * ⛔ 也不要在本 Action 里调 `Ctx.bind`：`UserOnlineMgr` 的 `connectionId` 对原生通道恒为 0，
 * 而 `isOnline` 判的就是 `connectionId !== 0`，bind 既不会让在线表变准，还会给旧通道的在线表
 * 留下假条目。原生 Lobby 的在线归属归连接生命周期。
 */
export class ActionUserLobbyEnter extends GameAction {
    private enterUid = 0

    async actionBefore(call: ApiCall<any, any, any>): Promise<void> {
        // 先记 uid 再交给基类：新角色没有档，`super` 只会安全返回，而建档需要的正是 uid 本身。
        // 已有档时基类会加载并跑每日重置，`loadOrCreate` 随后命中同一个缓存实例，不会重复加载。
        this.enterUid = call.uId
        await super.actionBefore(call)
    }

    async doAction(): Promise<void> {
        // 外部公开档案归旧 apps/server 的 user 域；这里只保证本项目的 Bean 业务有内部热档。
        await UserLoginInitializer.loadOrCreate(this.enterUid, '', SERVER_ID)
    }
}
