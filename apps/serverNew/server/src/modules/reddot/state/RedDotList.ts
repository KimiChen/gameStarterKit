import { User } from '../../user/bean/User'
import { RedDotBean } from '../bean/RedDotBean'
import { RedDotListBean } from '../bean/RedDotListBean'
import { RedDotDefine } from '../rules/RedDotDefine'
import { RedDotListMethod } from './RedDotListMethod'

export class RedDotList {
    static readonly TYPE_FRIEND_CHAT = 'friendChat'

    static readonly TYPE_SOCIAL_LOG = 'socialLog'

    static readonly TYPE_LIST_CROSS_ACTIVITY_CHAT_AT = 'crossActivityChatAt'

    public static readonly REDDOT_MAP = [
        RedDotList.TYPE_FRIEND_CHAT,
        RedDotList.TYPE_SOCIAL_LOG,
        RedDotList.TYPE_LIST_CROSS_ACTIVITY_CHAT_AT,
    ]

    public static updateRedDot(
        user: User,
        type: string,
        key: string | int,
        redNum: int = 1,
        changeType: string = RedDotDefine.CHANGE_TYPE_SET,
    ): boolean {
        if (!this.REDDOT_MAP.includes(type)) {
            return false
        }
        let redDotListItem = user.redDotList.get(type)
        if (!redDotListItem) {
            redDotListItem = new RedDotListBean({ type: type })
            user.redDotList.set(type, redDotListItem)
        }
        key = String(key)
        let redDotItem = redDotListItem.redDot.get(key)
        if (!redDotItem) {
            redDotItem = new RedDotBean({ type: key })
            redDotListItem.redDot.set(key, redDotItem)
        }
        if (changeType == RedDotDefine.CHANGE_TYPE_SET) {
            if (redDotItem.state !== redNum) {
                redDotItem.state = redNum
            }
        } else if (changeType == RedDotDefine.CHANGE_TYPE_INCR) {
            redDotItem.state += redNum
            redDotItem.state = Math.max(0, redDotItem.state)
        } else if (changeType == RedDotDefine.CHANGE_TYPE_DECR) {
            redDotItem.state -= redNum
            redDotItem.state = Math.max(0, redDotItem.state)
        }
        if (redDotItem.state <= 0) {
            redDotListItem.redDot.delete(redDotItem.type)
        }

        return true
    }

    public static clearRedDot(user: User, type: string, key: string | int, extraId = 0): void {
        key = String(key)
        const redDotListItem = user.redDotList.get(type)
        if (redDotListItem && redDotListItem.redDot.has(key)) {
            const item = redDotListItem.redDot.get(key)!
            if (extraId > 0 && item.extraIds.includes(extraId)) {
                item.extraIds.removeBy(extraId)
            }
            if (item.extraIds.length() == 0) {
                redDotListItem.redDot.delete(key)
            }
        }
    }

    public static clearNotInKeysRedDot(user: User, type: string, keys: string[]): void {
        const redDotListItem = user.redDotList.get(type)
        if (redDotListItem) {
            redDotListItem.redDot.forEach((v, k) => {
                if (!keys.includes(k)) {
                    redDotListItem.redDot.delete(k)
                }
            })
        }
    }

    static formatModDoList(user: User) {
        const rdMethod = new RedDotListMethod(user)
        RedDotDefine.REDDOT_MAP.forEach((typeName) => {
            const listItem = user.redDotList.get(typeName)
            if (!listItem) {
                return
            }
            listItem.redDot.forEach((rItem) => {
                if (typeof (rdMethod as any)[typeName] == 'function') {
                    ;(rdMethod as any)[typeName](rItem.type)
                }
            })
        })
    }
}
