import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { PropItem } from '../../../runtime/protocol/C2S/commom'
import { User } from '../../user/bean/User'
import { PropsErrors } from '../PropsErrors'
import { ItemIdDefine } from '../rules/ItemIdDefine'
import { Props } from './Props'

export class PropsUse {
    /**
     * 可以在背包里使用的道具类型
     */
    static readonly itemBagUseTypes: { [key: int]: int } = {
        [ItemIdDefine.ITEM_TYPE_BOX]: 1,
        [ItemIdDefine.ITEM_TYPE_COST_ITEM]: 1,
    }

    /**
     * 在背包使用道具
     * @param user
     * @param useProps
     */
    static async useProps(user: User, useProps: PropItem[]) {
        for (const item of useProps) {
            const costPropId = item.propId
            const costNum = item.num
            if (item.propId <= 0 || costNum <= 0) {
                throw SystemErrors.SysParamError
            }

            const propConf = C.item(costPropId)
            // 不可使用
            if (!this.itemBagUseTypes[propConf.type]) {
                throw PropsErrors.PropNoEnough
            }
            // 等级不足
            if (user.lv < propConf.lv) {
                throw PropsErrors.PropsLvLimit
            }

            switch (propConf.effectType) {
                case 2: //开宝箱
                    this.handleEffect_2(user, item)
                    break
                default:
                    throw PropsErrors.PropsNoUse
            }

            //消耗使用道具
            await Props.costProp(user, costPropId, costNum)
        }
    }

    /**
     * 处理开箱子
     * @param user
     * @param useProp
     */
    static handleEffect_2(user: User, useProp: PropItem) {}
}
