import { timestamp } from '@arthropoda/game-engine'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { ReqPlantWake } from '../PlantC2S'
import { PlantErrors } from '../PlantErrors'
import { ActionPlant } from './ActionPlant'

/**
 * 唤醒
 */
export class ActionPlantWake extends ActionPlant {
    async doAction(req: ReqPlantWake, res: ResDefault) {
        const employeeId = req.id
        const now = timestamp()

        if (!this.user.plant.matureTime) {
            this.user.plant.matureTime = now + Param.PeachOrchardCd
        }

        // 未拥有
        if (!this.user.plant.employees.has(employeeId)) {
            throw SystemErrors.SysParamErr
        }

        const employee = this.user.plant.employees.get(employeeId)!

        // 不可唤醒状态
        if (!employee.isRelax) {
            throw PlantErrors.PlantCantWake
        }

        // 桃子已经成熟
        if (this.user.plant.matureTime <= now) {
            throw PlantErrors.PlantMature
        }

        // 唤醒次数不足
        if (this.user.plant.dayWakeEmpTimes >= Param.PeachOrchardSleepTimes) {
            throw PlantErrors.PlantNoWakeTimes
        }

        employee.isRelax = false
        employee.isReady = false

        // 减少成熟时间
        const after = this.user.plant.matureTime - Param.PeachOrchardWakeReTime
        this.user.plant.matureTime = Math.max(after, timestamp())

        // 记录唤醒次数
        this.user.plant.dayWakeEmpTimes++

        // 下一次摸鱼触发
        await ActionPlant.checkRelax(this.user)
    }
}
