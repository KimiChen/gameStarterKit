import { EquipAttributeSync } from '../../equip/inventory/EquipAttributeSync'
import { EquipDisplayFormatter } from '../../equip/inventory/EquipDisplayFormatter'
import { EquipWearRules } from '../../equip/inventory/EquipWearRules'
import { Props } from '../../props/inventory/Props'
import { Attr } from '../../attr/calculation/Attr'
import { UserFp } from '../../user/action/UserFp'
import { EquipBean } from '../../equip/bean/EquipBean'
import { AttrModDefine } from '../../attr/rules/AttrModDefine'
import { PowerScoreRules } from '../../user/rules/PowerScoreRules'
import { AdjustChange } from './AdjustChange'

export class AdjustEquipmentCommands extends AdjustChange {
    /**
     * 添加所有装备
     * @group 基础工具
     * @canCustom
     * @sort  98
     */
    async equipAddAll() {
        for (const [, item] of C.equip()) await Props.addProp(this.user, item.id, 1)
    }

    /**
     * 一键穿戴装备
     * @group 基础工具
     * @canCustom
     * @sort  98
     */
    async equipWear() {
        for (const pos of [1, 2, 3, 4, 5, 6]) {
            for (const [, equip] of this.user.equip.equipProps) {
                const conf = C.equip(equip.cId)
                if (conf.position != pos) continue

                let equipItem = this.user.equip.equips.get(pos)
                if (equipItem == null) {
                    equipItem = new EquipBean({ pos })
                    this.user.equip.equips.set(pos, equipItem)
                }
                equipItem.id = equip.id
                EquipWearRules.updateEquipPosHis(this.user, pos, conf)
                Attr.updateAttrModItem(
                    this.user,
                    AttrModDefine.EquipGem,
                    EquipAttributeSync.getGemAttrs(this.user),
                    false,
                )
                UserFp.updateUserFp(this.user, PowerScoreRules.FP_TYPE_GEM)
                EquipAttributeSync.updateEquipAttrs(this.user)
                UserFp.updateUserFp(this.user, PowerScoreRules.FP_TYPE_EQUIP)
                UserFp.updateUserFp(this.user, PowerScoreRules.FP_TYPE_EQUIP_ENTRY)
                UserFp.updateUserFp(this.user, PowerScoreRules.FP_TYPE_EQUIP_EFFECT)
                EquipDisplayFormatter.updateEquipWearShow(this.user)
            }
        }
    }
}
