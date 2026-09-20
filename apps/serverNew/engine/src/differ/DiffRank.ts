import { IdFieldType } from './bean'
import { RankRefBase } from './rankRefBase'
import { ZSet } from './ZSet'
import { timestamp } from '../utils/common'
import { ContextEngine } from '../context/ContextEngine'
import { CenterZSet } from '../bean/redis/centerRedis'
import { ServerZSet } from '../bean/redis/serverRedis'
import { MemberType } from '../database/RedisCache'
import { addRootRankLoade, getDifferCache } from './differCache'

/**
 * RedisBean排行榜结构
 */
export class DiffRank {
    /** redis list主键名 */
    public key: string

    /** 排名对象的元素映射类 */
    public rankRefClass: typeof RankRefBase

    /** 是否是跨服排行榜 */
    public isCross: boolean = false

    /** 排行榜对象 */
    private diffZSet: ZSet

    /** 已经加载的数据列表,加载前要先绑定  */
    static loadedMap = new Map<string, ContextEngine>()

    constructor(key: string, rankRefClass: typeof RankRefBase, isCenter: boolean) {
        this.key = key
        this.rankRefClass = rankRefClass
        const cache = getDifferCache()?.rankLoadedList.get(key) ?? undefined
        if (cache) {
            this.diffZSet = cache
        } else {
            this.diffZSet = isCenter ? CenterZSet.load(this.key) : ServerZSet.load(this.key)
            addRootRankLoade(this.diffZSet)
        }
    }

    static load<T extends typeof RankRefBase>(rankRefClass: T, key: string, isCenter: boolean) {
        return new DiffRank(key, rankRefClass, isCenter)
    }

    public getRedis() {
        return this.diffZSet.getRedis()
    }

    /**
     * 获取单个指定目标id的排名
     * @param targetId 目标id
     * @returns 返回目标排名信息, 排名从1开始，如果不在榜单中返回的排名为0
     */
    async getTargetRank(targetId: int) {
        let rank = await this.diffZSet.zRevRank(targetId)
        if (rank == null) {
            rank = 0
        } else {
            rank++
        }
        return rank
    }

    /**
     * 获取单个指定目标id 的分数
     * @param targetId
     * @returns
     */
    async getTargetScore(targetId: int) {
        let score = await this.diffZSet.zScore(targetId)
        if (score == null) {
            score = 0
        }
        return score
    }

    /**
     * 获取单个指定目标id的排名信息
     * @param targetId 目标id
     * @returns 返回目标排名信息, 排名从1开始，如果不在榜单中 返回的排名为0
     */
    async getTargetRankInfos(targetId: int) {
        let rank = await this.diffZSet.zRevRank(targetId)
        let score = 0
        if (rank == null) {
            rank = 0
        } else {
            rank++
            score = (await this.diffZSet.zScore(targetId)) ?? 0
        }
        return this.rankInfo(targetId, rank, score)
    }

    /**
     * 获取排行列表
     * @param start 起始索引0开始
     * @param len 要获取的最大长度
     * @param extraId 需要获得的单独的id，没有可不设置值，该记录在返回结果的最后一条,索引为0, 如果没有在榜单里则score为0
     * @returns 返回列表，id=>排名对象, 排名从1开始
     */
    async getRankInfos(start: int, len: int, extraId = 0): Promise<Map<MemberType, RankRefBase>> {
        const zRevRangeRet = await this.diffZSet.zRevRangeByScoreWithScore(start, start + len - 1)
        if (zRevRangeRet == null) {
            return new Map()
        }

        const ids = []
        for (const idx in zRevRangeRet) {
            ids.push(zRevRangeRet[idx].value)
        }

        const rankInfos = await this.rankRefClass.loadAll(ids)

        let rank = start + 1 // 排名从1开始

        const data = new Map()
        for (const idx in zRevRangeRet) {
            const obj = zRevRangeRet[idx]
            const rankInfo = rankInfos.get(obj.value)
            if (rankInfo != null) {
                rankInfo.rank = rank++
                rankInfo.score = obj.score
                data.set(obj.value, rankInfo)
            }
        }

        if (extraId > 0) {
            const extraItem = data.get(extraId)
            if (extraItem) {
                data.set(0, extraItem)
            } else {
                let extraScore = 0
                let extraRank = await this.diffZSet.zRevRank(extraId)
                if (!extraRank) {//没有上榜
                    extraRank = 0
                } else {
                    extraRank++
                    extraScore = (await this.diffZSet.zScore(extraId)) ?? 0
                }
                const exRankInfo = await this.rankInfo(extraId, extraRank, extraScore)
                data.set(0, exRankInfo)
            }
        }

        return data
    }

