import { timestamp } from '@arthropoda/game-engine'
import { FeatureAccess } from '../../user/access/FeatureAccess'
import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { User } from '../../user/bean/User'
import { PayErrors } from '../PayErrors'
import { PayProductTypes } from '../rules/PayProductTypes'

export interface PayExtraParams {
    giftId?: int
    channel?: string
    activityName?: string
}

export class PayCheckoutRules {
    static checkBuyStatus(user: User, config: IConfRecharge, params: PayExtraParams) {
        let allowed = false
        switch (config.type) {
            case PayProductTypes.TYPE_GC:
            case PayProductTypes.TYPE_TQ:
                allowed = true
                break
            case PayProductTypes.TYPE_FIRST_GIFT:
                allowed = FeatureAccess.check(user, ModuleOpenType.SYS_FIRST_GIFT)
                break
            case PayProductTypes.TYPE_DAILY_GIFT:
                allowed = Boolean(params.giftId)
                break
            case PayProductTypes.TYPE_GUILD_WAR_GIFT:
                allowed = Boolean(params.activityName)
                break
        }
        if (!allowed) throw PayErrors.PayLimitNum
    }

    static hasPrivilege(user: User, privilegeType: int) {
        const privilege = user.tq.get(privilegeType)
        return Boolean(privilege && privilege.outTime >= timestamp())
    }
}
