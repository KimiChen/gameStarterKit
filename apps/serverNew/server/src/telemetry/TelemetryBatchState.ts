import moment from 'moment'
import { timestamp } from '@arthropoda/game-engine'
import { TaCommonUser } from '../../generated/telemetry/models/TaCommonUser'

/**
 * 数数缓存管理
 */
export class TelemetryBatchState {
    /** 执行定时器 */
    public static TICK_LOOP_MS = 6000

    /** 缓存存活时长 */
    public static SURVIVAL_MS = 3600

    /** 缓存数量上限 */
    public static CACHE_COUNT_LIMIT = 200

    /**
     * 玩家公共缓存信息 [uId =>  TaCommonUser ...]
     */
    public static taCommonUsers: { [key: string]: TaCommonUser } = {}

    /**
     * 玩家缓存淘汰定时器
     */
    private static timerCache?: NodeJS.Timeout

    /** 上次执行淘汰时间 */
    private static lastDoTime: int = 0

    /** 启动定时器 */
    public static startTick() {
        if (this.timerCache) {
            return
        }
        this.timerCache = setInterval(() => {
            TelemetryBatchState.callBack()
        }, this.TICK_LOOP_MS)
    }

    /**
     * 定时删除玩家数数公共数据
     * @return void
     */
    public static callBack() {
        const cacheCount = Object.keys(this.taCommonUsers).length
        if (!cacheCount) {
            return
        }

        const now = timestamp()
        if (!this.lastDoTime) {
            this.lastDoTime = now
        }

        // 淘汰时间要求 数量要求
        if (now - this.lastDoTime < this.SURVIVAL_MS && cacheCount <= this.CACHE_COUNT_LIMIT) {
            return
        }

        // 淘汰数：额外淘汰1个名额防止 持续达到临界点触发
        let outNum = cacheCount - this.CACHE_COUNT_LIMIT + 1

        // 淘汰玩家
        this.lastDoTime = now
        const sortArr: { [key: string]: number } = {}

        for (const uId in this.taCommonUsers) {
            const commonUser = this.taCommonUsers[uId]
            const eventTime = moment(commonUser.event_time).unix()
            // 超过存活时长淘汰
            if (this.lastDoTime - eventTime >= this.SURVIVAL_MS) {
                delete this.taCommonUsers[uId]
                outNum && outNum--
            } else if (outNum > 0) {
                sortArr[uId] = eventTime
            }
        }

        // 淘汰缓存前多少久的玩家
        if (outNum > 0) {
            const sortedIds = Object.entries(sortArr)
                .sort((a, b) => a[1] - b[1])
                .map((entry) => entry[0])
            for (const key in sortedIds) {
                delete this.taCommonUsers[key]
                outNum--
                if (outNum <= 0) {
                    break
                }
            }
        }
    }

    /**
     * 玩家离线后清楚玩家当前进程数数缓存
     * @param int uId
     * @return void
     */
    public static userLeaveClear(uId: int) {
        if (this.taCommonUsers[uId]) {
            delete this.taCommonUsers[uId]
        }
    }
}
