import { GlobalMailTimingModel } from '../../../../generated/persistence/GlobalMailTimingModel'
import { GameAction } from '../../../runtime/action/GameAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { Props } from '../../props/inventory/Props'
import { User } from '../../user/bean/User'
import { ReqTracelessReduceItem } from '../MailS2S'

export class ActionTracelessReduceItem extends GameAction {
    static readonly ADD_TYPE_REDUCE0 = 2 // 扣除（只到0)

    static readonly ADD_TYPE_REDUCE_REAL = 3 // 扣除（可负数）

    async doAction(req: ReqTracelessReduceItem, res: ResDefault) {
        const user = await User.load(req.uId)
        if (!user) {
            Log.error("tracelessAward can't find the uid:" + req.uId)
            return
        }
        const award = req.l ?? []
        const type = req.type ?? 0
        const uqid = req.uqid ?? 0
        let toNegative
        if (type == ActionTracelessReduceItem.ADD_TYPE_REDUCE0) {
            toNegative = false
        } else if (type == ActionTracelessReduceItem.ADD_TYPE_REDUCE_REAL) {
            toNegative = true
        } else {
            throw SystemErrors.SysParamErr
        }

        // 执行添加道具
        Props.reduceProps(user, award, toNegative)
        // 更新数据
        if (uqid > 0) {
            const builder = GlobalMailTimingModel.createQueryBuilder()
            builder
                .where({ uqid: uqid })
                .update({ sucNum: () => `${GlobalMailTimingModel.f_suc_num} + 1` })
                .limit(1)
            await builder.execute()
        }
    }
}
