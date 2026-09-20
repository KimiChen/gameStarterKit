import { MemberType, MemberTypeToString, RedisCache } from '../database/RedisCache'
import { OtherLoadOpts } from './subs/optsInterface'

/**
 * 操作类型
 */
export enum OpType {
    /**直接设值*/
    TYPE_SET,
    /**自增*/
    TYPE_INCR,
    /**删除*/
    TYPE_DELETE,
}

export class RankInfo {
    /** 元素 */
    member: MemberType = ''

    /** 变化的分数 */
    score: int = 0

    /** 元素初始状态(默认不存在) */
    initStatus: boolean = false

    /** 元素初始分数 */
    initScore: int = 0

    /** 操作类型 */
    opType = OpType.TYPE_SET
}

export class ZSet {
    private _key: string

    private _loadOpts?: OtherLoadOpts

    public get key() {
        return this._key
    }

    /** 过期时间 值为0时删除对应key */
    public _expireTime: int = -1

    /** 业务中是否有过删除操作 */
    public _cacheDeleted: boolean = false

    /** 业务提交后需要进行的操作 */
    public _memberCommitMap: Map<MemberType, RankInfo> = new Map()

    /** 业务回滚时需要进行的操作 */
    public _memberRollbackMap: Map<MemberType, RankInfo> = new Map()

    /** 是否是可使用且已排序过的 */
    private _isSorted: boolean = false

    /**
     * 对memberCommitMap, 进行倒序排序过的数组Key
     */
    private _sortList: MemberType[] = []

    constructor(key: string, loadOpts?: OtherLoadOpts) {
        this._loadOpts = loadOpts
        if (this._loadOpts?.serverId) {
            this._key = `${this._loadOpts?.serverId}:${key}`
        } else {
            this._key = key
        }
    }

    getRedis(): RedisCache {
        throw new Error('Method not implemented.')
    }

    static getRedis(): RedisCache {
        throw new Error('Method not implemented.')
    }

    static load(key: string, loadOpts?: OtherLoadOpts) {
        return new this(key, loadOpts)
    }

    async zAdd(score: int, id: MemberType) {
        const info = await this.checkCommitRankInfo(id, OpType.TYPE_SET)
        info.opType = OpType.TYPE_SET
        info.score = score
        if (this._cacheDeleted) {
            this._isSorted = false
        }
        return score
    }

    async zRem(id: MemberType) {
        const info = await this.checkCommitRankInfo(id, OpType.TYPE_DELETE)
        const exist = info.opType != OpType.TYPE_DELETE || info.initStatus
        info.opType = OpType.TYPE_DELETE
        info.score = 0
        if (this._cacheDeleted) {
            this._isSorted = false
        }
        return exist
    }

    async zIncrBy(score: int, id: MemberType) {
        const info = await this.checkCommitRankInfo(id, OpType.TYPE_INCR)
        if (info.opType === OpType.TYPE_INCR) {
            info.score += score
        } else {
            info.score = info.score - info.initScore + score
        }
        info.opType = OpType.TYPE_INCR
        if (this._cacheDeleted) {
            this._isSorted = false
        }
        return info.score + info.initScore
    }

    async zScore(targetId: MemberType) {
        const info = this._memberCommitMap.get(targetId)
        if (this._cacheDeleted && info == null) {
            return null
        }
        if (info != null) {
            if (info.opType === OpType.TYPE_INCR) {
                return info.score + info.initScore
            } else {
                return info.score
            }
        }

        return this.getRedis().zScore(this._key, targetId)
    }

    async zRevRank(targetId: int) {
        if (this._cacheDeleted) {
            await this._checkNeedSort()
            return this._sortList.indexOf(targetId)
        }

        await this.advanceCommit()
        return this.getRedis().zRank(this.key, targetId, true)
    }

    async zRange(start: int, end: int) {
        if (this._cacheDeleted) {
            await this._checkNeedSort()

            const count = this._sortList.length
            start = Math.max(start < 0 ? count + start : start, 0)
            end = Math.min(end < 0 ? count + end : end, count - 1)
            if (start > end) {
                return []
            }

            const list = []
            for (let i = end; i >= start; i--) {
                const memeber = this._sortList[i]
                list.push(memeber)
            }
            return list
        }

        await this.advanceCommit()
        return this.getRedis().zRange(this._key, start, end)
    }

