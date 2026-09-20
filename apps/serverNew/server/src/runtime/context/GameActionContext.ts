import { ContextLogic } from '@arthropoda/game-engine'
import { User } from '../../modules/user/bean/User'
import { MailPropItem } from '../protocol/S2S/commom'
import { MailModel } from '../../../generated/persistence/MailModel'
import { ActivitySchedule } from '../../modules/activity/scheduling/ActivitySchedule'
import { TelemetryEventWriter } from '../../telemetry/TelemetryEventWriter'

type typeRpcAndQueueSendCB = () => void | Promise<void>

export class GameActionContext extends ContextLogic {
    user: any = undefined

    num = 0

    /** 游戏配置表名对应的配置空间key,例如处理活动相关action过程时活动配置不变 */
    gameTableName2SpaceKey?: Record<string, string>

    /** 活动名对应的openInfo缓存, 例如处理活动相关action过程时活动openInfo不变*/
    activityName2openInfo?: Record<int, Record<string, ActivitySchedule>>

    get userBase(): User {
        return this.user as User
    }

    /** 对其他微服务发起异步请求时等待当前action执行完毕才发起,保障本业务数据已经落库了才转发 */
    rpcAndQueueSendCB: typeRpcAndQueueSendCB[] = []

    /** @var array 邮件信息暂存, 业务结束再一并发送 */
    mailRecords?: {
        count: number
        uIds: { [uid: number]: boolean } //涉及的uid
        mails: { mail: Partial<MailModel>; uIds: number[]; awards: MailPropItem[] }[]
    }

    _ta: any = undefined

    get ta(): TelemetryEventWriter {
        return this._ta as TelemetryEventWriter
    }
}
