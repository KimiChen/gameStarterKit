import { GameAction } from '../../../runtime/action/GameAction'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Attr } from '../../attr/calculation/Attr'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { ReqUserAttrAdd, ResUserAttrAdd } from '../UserC2S'
import { UserErrors } from '../UserErrors'

/**
 * 自由属性加点
 */
export class ActionUserAttrAdd extends GameAction {
    async doAction(req: ReqUserAttrAdd, res: ResUserAttrAdd) {
        const user = this.user
        const adds = req.adds

        // 旧的加点
        const modAttrs = Attr.getAttrModItem(user, AttrModDefine.Addition).attrs.copy()

        for (const add of adds) {
            const attrType = add.attrType
            const val = add.val

            // 点数不足
            if (user.attr.point < val) {
                throw UserErrors.UserNumIsSmall
            }

            user.attr.point -= val

            let item = modAttrs.get(attrType)
            if (item == null) {
                item = new AttrTypeBean()
                item.type = attrType
                modAttrs.set(attrType, item)
            }

            item.val += val
        }

        // 更新属性
        Attr.updateAttrModItem(user, AttrModDefine.Addition, modAttrs)

        // 更新评分

        // 属性加点任务
    }
}
