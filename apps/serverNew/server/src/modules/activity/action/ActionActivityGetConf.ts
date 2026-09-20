import { map2Object } from '@arthropoda/game-engine'
import { ReqActivityGetConf, ResActivityGetConf } from '../ActivityC2S'
import { GameAction } from '../../../runtime/action/GameAction'
import { ActivityClientAssembler } from '../client/ActivityClientAssembler'
import { ActivitySchedule } from '../scheduling/ActivitySchedule'
import { ActivityScheduleResolver } from '../scheduling/ActivityScheduleResolver'
import { UserAccessRules } from '../../user/rules/UserAccessRules'

/**
 * 加载活动配置
 */
export class ActionActivityGetConf extends GameAction {
    async doAction(req: ReqActivityGetConf, res: ResActivityGetConf) {
        const confList = req.confList.map((el) => {
            el.id ??= 0
            el.name ??= ''
            el.salt ??= ''
            return el
        })
        if (confList.length == 0) {
            return
        }
        const user = this.user
        // 白盒测试，若为白名单玩家可以获取任意一个活动的配置
        const isWhite = UserAccessRules.isActivityWhitelisted()

        res.l = []
        for (const confInfo of confList) {
            const listConf = C.list(confInfo.name)
            // 策划配置表
            if (!listConf) {
                continue
            }
            let activityOpenInfo = new ActivitySchedule()
            if (isWhite) {
                activityOpenInfo.id = confInfo.id
                activityOpenInfo.salt = confInfo.salt
                activityOpenInfo.name = listConf.activityName
            } else {
                const tmp = await ActivityScheduleResolver.getOpen(this.user.sId, listConf.activityName, this.user)
                if (!tmp) {
                    // 不是白名单，活动没开启，直接跳过
                    continue
                }
                activityOpenInfo = tmp
            }

            // 重新构造活动配置，根据传过来的盐值和ID获取活动配置

            // 获取活动配置
            const activityConf = await ActivityClientAssembler.getActivityConf(
                user.sId,
                listConf,
                activityOpenInfo,
                isWhite,
            )
            if (!activityConf) {
                continue
            }

            res.l.push({
                name: activityOpenInfo.name,
                content: JSON.stringify(map2Object(activityConf)),
                salt: activityOpenInfo.salt,
                configName: listConf.fromName,
                configAll: listConf.fromDB != 1,
                id: activityOpenInfo.id,
                path: activityOpenInfo.name,
            })
        }
    }
}
