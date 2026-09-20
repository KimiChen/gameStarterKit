import { TimesBean } from '../bean/TimesBean'
import { timestamp } from '@arthropoda/game-engine'

/**
 * cd工具类
 */
export class TimeRecovery {
    /**
     * 计算冷却
     * @param timesItem
     * @param cd 单次冷却时长
     * @param maxTimes 最大次数，达到最大次数就不会在增长了
     * @param unit 单次增加数量
     * @returns 下次次数恢复时间，如果次数满了就返回0
     */
    static calCD(timesItem: TimesBean, cd: int, maxTimes: int, unit: int = 1) {
        const now = timestamp()
        const lastTime = timesItem.lastTime
        if (lastTime == 0) {
            timesItem.times = maxTimes
            timesItem.lastTime = now
            return 0
        }
        if (timesItem.times >= maxTimes) {
            timesItem.lastTime = now
            return 0
        }
        // 距离现在的时长
        const long = now - lastTime
        // 最多可增加的次数
        const times = Math.floor(long / cd)
        if (times == 0) {
            return timesItem.lastTime + cd
        }
        // 次数满了
        if (times * unit + timesItem.times >= maxTimes) {
            timesItem.times = maxTimes
            timesItem.lastTime = now
            return 0
        }
        timesItem.times += times * unit
        timesItem.lastTime += times * cd
        return timesItem.lastTime + cd
    }

    /**
     * 计算事件更新
     * @param times  当前事件次数
     * @param refreshTime 事件的刷新时间
     * @param cd 刷新时间间隔
     * @param maxTimes 事件最大次数
     * @param time 当前时间
     * @returns
     */
    static calEvent(
        times: int,
        refreshTime: int,
        cd: int,
        maxTimes: int,
        time: int = 0,
    ): { addTimes: int; nextTime: int } {
        time = time || timestamp()
        let addTimes = 0 //需要刷新的次数
        let nextTime = 0 //下次刷新时间

        // 事件没满 判断刷新
        if (times < maxTimes) {
            if (refreshTime == 0) {
                addTimes = maxTimes - times
            } else {
                const maxCanAdd = maxTimes - times // 最大可以刷新事件的数量
                // 到现在理论上可以刷新的事件次数
                addTimes = 1 + Math.floor((time - refreshTime) / cd)
                addTimes = addTimes < 0 ? 0 : addTimes
                if (addTimes >= maxCanAdd) {
                    addTimes = maxCanAdd
                } else {
                    nextTime = refreshTime + addTimes * cd
                }
            }
        }

        return { addTimes, nextTime }
    }

    /**
     * 获取上次恢复时间
     * @param timesItem
     * @returns
     */
    static getLastTime(timesItem: TimesBean): int {
        let newLastTime = timestamp()
        if (timesItem.stopTime > 0) {
            newLastTime = newLastTime - Math.max(0, timesItem.stopTime - timesItem.lastTime)
            // 暂停开始时间重置
            timesItem.stopTime = 0
        }
        return newLastTime
    }
}
