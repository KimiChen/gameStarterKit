import { RankDefine } from '../rules/RankDefine'
import { RankAccess } from './RankAccess'

export class RankMetadataStore {
    static readonly UPDATE_METHOD_SET = 'set'

    static readonly UPDATE_METHOD_INCR = 'incr'

    static readonly UPDATE_METHOD_REMOVE = 'remove'

    static async set(sId: int, rankType: string, memberId: string, score: number, infoId: any, params = []) {
        await this.run(sId, rankType, params, memberId, score, infoId, this.UPDATE_METHOD_SET)
    }

    static async incr(sId: int, rankType: string, memberId: string, score: number, infoId: any, params = []) {
        await this.run(sId, rankType, params, memberId, score, infoId, this.UPDATE_METHOD_INCR)
    }

    static async remove(sId: int, rankType: string, memberId: string, params = []) {
        await this.run(sId, rankType, params, memberId, 0, 0, this.UPDATE_METHOD_REMOVE)
    }

    static async run(
        sId: int,
        rankType: string,
        params: string[],
        memberId: string,
        score: number,
        infoId: any,
        method = '',
    ) {
        try {
            const conf = RankDefine.CONF.get(rankType)
            if (!conf?.subInfo) {
                throw Error(`${rankType}:该排行榜非subInfo类型,禁用此方法更新`)
            }

            const redisRank = RankAccess.getRedisRank(rankType, sId, ...params)
            const infoKey = RankAccess.formatRankInfoKey(rankType, sId, ...params)

            if (
                method != this.UPDATE_METHOD_INCR &&
                method != this.UPDATE_METHOD_SET &&
                method != this.UPDATE_METHOD_REMOVE
            ) {
                throw new Error('method illegal:{method}')
            }

            const muliti = redisRank.getRedis().client().multi()
            try {
                if (this.UPDATE_METHOD_REMOVE == method) {
                    await redisRank.remove(memberId)
                    muliti.hDel(infoKey, memberId)
                } else if (this.UPDATE_METHOD_INCR == method) {
                    await redisRank.incr(memberId, score)
                    muliti.hSet(infoKey, memberId, infoId)
                } else if (this.UPDATE_METHOD_SET == method) {
                    await redisRank.set(memberId, score)
                    muliti.hSet(infoKey, memberId, infoId)
                }
            } catch (e) {
                Log.error('RankDayRealUpdateFail', e, [rankType, params, memberId, score, infoId])
                if (PLATFORM !== 'bearjoy') {
                    throw e
                }
            } finally {
                await muliti.exec()
            }
        } catch (e) {
            Log.error('RankDayRealUpdateFail', e, [rankType, params, memberId, score, infoId])
            if (PLATFORM !== 'bearjoy') {
                throw e
            }
        }
    }
}
