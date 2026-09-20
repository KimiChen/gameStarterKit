import { Banned } from './Banned'
import { UserForbidModel } from '../../../../../generated/persistence/UserForbidModel'
import { FindOptionsWhere, In } from '@arthropoda/typeorm'

/**
 * BannedActionCheckUserBannedState
 * 获取封禁状态
 */
export class ActionBannedCheckUserBannedState extends Banned {
    public async doAction(params: ReqParam) {
        params = this.initWhere(params)
        if (!params.banned_name || !params.id) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }
        const accountType = Banned.ACCOUNT_TYPE[params.banned_name] ?? '' //账号类型
        const accounts = params.id ? params.id.split(',') : []
        const types = params.type ? params.type.split(',') : []
        if (!accountType || !accounts) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }
        const findOpt: FindOptionsWhere<UserForbidModel> = {}
        findOpt.account = In(accounts)
        if (types.length > 0) {
            findOpt.type = In(types)
        }
        findOpt.accountType = accountType
        const forbids = await UserForbidModel.findBy(findOpt)
        const ret = []
        if (forbids) {
            for (const row of forbids) {
                ret.push({ id: row.account, state: row.type })
            }
        }
        return { list: ret }
    }

    public initWhere(params: ReqParam) {
        params.banned_name = params.banned_name ?? ''
        params.id = params.id ?? ''
        params.type = params.type ?? ''
        return params
    }
}

type ReqParam = {
    banned_name?: string
    id?: string
    type?: string
}
