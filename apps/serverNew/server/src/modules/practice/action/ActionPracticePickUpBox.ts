import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { AwardResponse } from '../../../runtime/protocol/C2S/commom'
import { EquipInventoryStore } from '../../equip/inventory/EquipInventoryStore'
import { Props, PropsExtra } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { User } from '../../user/bean/User'
import { ReqPracticePickUpBox, ResPracticePickUpBox } from '../PracticeC2S'
import { ActionPractice } from './ActionPractice'

/**
 * 捡起宝箱
 */
export class ActionPracticePickUpBox extends ActionPractice {
    async doAction(req: ReqPracticePickUpBox, res: ResPracticePickUpBox) {
        const type = req.type
        const value = req.value
        const user = this.user
        switch (type) {
            case ActionPractice.PICK_UP_TYPE_QUALITY: {
                await pickUpByQuality(user, value, res.award)
                break
            }
            case ActionPractice.PICK_UP_TYPE_PROP_ID:
                await pickUpByPropId(user, value, res.award, req.targetId)
                break
        }
        return
    }
}

async function pickUpByQuality(user: User, quality: int, response: AwardResponse) {
    if (quality < 1 || quality > Param.OpenDropLimit) {
        throw SystemErrors.SysParamError
    }
    const practiceItem = ActionPractice.getPracticeItem(user)
    await ActionPractice.batchOpenBox(user, practiceItem.killedAwards, response, quality)
}

async function pickUpByPropId(user: User, propId: int, response: AwardResponse, targetId: int = 0) {
    const practiceItem = ActionPractice.getPracticeItem(user)
    if (!practiceItem.killedAwards.has(propId) || practiceItem.killedAwards.get(propId)!.num < 1) {
        throw SystemErrors.SysParamError
    }

    const curEquipNum = EquipInventoryStore.getEquipNum(user)
    const itemConf = C.item(propId)
    const extraData: Map<int, int[]> = new Map<int, int[]>()
    if (itemConf.type === ItemIdDefine.ITEM_TYPE_EQUIPMENT) {
        // 装备
        if (curEquipNum + 1 > Param.EquipNumMax) {
            throw SystemErrors.SysParamError
        }

        const effects = ActionPractice.getPracticeEquipEffects(user, practiceItem.killedAwards.get(propId)!, targetId)
        if (effects !== undefined) {
            extraData.set(Props.EXTRA_DATA_TYPE, effects)
        }
    }
    practiceItem.killedAwards.get(propId)!.num--
    if (practiceItem.killedAwards.get(propId)!.num < 1) {
        practiceItem.killedAwards.delete(propId)
    }

    // 下发奖励
    const r: PropsExtra = {
        reason: '',
        practiceEffectIds: extraData.get(Props.EXTRA_DATA_TYPE),
    }
    await Props.addProp(user, propId, 1, response, r)
}
