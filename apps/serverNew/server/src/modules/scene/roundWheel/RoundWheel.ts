import { Timer } from './Timer'

/**
 * 基于轮次回合的时间轮，不能跳过
 * 每调用一次nextRound就跳到下一轮并执行所有任务
 */
export class RoundWheel {
    /** 当前指针指向轮次 */
    private currentRound: number = 0

    /** 槽位默认数量 */
    private wheelSize: number = 20

    /** 槽位=>定时器 */
    private buckets: Array<Map<number, Timer>> = []

    /** 当前idx */
    private bucketIndex: number = 0

    /** 定时器 */
    private tick?: NodeJS.Timeout

    /** 等待删除的定时器 slot=>timerId */
    private await_DelTimer: Map<number, number> = new Map()

    /** 等待加入的定时器 */
    private await_AddTimer: Timer[] = []

    /** 自增的序列ID */
    private _sequenceId: number = 0

    /** 获取序列ID */
    get sequenceId(): number {
        return this._sequenceId++
    }

    /** 是否正在运行 */
    private isRuning = false

    constructor(initRound: number = 0, wheelSize: number = 10) {
        this._sequenceId = 0
        this.wheelSize = wheelSize
        // 设置当前时间
        this.currentRound = initRound
        //当前刻度指针
        this.bucketIndex = initRound % wheelSize
        // 初始化槽位
        for (let i = 0; i < this.wheelSize; ++i) {
            this.buckets[i] = new Map()
        }
    }

    startTick(interval = 500) {
        this.tick = setInterval(() => this.nextRound(), interval)
    }

    stopTick() {
        this.tick && clearInterval(this.tick)
    }

    /**
     * 开始下一轮次的任务列表
     * @returns int 执行的任务数
     */
    public nextRound(): number {
        if (this.isRuning) {
            Log.game.error('RoundWheel.nextRound isRuning')
            return 0
        }
        let runCount = 0
        try {
            this.isRuning = true
            // 执行轮次任务
            const currentRound = ++this.currentRound
            this.bucketIndex = currentRound % this.wheelSize
            const taskMap = this.buckets[this.bucketIndex]

            if (taskMap.size <= 0) {
                return runCount
            }

            const removeIds: number[] = []
            const reinsert: Timer[] = []

            for (const [timerId, timer] of taskMap) {
                if (timer.canceled || timer.expiration > currentRound) {
                    continue
                }

                const nextRound = timer.callback(timer.actorId, timer.callbackArgs)
                if (timer.expiration <= currentRound && (nextRound === null || nextRound <= 0)) {
                    if (!timer.canceled) {
                        timer.canceled = true
                        removeIds.push(timerId)
                    }
                } else if (timer.expiration > currentRound) {
                    // 已经在业务里被reset
                } else {
                    //nextDelay > 0
                    timer.expiration = currentRound + nextRound
                    const bucketIdx1 = timer.expiration % this.wheelSize
                    if (bucketIdx1 !== this.bucketIndex) {
                        // 不在原有轮次，删掉重加
                        removeIds.push(timerId)
                        reinsert.push(timer)
                    }
                }

                runCount++
            }

            //删除过期任务
            for (const timerId of removeIds) {
                taskMap.delete(timerId)
            }
            //重新加入的任务
            for (const timer of reinsert) {
                const slot = timer.expiration % this.wheelSize
                this.buckets[slot].set(timer.sequenceId, timer)
                taskMap.set(timer.sequenceId, timer)
            }
        } catch (e) {
            Log.game.error('roundWheel error: ' + e)
        } finally {
            //每轮结束将业务执行过程中的加入和删除的任务进行一次处理
            for (const [slot, timerId] of this.await_DelTimer) {
                this.buckets[slot].delete(timerId)
            }
            for (const t of this.await_AddTimer) {
                this.buckets[t.expiration % this.wheelSize].set(t.sequenceId, t)
            }
            this.await_DelTimer.clear()
            this.await_AddTimer = []
            this.isRuning = false
        }
        return runCount
    }

    /**
     * 添加任务
     * @param actorId 角色Id
     * @param callback 回调函数
     * @param delayRound 多少轮后执行
     * @param args 其他参数
     * @returns
     */
    addTask(actorId: int, callback: (actorId: int, callbackArgs: string[]) => int, delayRound: int, args = []): Timer {
        delayRound += this.currentRound
        const t = new Timer(actorId, callback, delayRound, args, this.sequenceId)
        if (this.isRuning) {
            this.await_AddTimer.push(t)
        } else {
            const idx = t.expiration % this.wheelSize
            this.buckets[idx].set(t.sequenceId, t)
        }
        return t
    }

    /**
     * 指定一个任务延迟执行
     * @param t
     * @param delayRound
     * @returns
     */
    resetDelayRound(t: Timer, delayRound: int) {
        const expiration = this.currentRound + delayRound
        if (t.expiration === expiration) {
            //延迟后依然在同一个桶里，只延长过期轮次
            return
        }

        t.expiration = expiration
        const newBucketIdx = t.expiration % this.wheelSize
        if (newBucketIdx === t.bucketIdx) {
            // 延迟后依然在同一个桶里，只延长过期轮次
            return
        }

        // 当前轮正在执行，需要等待当前轮执行完毕后，再进行桶的切换
        if (this.isRuning) {
            this.await_AddTimer.push(t)
            this.await_DelTimer.set(t.bucketIdx, t.sequenceId)
            return
        }

        //删除对应桶里的再添加到新的桶
        this.buckets[t.bucketIdx].delete(t.sequenceId)
        // 桶的切换
        t.bucketIdx = newBucketIdx
        this.buckets[t.bucketIdx].set(t.sequenceId, t)
    }

    /** 取消任务 */
    cancelTask(t: Timer) {
        if (t.canceled) {
            return
        }
        t.canceled = true
        if (this.isRuning) {
            this.await_DelTimer.set(t.bucketIdx, t.sequenceId)
        } else {
            this.buckets[t.bucketIdx].delete(t.sequenceId)
        }
    }
}
