import { UserOnlineMgr, timestamp } from '@arthropoda/game-engine'
import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { User } from '../bean/User'
import { syncOnlineTime } from '../action/ActionUserSync'
import { UserEvent } from '../action/UserEvent'
import { CopperIncome } from '../action/CopperIncome'

/**
 * 会话结束（断线 / 顶号 / 被踢）后的离线收尾。
 *
 * 「旧连接的迟到回调不得覆盖新会话」这条守卫由原生 Lobby 承担：
 * `NativeLobbyAuthProvider.releaseOnline` 只在被释放的连接确实是该 uid/sId 的当前连接时才回调。
 * 因此这里不再（也无法）用连接 id 做二次比较——原生连接 id 是字符串，旧的 `SessionMgr` 已随 P6 删除，
 * 而 `UserOnlineMgr` 里记的连接 id 对原生通道恒为 0，比较它只会得到假阳性。
 */
export class UserSessionLifecycle {
    static async leave(user: User) {
        syncOnlineTime(user)
        CopperIncome.markOffline(user, timestamp())
        await ServerUserModel.update(
            { userId: String(user.id) },
            {
                userLevel: user.lv,
                userVipExp: String(user.vipExp),
                userVip: user.vip,
                userFp: String(user.fp),
                userGc: String(user.gc),
            },
        )
        await UserOnlineMgr.del(user.id, user.sId)
        await UserEvent.userLeave(user)
    }
}
