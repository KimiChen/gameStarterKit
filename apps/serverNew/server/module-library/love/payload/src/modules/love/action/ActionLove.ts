import { GameAction } from '../../../runtime/action/GameAction'
import { User } from '../../user/bean/User'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { AwardResponse } from '../../../runtime/protocol/C2S/commom'
import { Props } from '../../props/inventory/Props'
import { LoveRecordItem } from '../bean/LoveRecordItem'
import { LoveDefine } from '../rules/LoveDefine'
import { LoveRecordModel } from '../rules/LoveRecordModel'

/**
 * 爱心值基础类
 */
export class ActionLove extends GameAction {
    /**
     * 每日重置爱心奖励次数
     * @param user
     */
    static dayInit(user: User) {
        for (const [, loveRecord] of user.loveRecord) {
            loveRecord.dailyTimes = 0
            loveRecord.behaviorCount = 0
            // 为个人历练
            // if (LoveDefine.SCENE_SYNC_MAPPING.has(loveRecord.id)) {
            //     // 同步到个人历练场景
            //     SceneSync.sync_UserExtraParams(
            //         LoveDefine.SCENE_SYNC_MAPPING,
            //         user.id,
            //         [SceneDefine.ACTOR_EXT_FIELD_LOVE => this.getLoveRecordModel(loveRecord.id)]
            //     )
            // }
        }
    }

    /**
     * doBehaviorByType
     * 爱心值的行为
     * @param HUser                 user
     * @param int                   behaviorType 爱心来源类型
     * @param bool                  pickUp       是否为手动领取
     * @param \ProtobufMessage|null res
     * @return int
     * @throws \Throwable
     * @access
     */
    static async doBehaviorByType(user: User, behaviorType: int, pickUp = false, res?: AwardResponse): Promise<int> {
        // 获取爱心奖励
        const conf = C.love(behaviorType)

        // 是否需要初始化
        if (!user.loveRecord.has(behaviorType)) {
            user.loveRecord.set(behaviorType, new LoveRecordItem({ id: behaviorType }))
        }

        // 爱心值转换
        const loveRecordModel = this.getLoveRecordModel(behaviorType, user)

        // 可获得爱心值数量
        LoveDefine.updateLoveByModel(loveRecordModel)

        // 更新玩家
        const record = user.loveRecord.get(behaviorType)!
        record.behaviorCount = loveRecordModel.behaviorCount
        record.dailyTimes = loveRecordModel.dailyTimes

        // 是否有新增领奖次数
        if (!loveRecordModel.awardAddTimes) {
            return 0
        }

        if (pickUp) {
            // 手动领奖次数增加
            record.awardNum += loveRecordModel.awardAddTimes
        } else {
            // 直接发放爱心奖励
            await Props.addProp(user, ItemIdDefine.ITEM_ID_LOVE, conf.awardNum * loveRecordModel.awardAddTimes, res)
        }

        return loveRecordModel.awardAddTimes
    }

    /**
     * 获取行为爱心记录操作信息
     * @param behaviorType 行为类型
     * @param HUser|null user         加载玩家数据
     * @return LoveRecordModel
     */
    static getLoveRecordModel(behaviorType: int, user?: User): LoveRecordModel {
        const loveRecordModel = new LoveRecordModel()
        loveRecordModel.id = behaviorType
        if (user && user.loveRecord.has(behaviorType)) {
            const loveRecord = user.loveRecord.get(behaviorType)!
            loveRecordModel.dailyTimes = loveRecord.dailyTimes
            loveRecordModel.behaviorCount = loveRecord.behaviorCount
        }
        return loveRecordModel
    }
}
