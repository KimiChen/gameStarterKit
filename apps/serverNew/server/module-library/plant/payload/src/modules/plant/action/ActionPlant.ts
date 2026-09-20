import { timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { User } from '../../user/bean/User'
import { EmployeeItem } from '../bean/EmployeeItem'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { QueuedLocalAction as QueueAction } from '../../../runtime/action/QueuedLocalAction'
import { ActionPlantSetEmpRelax } from './ActionPlantSetEmpRelax'
import { PropItem } from '../../../runtime/protocol/C2S/commom'

export class ActionPlant extends GameAction {
    /**
     * 检测桃园摸鱼触发
     * @param user
     * @returns
     */
    static async checkRelax(user: User) {
        // 权重列表
        const proArr: Map<number, number> = new Map()
        for (const [, employee] of user.plant.employees) {
            // 摸鱼中的跳过
            if (employee.isRelax || employee.isReady) {
                continue
            }

            // 非摸鱼状态青蛙概率摸鱼
            const empConf = C.peach_orchard(employee.id)

            // 未触发摸鱼概率
            if (!GameRandom.getProbability(empConf.sleepProb)) {
                // 收集工作中青蛙的摸鱼权重
                proArr.set(employee.id, empConf.sleepProb)
                continue
            }

            await this.setRelaxById(user, employee)
        }

        // 有摸鱼的青蛙，不需要做保底
        const count = proArr.size
        if (!count || count !== user.plant.employees.size()) {
            return
        }

        // 无摸鱼状态的青蛙，根据权重随机一个
        const randId = GameRandom.randomByWeight(proArr) as number
        const emp = user.plant.employees.get(randId)!

        await this.setRelaxById(user, emp)
    }

    /**
     * 指定青蛙定时进入摸鱼状态
     * @param user
     * @param emp
     * @returns
     */
    static async setRelaxById(user: User, emp: EmployeeItem) {
        let readyToSleepNum = 0
        for (const [, employee] of user.plant.employees) {
            if (employee.isReady) {
                readyToSleepNum++
            }
        }

        // 唤醒次数不足时，不让青蛙进入摸鱼状态
        if (user.plant.dayWakeEmpTimes + readyToSleepNum >= Param.PeachOrchardSleepTimes) {
            return
        }

        // 摸鱼预备役
        emp.isReady = true

        const nextRelaxTime = timestamp() + GameRandom.rand(Param.PeachOrchardSleepCd[0], Param.PeachOrchardSleepCd[1])
        await QueueAction.rpc(
            ActionPlantSetEmpRelax,
            {
                uId: user.id,
                empId: emp.id,
            },
            user.id,
            user.sId,
            nextRelaxTime,
        )
    }

    /**
     * 每日重置
     * @param user
     */
    static dayInit(user: User): void {
        // 每日被协助次数重置
        user.plant.dayBeenHelpedWaterTimes = 0
        user.plant.dayBeenHelpedIds.clear()
        // 每日唤醒次数重置
        user.plant.dayWakeEmpTimes = 0
        // 每日浇水次数重置
        user.plant.dayWaterTimes = 0
        // 每日帮助过的玩家id重置
        user.plant.hasHelpedUIds.clear()
        // 每日领取次数重置
        user.plant.dayPlantAwardTimes = 0
        // 每日请求协助次数
        user.plant.dayPlantAskHelpTimes = 0
    }

    /**
     * 添加青蛙
     * @param user
     * @param cId
     * @returns
     */
    static addEmployee(user: User, cId: int): void {
        if (!user.plant.employees.has(cId)) {
            return
        }

        // 默认等级
        const lv = C.peach_orchard(cId).detail.first().lv
        user.plant.employees.set(cId, new EmployeeItem({ id: cId, lv: lv }))
    }

    static plantAward(user: User, tqId: int) {
        // 桃子未成熟
        if (user.plant.matureTime > timestamp()) {
            return
        }

        const awards: PropItem[] = []
        for (const [, employee] of user.plant.employees) {
            const empConf = C.peach_orchard(employee.id)
            if (empConf.privilegeId !== tqId) {
                continue
            }

            const lvConf = empConf.detail.get(employee.lv)
            awards.push({ propId: lvConf.cropsPropId, num: lvConf.cropsNum })
            employee.isRelax = false
        }

        // Push.sendSystemInfoById(SystemInfoDefine.TQ_EXPIRE_PLANT, [], [
        //     Push.ARGS_UIDS => [user.id],
        //     Push.ARGS_AWARDS => awards
        // ]);
    }
}
