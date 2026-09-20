import { User } from '../../user/bean/User'
import { GlobalMailTimingModel } from '../../../../generated/persistence/GlobalMailTimingModel'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { ReqTracelessAward } from '../MailS2S'
import { GameAction } from '../../../runtime/action/GameAction'
import { Props } from '../../props/inventory/Props'

export class ActionTracelessAward extends GameAction {
    async doAction(req: ReqTracelessAward, res: ResDefault) {
        const user = await User.load(req.uId)
        if (!user) {
            Log.error("tracelessAward can't find the uid:" + req.uId)
            return
        }
        const award = req.l ?? []
        const uqid = req.uqid ?? 0
        // 执行添加道具
        await Props.addProps(user, award)
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
