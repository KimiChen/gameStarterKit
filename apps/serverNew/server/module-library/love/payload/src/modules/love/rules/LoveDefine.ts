import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { LoveRecordModel } from './LoveRecordModel'

export class LoveDefine {
    /** 个人历练 */
    static readonly MISSION = 1

    /** 点赞 */
    static readonly LIKE = 2

    /** 植桃树 */
    static readonly PLANT = 3

    /** 爬塔 */
    static readonly TOWER = 4

    /** 灵脉 */
    static readonly LODE = 5

    /** 渡劫 */
    static readonly REALM = 6

    /**
     * 需同步战场映射
     */
    static SCENE_SYNC_MAPPING: Map<number, number>

    static init() {
        this.SCENE_SYNC_MAPPING = new Map([
            [this.MISSION, ModuleOpenType.SYS_MISSION],
            [this.TOWER, ModuleOpenType.SYS_TOWER],
            [this.REALM, ModuleOpenType.SYS_REALM],
        ])
    }

    /**
     * 以模型方式更新爱心记录
     * @param LoveRecordModel loveRecordModel
     * @return void
     */
    static updateLoveByModel(loveRecordModel: LoveRecordModel) {
        // 获取爱心奖励
        const conf = C.love(loveRecordModel.id)

        // 爱心记录
        if (loveRecordModel.dailyTimes >= conf.dailyTimes) {
            // 获取次数大于上限
            return
        }

        // 行为进度累积
        loveRecordModel.behaviorCount++

        // 可获得次数
        const num = Math.min(
            conf.dailyTimes - loveRecordModel.dailyTimes,
            Int(loveRecordModel.behaviorCount / conf.target),
        )
        if (num <= 0) {
            return
        }

        // 更新剩余行为进度
        loveRecordModel.behaviorCount = loveRecordModel.behaviorCount - conf.target * num

        // 更新每日可获得次数
        loveRecordModel.dailyTimes += num

        // 可新获得领奖次数
        loveRecordModel.awardAddTimes = num
    }
}
