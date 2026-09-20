import { timestamp } from '@arthropoda/game-engine'
import { ReqTitleList, ResTitleList, TitleEntry } from '../TitleC2S'
import { ActionTitle } from './ActionTitle'

/**
 * 拉取称号列表
 */
export class ActionTitleList extends ActionTitle {
    async doAction(req: ReqTitleList, res: ResTitleList) {
        const user = this.user
        const now = timestamp()
        // 列表即回收点：过期称号不下发，佩戴状态也在这里校正
        ActionTitle.clearExpired(user, now)
        ActionTitle.normalizeDressed(user, now)

        const titles: TitleEntry[] = []
        for (const [, item] of user.title.titles) {
            titles.push(ActionTitle.toEntry(item))
        }
        // 未读优先，其余按到期时间升序，客户端可以直接按顺序渲染
        titles.sort((left, right) => {
            if (left.isRead !== right.isRead) {
                return left.isRead ? 1 : -1
            }
            return left.expire - right.expire
        })

        res.titleId = user.title.titleId
        res.titleExpire = user.title.titleExpire
        res.titles = titles
    }
}
