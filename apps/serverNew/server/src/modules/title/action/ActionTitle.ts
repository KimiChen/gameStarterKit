import { timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { UserErrors } from '../../user/UserErrors'
import { User } from '../../user/bean/User'
import { TitleErrors } from '../TitleErrors'
import { TitleEntry } from '../TitleC2S'
import { TitleItem } from '../bean/TitleItem'
import { TitleDefine } from '../rules/TitleDefine'

/**
 * 称号模块的公共业务逻辑，各协议 Action 继承它复用。
 */
export class ActionTitle extends GameAction {
    /**
     * 授予称号。冲榜类称号由榜单结算调用并传入结算时间，日常类由领取时调用。
     * @param user 玩家
     * @param titleId 称号id
     * @param startTime 有效期起点
     */
    static grant(user: User, titleId: int, startTime: int): TitleItem {
        if (!C.title().has(titleId)) {
            throw TitleErrors.TitleNotExist.params({ vars: { titleId } })
        }
        const conf = C.title(titleId)
        let item = user.title.titles.get(titleId)
        if (item == null) {
            item = new TitleItem({ id: titleId })
            user.title.titles.set(titleId, item)
        }
        // 重复获得时按新的起点重新计算有效期
        item.expire = TitleDefine.resolveExpire(conf.duration, startTime)
        item.isRead = false
        return item
    }

    /**
     * 取一个仍然有效的称号，未拥有或已过期时抛错并顺手回收过期数据
     * @param user 玩家
     * @param titleId 称号id
     * @param now 当前时间
     */
    static takeValid(user: User, titleId: int, now: int): TitleItem {
        const item = user.title.titles.get(titleId)
        if (item == null) {
            throw TitleErrors.TitleNotOwn.params({ vars: { titleId } })
        }
        if (TitleDefine.isExpired(item.expire, now)) {
            user.title.titles.delete(titleId)
            if (user.title.titleId === titleId) {
                ActionTitle.unload(user)
            }
            throw UserErrors.UserNoTitle
        }
        return item
    }

    /**
     * 卸下当前佩戴的称号
     */
    static unload(user: User): void {
        user.title.titleId = TitleDefine.TITLE_NONE
        user.title.titleExpire = TitleDefine.EXPIRE_FOREVER
    }

    /**
     * 回收所有过期称号，并同步当前佩戴状态
     * @param user 玩家
     * @param now 当前时间
     */
    static clearExpired(user: User, now: int): void {
        for (const [titleId, item] of user.title.titles) {
            if (!TitleDefine.isExpired(item.expire, now)) {
                continue
            }
            user.title.titles.delete(titleId)
            if (user.title.titleId === titleId) {
                ActionTitle.unload(user)
            }
        }
    }

    /**
     * 组装下发给客户端的称号条目
     */
    static toEntry(item: TitleItem): TitleEntry {
        const conf = C.title(item.id)
        return {
            id: item.id,
            type: conf.type,
            expire: item.expire,
            isRead: item.isRead,
            desc: conf.desc,
        }
    }

    /**
     * 校正当前佩戴状态：佩戴的称号不存在或已过期时清掉佩戴
     * @param user 玩家
     * @param now 当前时间
     */
    static normalizeDressed(user: User, now: int = timestamp()): void {
        if (user.title.titleId === TitleDefine.TITLE_NONE) {
            return
        }
        const item = user.title.titles.get(user.title.titleId)
        if (item == null || TitleDefine.isExpired(item.expire, now)) {
            if (item != null) {
                user.title.titles.delete(user.title.titleId)
            }
            ActionTitle.unload(user)
            return
        }
        user.title.titleExpire = item.expire
    }
}
