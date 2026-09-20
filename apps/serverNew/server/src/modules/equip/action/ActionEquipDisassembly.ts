import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { AwardResponse, PropItem } from '../../../runtime/protocol/C2S/commom'
import { Award } from '../../props/award/Award'
import { Props } from '../../props/inventory/Props'
import { ReqEquipDisassembly, ResEquipDisassembly } from '../EquipC2S'
import { EquipErrors } from '../EquipErrors'
import { EquipInventoryStore } from '../inventory/EquipInventoryStore'
import { EquipDefine } from '../rules/EquipDefine'

/**
 * 装备拆解
 */
export class ActionEquipDisassembly extends GameAction {
    async doAction(req: ReqEquipDisassembly, res: ResEquipDisassembly) {
        const user = this.user
        const ids = req.ids
        if (ids.length == 0) {
            throw SystemErrors.SysParamError
        }

        const awards: Map<int, PropItem> = new Map()
        for (const id of ids) {
            // 校验是否存在
            const equipPropItem = user.equip.equipProps.get(id)
            if (equipPropItem == null) {
                throw SystemErrors.SysParamError
            }

            // 判断装备是否被锁定
            if (equipPropItem.status == EquipDefine.STATUS_LOCK) {
                throw EquipErrors.EquipLock
            }

            // 装备已穿戴
            if (EquipInventoryStore.checkEquipWearEId(user, id)) {
                throw EquipErrors.EquipSameId
            }

            const equipConf = C.equip(equipPropItem.cId)
            Award.mergeAwards(awards, equipConf.award)

            // 移除该装备
            user.equip.equipProps.delete(id)
        }

        const resAward: AwardResponse = { awards: [] }
        // 奖励发放
        await Props.addProps(user, Array.from(awards.values()), resAward)

        res.awards = resAward
    }
}
