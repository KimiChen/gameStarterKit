import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { Props } from '../../props/inventory/Props'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { ReqLoveAward, ResLoveAward } from '../LoveC2S'
import { ActionLove } from './ActionLove'

/**
 * 爱心值领取
 */
export class ActionLoveAward extends ActionLove {
    async doAction(req: ReqLoveAward, res: ResLoveAward) {
        const loveType = req.type

        // 参数校验
        const conf = C.love(loveType)

        // 奖励记录
        const loveRecord = this.user.loveRecord.get(loveType)

        // 记录是否存在
        if (!loveRecord) {
            throw SystemErrors.SysParamErr
        }

        // 可获得奖励次数判断
        if (loveRecord.awardNum <= 0) {
            throw SystemErrors.SysParamErr
        }

        // 可领数量清空
        loveRecord.awardNum--

        // 活动爱心值
        await Props.addProp(this.user, ItemIdDefine.ITEM_ID_LOVE, conf.awardNum, res.awards)
    }
}