    async rankInfo(id: int, rank: int, score: int) {
        let item = await this.rankRefClass.load(id)
        if (item == null) {
            item = new RankRefBase(id)
        }
        item.rank = rank
        item.score = score
        return item
    }

    /**
     * 获取指定排名段的id列表
     * @param start
     * @param len
     * @param isDesc
     * @returns
     */
    async getRankIds(start: int, len: int, isDesc = true) {
        if (isDesc) {
            return this.diffZSet.zRevRange(start, start + len - 1)
        } else {
            return this.diffZSet.zRange(start, start + len - 1)
        }
    }

    /**
     * 获取指定排名段的 id=>分数 列表
     * @param start
     * @param len
     * @param isDesc
     * @returns
     */
    async getRankIdScores(start: int, len: int, isDesc = true) {
        if (isDesc) {
            return this.diffZSet.zRevRangeWithScore(start, start + len - 1)
        } else {
            return this.diffZSet.zRangeWithScore(start, start + len - 1)
        }
    }

    /**
     * 获取指定分数内的列表 id=>分数
     * 注意：由于 redis 实际存储的 score 小数部分用来标识同分情况下的 时间顺序，所以 redis 中实际存储的 score 比保存的 score 会略大但是不超过 1
     * 所以实际使用该方法的时候，设定的区间需要根据实际使用场景 来相应调整
     * @param start
     * @param end
     * @returns
     */
    async getRankIdScoresByScore(start: int, end: int) {
        return this.diffZSet.zRevRangeByScore(start, end)
    }

    /**
     * 设置排行榜项分值，没有的时候自动插入
     * @param id
     * @param score
     */
    async set(id: IdFieldType, score: int) {
        let floatVal = this.checkScoreFloat(score)
        floatVal += score
        return this.diffZSet.zAdd(floatVal, id)
    }

    /**
     * 批量写入排行榜数据
     * @param datas
     */
    async mSet(datas: { id: IdFieldType; score: int }[]) {
        for (const data of datas) {
            let floatVal = this.checkScoreFloat(data.score)
            floatVal += data.score
            await this.diffZSet.zAdd(floatVal, data.id)
        }
    }

    /**
     * 累加排行榜对分数
     */
    async incr(id: IdFieldType, score: int) {
        const rs = await this.diffZSet.zIncrBy(score, id)
        const oldVal = rs - score

        let oldFloat: int
        if (oldVal < 0) {
            oldFloat = oldVal - Math.ceil(oldVal)
        } else {
            oldFloat = oldVal - Math.floor(oldVal)
        }
        // 新的小数
        const floatVal = this.checkScoreFloat(rs)

        let addFloat = floatVal - oldFloat
        addFloat = Number(addFloat.toFixed(10))

        return this.diffZSet.zIncrBy(addFloat, id)
    }

    /**
     * 根据时间进行偏移
     * @param abs 兼容负数的场景
     * @returns
     */
    public checkScoreFloat(abs: int = 0) {
        const time = timestamp()
        const startTime = 1609430400 // 2021-01-01的时间戳
        const timeDiff = time - startTime

        let rate = timeDiff / (timeDiff + 1000000000)
        if (abs < 0) {
            rate = -rate
        } else {
            rate = 1 - rate
        }
        rate = rate / 10
        return Number(rate.toFixed(10))
    }

    /**
     * 移除
     * @param id 对应的member
     */
    async remove(id: IdFieldType) {
        await this.diffZSet.zRem(id)
    }

    /**
     * 返回当前排行榜总长度
     * @returns
     */
    async count() {
        return this.diffZSet.zCard()
    }

    /**
     * 清空排行榜数据
     */
    async clear() {
        this.diffZSet.del()
    }

    /**
     * 设置排行榜过期时间
     * @param time
     */
    async expire(time: int) {
        this.diffZSet.expire(time)
    }

    async commit() {
        return this.diffZSet.advanceCommit()
    }

    async rollback() {
        return this.diffZSet.rollbackRankOp()
    }
}
