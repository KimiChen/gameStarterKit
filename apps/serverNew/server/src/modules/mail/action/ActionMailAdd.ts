import { ReqMailAdd } from '../MailS2S'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { ActionMail } from './ActionMail'
import { MailDefine } from '../rules/MailDefine'
import { GlobalMailTimingModel } from '../../../../generated/persistence/GlobalMailTimingModel'

export class ActionMailAdd extends ActionMail {
    async doAction(req: ReqMailAdd, res: ResDefault) {
        const uId = req.uId
        const param = req
        const award = param.awards ?? []
        const title = param.title ?? ''
        const content = param.content ?? ''
        const pastTime = param.pastTime ?? 0
        const uqid = param.uqid ?? 0
        ActionMail.add(uId, MailDefine.TYPE_SYS, [], award, title, content, pastTime, { uqid: uqid })
        // 更新数据
        uqid > 0 &&
            (await GlobalMailTimingModel.update(
                { uqid: uqid },
                { sucNum: () => `${GlobalMailTimingModel.f_suc_num} + 1` },
            ))
    }
}
