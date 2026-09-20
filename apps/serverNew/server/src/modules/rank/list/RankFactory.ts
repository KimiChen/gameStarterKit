import { User } from '../../user/bean/User'
import { RankDefine } from '../rules/RankDefine'
import { RankListActivity } from './RankListActivity'
import { RankListSystem } from './RankListSystem'

/**
 * 排行榜工厂
 */
export class RankFactory {
    static async getObject(rankType: string, user: User, params: string[]): Promise<RankListSystem> {
        if (C.rank(rankType)?.activityName) {
            return RankListActivity.create(rankType, user, params)
        }
        const cls = RankDefine.CONF.get(rankType)?.rankListClass ?? RankListSystem
        return cls.create(rankType, user, params)
    }
}
