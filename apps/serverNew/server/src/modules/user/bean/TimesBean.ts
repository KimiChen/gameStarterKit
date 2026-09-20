import { Listen } from '@arthropoda/game-engine'
import { Bean } from '@arthropoda/game-engine'
import { ListenTimesHandler } from '../event/ListenComm'

export class TimesBean extends Bean {
    /**
     * 次数
     */
    @Listen(ListenTimesHandler)
    times: int = 0

    /**
     * 上次记录时间
     */
    lastTime: int = 0

    /**
     * 暂停开始时间
     */
    stopTime: int = 0
}
