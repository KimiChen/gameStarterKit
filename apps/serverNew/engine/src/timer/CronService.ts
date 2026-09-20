import { CronTime } from 'cron'
import { RedisInstance } from '../database/RedisInstance'
import { log } from '../logging/log'
import { RedisLock } from '../utils/RedisLock'
import { millisecond, timestamp } from '../utils/common'
import { CronTask, CronTaskMinHeap } from './cronTask'
import { TickAfterReturnType, tickAfter } from './timer'
import { MessageHelper } from '../comm/MessageHelper'
import { E_APP_TYPE } from '../typings/conf-app'

export class CronService {
    /**
     * cron定时任务最近一次执行时间
     */
    static CRON_LAST_RUN_TIME_KEY = 'cron_last_run_time_key'

    private static taskMap: { [k: string]: CronTask } = {}

    private static taskHeap: CronTaskMinHeap = new CronTaskMinHeap()

    // 下一个延时任务的timerId
    private static nextTimerTicker?: TickAfterReturnType<any>

    // 是否已经初始化完成开始执行任务
    private static started: boolean = false

    /**
     * 检测下一个任务执行时间的最大延时间隔，确保在这个时间间隔内一定会尝试执行最近的一个任务
     * setTimeout 不能设置超过一个过大的值
     */
    public static maxDelayCheckTime: int = 86400 * 1000

    /**
     * 每次调用任务都会启一个新的回调
     * expression 格式为6位，精确到秒
     * -----          --------------
     * second         0-59
     * minute         0-59
     * hour           0-23
     * day of month   1-31
     * month          1-12 (or names, see below)
     * day of week    0-7 (0 or 7 is Sunday, or use names)
     * 
     * @param taskName 
     * @param expression 
     * @param onTick 
     */
    static async initTask(taskName: string, expression: string, onTick: () => void | Promise<void>) {
        if (this.taskMap[taskName]) {
            throw new Error('cron任务名称重复!')
        }

        const cronTime = new CronTime(expression)

        try {
            const rdb = RedisInstance.getCenterRedis()
            let nextRunTime = this.getNextRunTime(cronTime, timestamp())
            const lastRunTimeStr = await rdb.hGet(this.CRON_LAST_RUN_TIME_KEY, taskName)
            const lastRunTime = lastRunTimeStr ? parseInt(lastRunTimeStr) : 0
            if (lastRunTime > 0) {
                const nextRunTimeTemp = this.getNextRunTime(cronTime, lastRunTime)
                nextRunTime = Math.min(nextRunTime, nextRunTimeTemp)
            }

            const cronTask: CronTask = {
                taskName: taskName,
                cronTime: cronTime,
                nextRunTime: nextRunTime,
                onTick: async function () {
                    // 加锁
                    await RedisLock.runOrSkip(taskName, async () => {
                        // 获取redis任务执行时间是否已经执行过了,没有则立即执行
                        const lastRunTimeTmp = await rdb.hGet(CronService.CRON_LAST_RUN_TIME_KEY, taskName)
                        if (lastRunTimeTmp && parseInt(lastRunTimeTmp) >= this.nextRunTime) {
                            return
                        }
                        // 记录cron执行的时间戳
                        await rdb.hSet(CronService.CRON_LAST_RUN_TIME_KEY, taskName, this.nextRunTime)
                        // 执行任务
                        try {
                            if (APP_TYPE == E_APP_TYPE.API) {
                                await onTick()
                            } else {
                                await MessageHelper.syncDoFunc(async () => {
                                    await onTick()
                                })
                            }
                        } catch (err) {
                            log.error('执行业务task错误:', err)
                        }
                    })
                },
            }
            this.taskMap[taskName] = cronTask

            this.taskHeap.push(cronTask)

            //如果已经初始化完成，再尝试添加新的初始化任务。需要先清除当前的待执行任务，并调用runNextCronTask尝试执行下一个定时任务
            if (this.started) {
                this.clearTimeTicker()
                await this.runNextCronTask()
            }
        } catch (e) {
            throw new Error(`初始化cron任务: ${taskName} 异常.错误信息:${e}`)
        }

    }

    static async runNextCronTask() {

        try {
            for (; ;) {
                const cronTasks = this.taskHeap.top(1)
                if (cronTasks.length == 0) {
                    break
                }
                const cronTask = cronTasks[0]
                const execTime = cronTask.nextRunTime
                const nowTime = millisecond()
                let afterTime = execTime * 1000 - nowTime
                if (afterTime > 0) {
                    afterTime = Math.min(afterTime, this.maxDelayCheckTime)
                    // a,b两个任务, 检查b需要添加定时器, 第二轮如果a执行完b已经可运行则此时两条线并行运行
                    this.clearTimeTicker()
                    this.nextTimerTicker = tickAfter(afterTime, async () => {
                        try {
                            await this.runNextCronTask()
                        } catch (e) {
                            log.error(e)
                        }
                    })
                    break
                }
                this.taskHeap.pop()

                await cronTask.onTick()

                this.reAddCronTask(cronTask)
            }
        } catch (e) {
            log.error('执行runNextCronTask错误:', e)
        }
        this.started = true
    }

    private static reAddCronTask(cronTask: CronTask) {
        try {
            // 获取下一次执行的时间戳
            cronTask.nextRunTime = this.getNextRunTime(cronTask.cronTime, timestamp())
            this.taskHeap.push(cronTask)
        } catch (e) {
            // 删除任务
            delete this.taskMap[cronTask.taskName]
            log.error(`'获取下一个cron任务：${cronTask.taskName} 时间异常！`, e)
        }
    }

    static getNextRunTime(cronTime: CronTime, targetTime: int) {
        const targetDate = new Date(targetTime * 1000)
        const nextRunDate = cronTime.getNextDateFrom(targetDate)
        return nextRunDate.toUnixInteger()
    }

    static afterTimeAdd() {
        if (!this.started) {
            console.log('cron模块先初始化完成后才能设定时间偏移')
            return
        }
        // 清除上一次定时timer，并尝试执行最新的任务
        this.clearTimeTicker()

        this.runNextCronTask().catch(err => {
            log.error('afterTimeAdd:', err)
        })
    }

    private static clearTimeTicker() {
        if (this.nextTimerTicker) {
            this.nextTimerTicker.cancel()
        }
        this.nextTimerTicker = undefined
    }

    static stopAndClearCronTask() {
        this.clearTimeTicker()

        this.taskMap = {}
        this.taskHeap.clear()
        this.started = false
    }
}