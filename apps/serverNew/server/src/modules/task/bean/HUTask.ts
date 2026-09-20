import { Mod, ServerHash, UtilTime } from '@arthropoda/game-engine'
import { TaskTimeLimitItem } from './TaskTimeLimitItem'

export class HUTask extends ServerHash {
    /**
     * 玩家id
     */
    id: int = 0

    /**
     * 每日任务列表
     */
    @Mod
    dailyTask!: TaskTimeLimitItem

    /**
     * 周常任务列表
     */
    @Mod
    weekTask!: TaskTimeLimitItem

    expireTime(): int {
        return 32 * UtilTime.DAY_SECOND
    }
}