    async zRangeWithScore(start: int, end: int) {
        if (this._cacheDeleted) {
            await this._checkNeedSort()

            const count = this._sortList.length
            start = Math.max(start < 0 ? count + start : start, 0)
            end = Math.min(end < 0 ? count + end : end, count - 1)
            if (start > end) {
                return []
            }

            const map: { score: number; value: MemberType; }[] = []
            for (let i = end; i >= start; i--) {
                const memeber = this._sortList[i]
                const rank = this._memberCommitMap.get(memeber)
                if (rank == null) {
                    continue
                }
                map.push({ score: rank.score, value: memeber })
            }
            return map
        }

        await this.advanceCommit()
        return this.getRedis().zRangeWithScores(this._key, start, end)
    }

    async zRevRange(start: int, end: int) {
        if (this._cacheDeleted) {
            await this._checkNeedSort()

            const count = this._sortList.length
            start = Math.max(start < 0 ? count + start : start, 0)
            end = Math.min(end < 0 ? count + end : end, count - 1)
            if (start > end) {
                return []
            }

            const list = []
            for (let i = start; i <= end; i++) {
                const member = this._sortList[i]
                list.push(member)
            }
            return list
        }

        await this.advanceCommit()
        return this.getRedis().zRange(this._key, start, end, true)
    }

    async zRevRangeWithScore(start: int, end: int) {
        if (this._cacheDeleted) {
            await this._checkNeedSort()

            const count = this._sortList.length
            start = Math.max(start < 0 ? count + start : start, 0)
            end = Math.min(end < 0 ? count + end : end, count - 1)
            if (start > end) {
                return []
            }

            const map: { score: number; value: MemberType; }[] = []
            for (let i = start; i <= end; i++) {
                const member = this._sortList[i]
                const rank = this._memberCommitMap.get(i)
                if (rank == null) {
                    continue
                }
                map.push({ score: rank.score, value: member })
            }
            return map
        }

        await this.advanceCommit()
        return this.getRedis().zRangeWithScores(this._key, start, end, true)
    }

    /**
     * 检查是否已加载过该元素的信息
     * @param id
     * @param opType
     * @private
     */
    private async checkCommitRankInfo(id: MemberType, opType: OpType): Promise<RankInfo> {
        let rankInfo = this._memberCommitMap.get(id)
        if (rankInfo == null) {
            rankInfo = new RankInfo()
            rankInfo.member = id
            rankInfo.opType = opType
            if (!this._cacheDeleted) {
                const score = await this.getRedis().zScore(this._key, id)
                if (score != null) {
                    rankInfo.initStatus = true
                    rankInfo.initScore = score
                }
            }
            this._memberCommitMap.set(id, rankInfo)
        }
        return rankInfo
    }

    async zRevRangeByScore(start: int, end: int) {
        if (this._cacheDeleted) {
            if (start > end) {
                return []
            }
            await this._checkNeedSort()
            const list = []
            const count = this._sortList.length - 1
            for (let i = 0; i <= count; i++) {
                const member = this._sortList[i]
                const rank = this._memberCommitMap.get(member)
                if (rank == null) {
                    continue
                }
                if (rank.score < start) {
                    break
                }
                if (rank.score > end) {
                    continue
                }
                list.push(member)
            }
            return list
        }
        await this.advanceCommit()
        return this.getRedis().zRangeByScore(this.key, start, end, true)
    }

    async zRevRangeByScoreWithScore(start: int, end: int): Promise<{ score: int; value: MemberType }[]> {
        if (this._cacheDeleted) {
            if (start > end) {
                return []
            }
            await this._checkNeedSort()
            const map: { score: int; value: MemberType }[] = []
            const count = this._sortList.length - 1
            for (let i = 0; i <= count; i++) {
                const member = this._sortList[i]
                const rank = this._memberCommitMap.get(member)
                if (rank == null) {
                    continue
                }
                if (rank.score < start) {
                    break
                }
                if (rank.score > end) {
                    continue
                }
                map.push({ score: rank.score, value: member })
            }
            return map
        }
        await this.advanceCommit()
        return this.getRedis().zRangeWithScores(this.key, start, end, true)
    }

