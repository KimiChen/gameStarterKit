import { UtilTime, timestamp } from '@arthropoda/game-engine'
import { QueuedLocalAction as QueueAction } from '../../../runtime/action/QueuedLocalAction'
import { PropItem } from '../../../runtime/protocol/C2S/commom'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { PayCheckoutRules } from '../../pay/checkout/PayCheckoutRules'
import { Props } from '../../props/inventory/Props'
import { ReqPlantHarvest, ResPlantHarvest } from '../PlantC2S'
import { PlantErrors } from '../PlantErrors'
import { ActionPlantSetEmpRelax } from './ActionPlantSetEmpRelax'
import { ActionPlant } from './ActionPlant'

/**
 * 收获
 */
export class ActionPlantHarvest extends ActionPlant {
    async doAction(req: ReqPlantHarvest, res: ResPlantHarvest) {
        const now = timestamp()
        if (!this.user.plant.matureTime) {
            this.user.plant.matureTime = now + Param.PeachOrchardCd
        }

        // 还未到成熟时间
        if (this.user.plant.matureTime > now) {
            throw PlantErrors.PlantNotMature
        }

        // 超过领取次数
        if (this.user.plant.dayPlantAwardTimes >= Param.PeachOrchardDailyTimes) {
            throw PlantErrors.PlantNotTimes
        }

        // 成熟次数
        let harvestTimes = Math.floor((now - this.user.plant.matureTime) / Param.PeachOrchardCd) + 1
        harvestTimes = Math.min(harvestTimes, Param.PeachOrchardMaxTimes)

        const awards: PropItem[] = []
        // 权重列表
        const proArr: Map<number, number> = new Map()
        for (const [, employee] of this.user.plant.employees) {
            const empConf = C.peach_orchard(employee.id)
            if (empConf.privilegeId && !PayCheckoutRules.hasPrivilege(this.user, empConf.privilegeId)) {
                //  特权卡专属青蛙
                continue
            }

            const lvConf = empConf.detail.get(employee.lv)
            awards.push({ propId: lvConf.cropsPropId, num: lvConf.cropsNum * harvestTimes })

            // 唤醒
            employee.isRelax = false
            employee.isReady = false

            // 未触发摸鱼概率
            if (!GameRandom.getProbability(empConf.sleepProb)) {
                // 收集工作中青蛙的摸鱼权重
                proArr.set(employee.id, empConf.sleepProb)
                continue
            }

            await ActionPlant.setRelaxById(this.user, employee)
        }
        // 领取桃子
        await Props.addProps(this.user, awards, res.awards)
        this.user.plant.dayPlantAwardTimes += harvestTimes

        // 数数
        // TaModulePlant.plantHarvest(this.user);

        // 任务
        // TaskHelper.update(this.user, 1, TaskDefine.TARGET_1099_PLANT_HARVEST);

        if (this.user.plant.dayPlantAwardTimes >= Param.PeachOrchardDailyTimes) {
            for (const [, employee] of this.user.plant.employees) {
                // 摸鱼中的青蛙要唤醒
                employee.isRelax = false

                // 删除存在的摸鱼定时器
                await QueueAction.delTimerRpc(
                    ActionPlantSetEmpRelax,
                    {
                        uId: this.user.id,
                        empId: employee.id,
                    },
                    this.user.id,
                    this.user.sId,
                )
            }

            // 领取次数已满，需要在下一天凌晨四点可以领取
            this.user.plant.matureTime = UtilTime.nextDayTime() + Param.PeachOrchardCd
            return
        }

        if (harvestTimes !== Param.PeachOrchardMaxTimes) {
            // 非最大成熟次数，设置下次成熟时间
            this.user.plant.matureTime += Param.PeachOrchardCd * harvestTimes
        } else {
            // 超过最大成熟次数，丢弃时间，直接从当前时间开始，设置下次成熟时间
            this.user.plant.matureTime = now + Param.PeachOrchardCd
        }

        // 有摸鱼的青蛙，不需要做保底
        const count = proArr.size
        if (!count || count !== this.user.plant.employees.size()) {
            return
        }
        // 无摸鱼状态的青蛙，根据权重随机一个
        const randId = GameRandom.randomByWeight(proArr) as number
        const emp = this.user.plant.employees.get(randId)!

        await ActionPlant.setRelaxById(this.user, emp)
    }
}
