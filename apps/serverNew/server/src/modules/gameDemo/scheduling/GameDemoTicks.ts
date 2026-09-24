import { CronService } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'

/**
 * 每秒推进活动与 Boss：只按 `taskGroupId` 发出 LocalAction，状态修改都在对应资源的 Action 里完成。
 *
 * 定时任务名带上区服号：`CronService` 的防重锁与上次执行时间记录在 center Redis，多个区服共用；
 * 模块级 `cron` 贡献的名字不区分区服，会让不同区服的推进互相跳过。
 */
export class GameDemoTicks {
    static async start(): Promise<void> {
        await CronService.initTask(`gameDemo:tick:${SERVER_ID}`, '* * * * * *', () => {
            LocalAction.send('gameDemo/GameDemoSeasonTick', {}, 0, SERVER_ID)
            LocalAction.send('gameDemo/GameDemoBossTick', {}, 0, SERVER_ID)
        })
    }
}
