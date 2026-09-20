import { User } from '../../user/bean/User'
import { RedDotDefine } from '../rules/RedDotDefine'
import { RedDotMethod } from './RedDotMethod'

export class RedDotStateSync {
    static updateRedDot(user: User, type: string, redNum: int = 1, changeType: string = RedDotDefine.CHANGE_TYPE_SET) {
        if (!RedDotDefine.REDDOT_MAP.includes(type)) {
            return false
        }
        if (!user.redDot.has(type)) {
            // user.redDot.set(type, new RedDotBean({ type: type }))
            user.redDot.set(type, { type: type, state: 0 })
        }
        const redDot = user.redDot.get(type)!

        if (changeType === RedDotDefine.CHANGE_TYPE_SET) {
            if (redDot.state === redNum) {
                return true
            }
            redDot.state = redNum
        } else if (changeType === RedDotDefine.CHANGE_TYPE_INCR) {
            redDot.state += redNum
            redDot.state = Math.max(0, redDot.state)
        } else if (changeType === RedDotDefine.CHANGE_TYPE_DECR) {
            redDot.state -= redNum
            redDot.state = Math.max(0, redDot.state)
        }
        return true
    }

    static clearRedDot(user: User, type: string, extraId = 0) {
        const redDot = user.redDot.get(type)
        if (!redDot) {
            return
        }
        if (extraId > 0 && redDot.extraIds.includes(extraId)) {
            redDot.extraIds.removeBy(extraId)
        }
        if (redDot.extraIds.length() == 0) {
            redDot.state = 0
        }
    }

    static formatModDoList(user: User) {
        const rdMethod = new RedDotMethod(user)
        RedDotDefine.REDDOT_MAP.forEach((typeName) => {
            if (typeof (rdMethod as any)[typeName] == 'function') {
                ;(rdMethod as any)[typeName]()
            }
        })
    }
}
