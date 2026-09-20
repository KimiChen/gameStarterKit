import { User } from '../../../src/modules/user/bean/User'
import { TelemetryEventWriter } from '../../../src/telemetry/TelemetryEventWriter'
import { UserTelemetryContext } from '../../../src/modules/user/telemetry/UserTelemetryContext'
import { TaMail } from '../models/TaMail'

/**
 * taBase_mail
 * 事件名:玩家邮件
 * 说明:玩家新增/首次阅读/领取/删除邮件后推送
 * @param user User
 */
export function taBase_mail(user: User) {
    try {
        if (!TelemetryEventWriter.isEnabled()) {
            return
        }

        const obj = new TaMail()

        // 字段名:邮件类型,示例:运营邮件
        obj.mail_type = ''
        // 字段名:邮件主题,示例:新年快乐
        obj.mail_title = ''
        // 字段名:邮件内容,示例:新年好呀，新年好呀
        obj.mail_content = ''
        // 字段名:附件内容,示例:炼体丹X5
        obj.awards = ''
        // 字段名:邮件状态,示例:新增邮件/首次阅读/领取/删除
        obj.mail_status = ''
        // 字段名:创建时间,示例:Thu Jan 01 1970 16:00:44 GMT+0800 (中国标准时间)
        obj.create_time = 0
        // 字段名:过期时间,示例:Thu Jan 01 1970 16:00:44 GMT+0800 (中国标准时间)
        obj.past_time = 0
        // 字段名:领取时间,示例:Thu Jan 01 1970 16:00:44 GMT+0800 (中国标准时间)
        obj.awards_time = 0

        UserTelemetryContext.record(obj, user)
    } catch (e) {
        Log.error(e)
    }
}
