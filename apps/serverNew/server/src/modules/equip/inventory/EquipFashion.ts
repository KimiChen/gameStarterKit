import { UtilObject, getServerIdByUid } from '@arthropoda/game-engine'
import { AwardResponse, PropItem } from '../../../runtime/protocol/C2S/commom'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { ActivityRankUpdate } from '../../activity/rank/ActivityRankUpdate'
import { ActivityDefine } from '../../activity/rules/ActivityDefine'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Attr } from '../../attr/calculation/Attr'
import { AttrDefine } from '../../attr/rules/AttrDefine'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { AttributeScale } from '../../attr/rules/AttributeScale'
import { Props, PropsExtra } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { SceneEquip } from '../../scene/model/SceneEquip'
import { SystemInfoDefine } from '../../serverSettings/runtime/SystemInfoDefine'
import { UserEvil } from '../../user/action/UserEvil'
import { UserFp } from '../../user/action/UserFp'
import { UserAppearance } from '../../user/action/UserAppearance'
import { User } from '../../user/bean/User'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { EquipErrors } from '../EquipErrors'
import { EntryBean } from '../bean/EntryBean'
import { EquipPropBean } from '../bean/EquipPropBean'
import { FashionBean } from '../bean/FashionBean'
import { FashionWearBean } from '../bean/FashionWearBean'
import { EquipForge } from '../forge/EquipForge'
import { EquipForgeUseProp } from '../forge/EquipForgeUseProp'
import { EquipDefine } from '../rules/EquipDefine'

export class EquipFashion {
    // #endregion

    //#region 时装
    /**
     * 新增时装
     * @param HUser user
     * @param int   cId
     * @param int   addNum
     * @return array
     * @throws \Throwable
     */
    static addFashion(user: User, cId: int, addNum: int) {
        const fashionConf = C.equip_fashion(cId)

        // 判断非通用 非同种族 跳过
        if (fashionConf.race > 0 && fashionConf.race !== user.race) {
            return
        }

        // 已有该时装
        let fashionItem = user.fashion.fashions.get(cId)
        let reason = '已拥有转耐久'
        if (!fashionItem) {
            fashionItem = new FashionBean({
                cId: cId,
                type: fashionConf.fashionType,
                durable: fashionConf.durable,
            })
            user.fashion.fashions.set(cId, fashionItem)
            // 首次获得-1，剩余转化为耐久
            addNum -= 1
            UserAppearance.change(user, fashionConf.showValue)
            // 任务埋点
            // TaskHelper.update(user, 1, TaskDefine.TARGET_1033_COLLECT_COSTUME)
            reason = '激活'

            // 属性变化同步
            const fashionAttrs = EquipDefine.getFashionAttrs(user)
            Attr.updateAttrModItem(user, AttrModDefine.EquipFashion, fashionAttrs)

            // 时装强度评分更新
            UserFp.updateUserFp(user, PowerScoreRules.FP_TYPE_FASHION)

            // 任务更新
            // TaskHelper.update(user, 1, TaskDefine.TARGET_1094_CLOTH)
        }

        // 重复获得变化为耐久
        if (addNum > 0) {
            if (fashionConf.fashionType === EquipDefine.CLOTHES) {
                // 衣服重复获得转耐久
                const durable = fashionConf.durable * addNum
                // 增加耐久
                Props.changeDurable(user, cId, durable, ItemIdDefine.DURABLE_FIELD_NAME.fashionItems)
            } else if (C.item(cId).recoup) {
                // const [propId, num] = C.item(cId).recoup
                // const  revNum = addNum * num;
                // propId && num && await Props.addProp(user, propId, revNum);
                // Push.sendSystemInfoById(SystemInfoDefine.PropConvert_71,
                //     [
                //         [SystemInfoDefine.PARAM_AWARDS, [PropItem.new(cId, addNum)]],
                //         [SystemInfoDefine.PARAM_ITEM_AWARD_ICON, [PropItem.new(propId, revNum)]]
                //     ],
                //     [Push.ARGS_UIDS => [user.id]]
                // )
            }
        }
        // 数数
        // TaModuleClothing.clothing(user, fashionConf, reason);
    }

    /**
     * 获取时装穿戴对象
     * @param user
     * @param type
     * @returns
     */
    static getFashionWearItem(user: User, type: int) {
        let fashionWearItem = user.fashion.fashionWear.get(type)
        if (!fashionWearItem) {
            fashionWearItem = new FashionWearBean(type)
            user.fashion.fashionWear.set(type, fashionWearItem)
        }
        return fashionWearItem
    }

    /**
     * 卸下时装
     * @param user
     * @param cId
     * @param fashionWear
     */
    static unloadFashion(user: User, cId = 0, fashionWear?: FashionWearBean): void {
        // 获取时装配表
        if (cId > 0) {
            const fashionConf = C.equip_fashion(cId)
            fashionWear = user.fashion.fashionWear.get(fashionConf.fashionType)
        }

        // 时装不存在
        if (!fashionWear) {
            throw EquipErrors.EquipNoWear
        }

        // 卸下时装
        fashionWear.cId = 0

        // 属性变化同步
        const fashionAttrs = EquipDefine.getFashionAttrs(user)
        Attr.updateAttrModItem(user, AttrModDefine.EquipFashion, fashionAttrs)

        // 卸下时装衣服同步场景
        // SceneSync.sync_UserAttrs(user.id, [EquipDefine.FASHION_TYPES[fashionWear.type] => 0]);
    }
}
