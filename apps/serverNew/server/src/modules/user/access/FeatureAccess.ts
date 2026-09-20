import { User } from '../bean/User'
import { ReadonlyBean, timestamp } from '@arthropoda/game-engine'
import { UserForbidType } from '../../gm/rules/UserForbidType'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'

export class FeatureAccess {
    /**
     * 检查功能是否开启
     * @param user
     * @param id
     * @returns
     */
    static check(user: User | ReadonlyBean<User>, id: int) {
        return user !== undefined && id !== undefined
    }

    /**
     * 检查道具扣除是否封禁
     * @param user
     * @param cId
     * @returns
     */
    static checkCostPropForbid(user: User, cId: int) {
        const forbidType =
            cId === ItemIdDefine.ITEM_ID_GC
                ? UserForbidType.FORBID_GC
                : cId === ItemIdDefine.ITEM_ID_SC
                  ? UserForbidType.FORBID_SC
                  : UserForbidType.FORBID_CASH
        if (this.checkUserForbid(user, forbidType) || this.checkUserForbid(user, UserForbidType.FORBID_CASH)) {
            throw SystemErrors.ForbidBase
        }
    }

    /**
     * 检查功能是否封禁
     * @param user
     * @param type 封禁类型
     * @returns bool
     */
    static checkUserForbid(user: User | ReadonlyBean<User>, type: int) {
        const forbid = user.refuse?.get(type)
        return forbid !== undefined && (forbid.endTime === UserForbidType.FORBID_TIME || forbid.endTime > timestamp())
    }
}
