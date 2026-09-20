import { UtilTime } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Props } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { UserPower } from '../../user/action/UserPower'
import { ReqPracticeNpcDaily, ResPracticeNpcDaily } from '../PracticeC2S'

const DAILY_NOON = 2 // 中午
const DAILY_NIGHT = 3 // 晚上
const DAILY_SMALL_VIP_NOON = 21 // 小月卡中午
const DAILY_SMALL_VIP_NIGHT = 31 // 小月卡晚上
const DAILY_MAX_VIP_NOON = 22 // 大月卡中午
const DAILY_MAX_VIP_NIGHT = 32 // 大月卡晚上

export class ActionPracticeNpcDaily extends GameAction {
    async doAction(req: ReqPracticeNpcDaily, res: ResPracticeNpcDaily) {
        const user = this.user
        const id = req.type
        const ids = user.practice.practicePowerIds.copy()
        const hour = UtilTime.getCurHour()
        const awardIds: Array<int> = []
        let beginHour = 0
        let endHour = 0
        let basePower = 0
        let smallAwardId = 0
        let maxAwardId = 0
        if (id === DAILY_NOON) {
            // 领取中午档
            beginHour = Param.noonReceiveEnergyStart
            endHour = Param.noonReceiveEnergyEND
            basePower = Param.noonReceiveEnergy
            smallAwardId = DAILY_SMALL_VIP_NOON
            maxAwardId = DAILY_MAX_VIP_NOON
        } else if (id === DAILY_NIGHT) {
            beginHour = Param.nightReceiveEnergyStart
            endHour = Param.nightReceiveEnergyEND
            basePower = Param.nightReceiveEnergy
            smallAwardId = DAILY_SMALL_VIP_NIGHT
            maxAwardId = DAILY_MAX_VIP_NIGHT
        } else {
            throw SystemErrors.SysParamError
        }

        // 检测是否在领取时段
        if (hour < beginHour || hour >= endHour) {
            throw SystemErrors.SysParamError
        }

        const addPower = calcAddPower(id, ids, basePower, smallAwardId, maxAwardId, awardIds)
        if (!addPower) {
            // 无奖励领取
            throw SystemErrors.SysParamError
        }

        if (UserPower.recovery(user) === 0) {
            throw SystemErrors.SysParamError
        }

        await Props.addProp(user, ItemIdDefine.ITEM_ID_POWER, addPower, res.award)

        for (const awardId of awardIds) {
            user.practice.practicePowerIds.set(awardId, awardId)
        }

        return
    }
}

function calcAddPower(id: int, ids: int[], basePower: int, smallAwardId: int, maxAwardId: int, awardIds: int[]) {
    let addPower = 0
    const ret = ids.find((f) => f === id)
    if (ret) {
        addPower += basePower
        awardIds.push(id)
    }
    return addPower
}
