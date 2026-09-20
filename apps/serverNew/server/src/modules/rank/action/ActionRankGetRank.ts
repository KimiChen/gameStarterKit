import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqRankGetRank, ResRankGetRank } from '../RankC2S'
import { RankFactory } from '../list/RankFactory'
import { RankAccess } from '../persistence/RankAccess'

/**
 * 获取排行榜
 */
export class ActionRankGetRank extends GameAction {
    async doAction(req: ReqRankGetRank, res: ResRankGetRank) {
        req.params ??= []
        res.l ??= []
        const rankType = req.type
        if (!rankType) {
            throw SystemErrors.SysParamError
        }

        const entity = await RankFactory.getObject(rankType, this.user, req.params)

        const num = entity.getMaxNum()
        const redisRank = entity.getRedisRank()

        const selfId = entity.getSelfId()
        const rankMap = await redisRank.getRankInfos(0, num, selfId)
        const rankList = new Map([...rankMap].filter(([key]) => key !== 0))
        await entity.formatList(rankList, res)

        const selfPb = await entity.formatSelf(rankMap.get(0))
        if (selfPb) {
            res.self = selfPb
        }

        // 是否可以膜拜
        res.isDo = RankAccess.checkCanWorship(this.user, rankType)
        res.ext = entity.frontExpireTime()
        res.extType = 0
    }
}