    async zCard() {
        if (this._cacheDeleted) {
            return this._memberCommitMap.size
        }
        await this.advanceCommit()
        return this.getRedis().zCard(this._key)
    }

    del() {
        this._expireTime = 0
        this._cacheDeleted = true
        this._memberCommitMap.clear()
        this._isSorted = false
        this._sortList = []
    }

    expire(time: int) {
        if (time === 0) {
            this.del()
        } else {
            this._expireTime = time
        }
    }

    /**
     * 检查是否需要进行排序
     */
    async _checkNeedSort() {
        if (this._isSorted) {
            return
        }
        this._sortList = Array.from(this._memberCommitMap.values())
            .sort((a, b) => b.score - a.score)
            .map(item => item.member)
        this._isSorted = true
    }

    /**
     * 检查是否已加载过该元素的信息
     * @param id
     * @param opType
     * @returns
     */
    async _checkCommitRankInfo(id: MemberType, opType: int): Promise<RankInfo> {
        let rankInfo = this._memberCommitMap.get(id)
        if (rankInfo == null) {
            rankInfo = new RankInfo()
            rankInfo.member = id
            rankInfo.opType = opType

            // 如果有执行过删除 key 操作, 就没必要去获取初始状态
            if (!this._cacheDeleted) {
                const score = await this.getRedis().zScore(this._key, id)
                if (score != null) {
                    rankInfo.initStatus = true
                    rankInfo.initScore = score
                }
            }
            this._memberCommitMap.set(id, rankInfo)
        }
        return rankInfo
    }

    /**
     * 检查是否有需要等业务提交时需要进行的操作
     * 如果有, 提前写入排行榜, 并且记录业务回滚时需要进行的操作
     */
    async advanceCommit() {
        if (this._cacheDeleted) {
            throw new Error('删除 key 后不允许提前提交操作')
        }
        if (this._memberCommitMap.size == 0) {
            return
        }

        await this._handleRankInfoMap(this._memberCommitMap)

        // 记录业务回滚
        for (const item of this._memberCommitMap.values()) {
            let rankInfo = this._memberRollbackMap.get(item.member)
            if (rankInfo == null) {
                rankInfo = new RankInfo()
                rankInfo.member = item.member
                rankInfo.initScore = item.initScore
                this._memberRollbackMap.set(item.member, rankInfo)
            }

            // 如果已存在回滚列表里且操作类型是删除，跳过
            if (rankInfo.opType === OpType.TYPE_DELETE) {
                continue
            }

            if (item.initStatus) {
                rankInfo.opType = OpType.TYPE_INCR
                if (item.opType == OpType.TYPE_DELETE) {
                    rankInfo.score = rankInfo.initScore
                } else if (item.opType == OpType.TYPE_INCR) {
                    rankInfo.score -= item.score
                } else {
                    rankInfo.score = rankInfo.initScore - item.score
                }
            } else {
                rankInfo.opType = OpType.TYPE_DELETE
                rankInfo.score = 0
            }
        }

        this._memberCommitMap.clear()
    }

    /**
     * 回滚操作
     * @returns
     */
    async rollbackRankOp() {
        await this._handleRankInfoMap(this._memberRollbackMap)
        this._memberRollbackMap.clear()
    }

    public async _handleRankInfoMap(maps: Map<MemberType, RankInfo>) {
        const multi = this.getRedis().client().multi()
        for (const item of maps.values()) {
            if (item.opType === OpType.TYPE_DELETE) {
                multi.zRem(this._key, MemberTypeToString(item.member))
            } else if (item.opType === OpType.TYPE_INCR) {
                multi.zIncrBy(this._key, item.score, MemberTypeToString(item.member))
            } else {
                multi.zAdd(this._key, { score: item.score, value: MemberTypeToString(item.member) })
            }
        }
        await multi.execAsPipeline()
    }
}
