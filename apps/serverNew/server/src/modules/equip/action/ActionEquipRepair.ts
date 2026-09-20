import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { Props } from '../../props/inventory/Props'
import { ReqEquipRepair } from '../EquipC2S'
import { EquipErrors } from '../EquipErrors'
import { EquipAttributeSync } from '../inventory/EquipAttributeSync'
import { EquipDisplayFormatter } from '../inventory/EquipDisplayFormatter'
import { EquipDurability } from '../inventory/EquipDurability'
import { EquipPowerCalculator } from '../inventory/EquipPowerCalculator'
import { EquipDefine } from '../rules/EquipDefine'

/**
 * 修复装备
 */
export class ActionEquipRepair extends GameAction {
    async doAction(req: ReqEquipRepair, res: ResDefault) {
        const id = req.id
        const num = req.num

        // 恢复点数判断
        if (num <= 0) {
            throw SystemErrors.SysParamErr
        }

        // 装备库不存在该装备
        const equipPropItem = this.user.equip.equipProps.get(id)
        if (!equipPropItem) {
            throw EquipErrors.EquipDisassembly
        }

        // 装备配置
        const equipConf = C.equip(equipPropItem.cId)

        // 耐久满不可修复
        if (equipPropItem.durable + num > equipConf.durable) {
            throw SystemErrors.SysParamErr
        }

        // 单个恢复消耗
        const [costId, costOneNum, costColorOneNum] = equipConf.recoverCost

        // 消耗
        let cost = costOneNum
        // 彩色变异消耗
        if (costColorOneNum && equipPropItem.effects.includes(EquipDefine.EFFECT_ID_21)) {
            cost = costColorOneNum
        }

        // 扣除恢复消耗
        await Props.costProp(this.user, costId, cost * num)

        // 恢复耐久
        const needUpdate = EquipDurability.changeEquipDurable(this.user, id, num)

        // 同步穿戴信息
        // SceneSync.syncServer(this.uId, SceneSyncManager.SYNC_TYPE_ATTR, ['equips' => serialize(Equip.turnSceneEquips(this.user))]);

        // 是否需要更新数值
        if (!needUpdate) {
            return
        }

        // 若为穿戴装备则同步属性
        const equipPosWear = this.user.equip.equips.get(equipConf.position)
        if (equipPosWear && equipPosWear.id === id) {
            // 更新宝石模块属性
            EquipAttributeSync.updateGemAttrs(this.user)

            // 更新玩家装备属性
            EquipAttributeSync.updateEquipAttrs(this.user)

            // 更新fp相关
            await EquipPowerCalculator.updateUserEquipFpAndRank(this.user)

            // 穿戴榜单更新
            await EquipDisplayFormatter.updateWearEquipRank(this.user.id, equipConf.position, equipPropItem)
        }
    }
}
