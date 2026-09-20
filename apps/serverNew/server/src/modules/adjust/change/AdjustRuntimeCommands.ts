import { CronService, RedisInstance, TimeAdd, strtotime, timestamp } from '@arthropoda/game-engine'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { ActionConfigReload } from '../action/ActionConfigReload'
import { ActionTimeAddChange } from '../action/ActionTimeAddChange'
import { AdjustChange } from './AdjustChange'

export class AdjustRuntimeCommands extends AdjustChange {
    /**
     * 时间修改(例如2024-04-04 05:00:00)(apiCron需要重启)
     * @param timeFormat 输入日期
     * @group 基础工具
     */
    addTime(timeFormat: string) {
        const newTime = strtotime(timeFormat)
        if (!newTime) return { status: 100, msg: '请输入正确的时间格式' }
        const addSecond = newTime - timestamp()
        if (addSecond < 0) return { status: 100, msg: '时间不能往前调啊' }

        TimeAdd.addTime(addSecond)
        RedisInstance.getCenterRedis()
            .incrBy(TimeAdd.TIME_ADD_KEY, addSecond)
            .catch((error) => Log.error(error))
        CronService.afterTimeAdd()
        LocalAction.broadcast(ActionTimeAddChange, { timeFormat })
    }

    /**
     * 重新配置加载
     * @group 基础工具
     */
    configReload() {
        LocalAction.broadcast(ActionConfigReload, {})
    }
}
