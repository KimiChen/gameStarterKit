import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ReqRankGetSelfRank, ResRankGetSelfRank } from '../RankC2S'
import { RankAccess } from '../persistence/RankAccess'

/**
 * 获取自身排行
 */
export class ActionRankGetSelfRank extends GameAction {
    async doAction(req: ReqRankGetSelfRank, res: ResRankGetSelfRank) {
        const rankType = req.type
        if (!rankType) {
            throw SystemErrors.SysParamError
        }
        const rankTypeArr = rankType.split(',')
        for (const type of rankTypeArr) {
            //本服
            const redisRank = RankAccess.getRedisRank(type, Ctx.sid)
            const selfId = this.user.id
            const rs = await redisRank.getTargetRankInfos(selfId)
            res.l = {
                rank: rs.rank,
                score: rs.score,
                type: type,
            }
        }
    }
}
