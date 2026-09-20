import { UtilTime } from '@arthropoda/game-engine'
import { MailModel } from '../../../../generated/persistence/MailModel'
import { EmailHandleEmailType } from '../http/gm/EmailHandleEmailType'
import { GmEmailHandleTiming } from '../http/gm/GmEmailHandleTiming'

export async function handleGmMailTiming() {
    await new GmEmailHandleTiming().handleTiming()
}

export async function handleGmMailType() {
    await new EmailHandleEmailType().handleEmailType()
}

export async function cleanupExpiredMail() {
    const oneBatchMax = 30000
    const pastTime = UtilTime.getDayStartTime() - UtilTime.WEEK_SECOND
    const result = await MailModel.createQueryBuilder()
        .limit(oneBatchMax)
        .delete()
        .where(`${MailModel.f_m_past_time} <= :pastTime`, { pastTime })
        .execute()
    const deletedCount = result.affected ?? 0
    if (deletedCount > 0) Log.info(`删除七天前过期邮件：pastTime：${pastTime}，删除数量：${deletedCount}`)
}
