import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Attr } from '../../attr/calculation/Attr'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { UserFp } from '../../user/action/UserFp'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { ReqEquipFashionWear, ResEquipFashionWear } from '../EquipC2S'
import { EquipErrors } from '../EquipErrors'
import { FashionWearBean } from '../bean/FashionWearBean'
import { EquipFashion } from '../inventory/EquipFashion'
import { EquipDefine } from '../rules/EquipDefine'

/**
 * 时装穿戴｜卸下
 */
export class ActionEquipFashionWear extends GameAction {
    async doAction(req: ReqEquipFashionWear, res: ResEquipFashionWear) {
        const user = this.user

        const mores = req.cIds
        for (const more of mores) {
            const type = more.type
            const cId = more.cId
            if (!type || EquipDefine.FASHION_TYPES[type] == null) {
                throw SystemErrors.SysParamError
            }

            // 当前穿戴的时装
            const fashionWear = EquipFashion.getFashionWearItem(user, type)

            if (cId) {
                wearFashion(user, fashionWear, cId)
            } else {
                unloadFashion(user, fashionWear)
            }
        }

        // 时装强度评分更新
        UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_FASHION_WEAR)
    }
}

/**
 * 穿戴时装
 * @param user
 * @param fashionWear
 * @param cId
 */
function wearFashion(user: User, fashionWear: FashionWearBean, cId: int) {
    const conf = C.equip_fashion(cId)

    // 穿戴类型不一致
    if (fashionWear.type !== conf.fashionType) {
        throw SystemErrors.SysParamError
    }

    // 衣服时装校验
    if (conf.fashionType == EquipDefine.CLOTHES) {
        const fashion = user.fashion.fashions.get(cId) ?? null
        // 时装不存在
        if (fashion === null) {
            throw SystemErrors.SysParamError
        }
        // 时装耐久不足
        if (fashion.durable <= 0) {
            throw EquipErrors.FashionNotDurable
        }
    }

    // 已穿戴
    if (fashionWear.cId == cId) {
        throw SystemErrors.SysParamError
    }

    fashionWear.cId = cId

    // 时装衣服同步场景
    // const params: { [key: string]: int } = {}
    // params[EquipDefine.FASHION_TYPES[conf.fashionType]] = cId;
    // // 有耐久的衣服
    // if (fashionWear.type === EquipDefine.CLOTHES) {
    //    const fashion = user.fashions.get(cId)
    //    if (fashion == null)
    //       continue
    //    params['bag'] = [fashion.cId => fashion.durable];
    // }
    // SceneSync.sync_UserAttrs(this.uId, params);

    // 属性变化同步
    const fashionAttrs = EquipDefine.getFashionAttrs(user)
    Attr.updateAttrModItem(user, AttrModDefine.EquipFashion, fashionAttrs)
}

/**
 * 卸载时装
 * @param user
 * @param fashionWear
 */
function unloadFashion(user: User, fashionWear: FashionWearBean) {
    // 卸下
    if (!fashionWear.cId) {
        throw EquipErrors.EquipNoWear
    }

    EquipFashion.unloadFashion(user, 0, fashionWear)
}
