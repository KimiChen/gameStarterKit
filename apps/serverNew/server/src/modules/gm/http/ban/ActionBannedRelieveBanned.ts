import { DB } from '@arthropoda/game-engine'
import { Banned } from './Banned'
import { UserForbidType } from '../../rules/UserForbidType'
import { UserForbidModel } from '../../../../../generated/persistence/UserForbidModel'

/**
 * BannedActionRelieveBanned
 * 去掉封禁
 */
export class ActionBannedRelieveBanned extends Banned {
    public async doAction(params: ReqParam) {
        params = this.initWhere(params)
        if (!params.banned_name || !params.banned) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }
        const accountType = Banned.ACCOUNT_TYPE[params.banned_name] ?? '' //账号类型
        if (!accountType) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }
        const ids = params.banned.map((el) => el.id)
        if (!(await this.checkUser(ids, accountType))) {
            this.gmContext.setGmMsg(1000, Banned.TYPE_MESSAGE[accountType] ?? '', params)
            return false
        }

        try {
            await DB.startTransaction(async (runner) => {
                for (const v of params.banned ?? []) {
                    const account = v.id
                    const type = v.type
                    if (!Object.hasOwn(UserForbidType.TYPE_MAP, type)) {
                        this.gmContext.setGmMsg(1001, '封禁类型错误', params)
                        await runner.rollbackTransaction()
                        return false
                    }
                    const forbidModel = await runner.manager.findOneBy(UserForbidModel, {
                        account: v.id,
                        accountType: accountType,
                        type: Int(type),
                    })
                    if (forbidModel) {
                        await runner.manager.delete(UserForbidModel, { id: forbidModel.id })
                    }
                    await this.pushForbidMsg(account, accountType, Int(type), false)
                }
            })
        } catch (e) {
            return false
        }
        return true
    }

    public initWhere(params: ReqParam): ReqParam {
        params.banned_name = params.banned_name ?? ''
        params.banned = params.banned ?? []
        return params
    }
}

type ReqParam = {
    banned_name?: string
    banned?: { id: string; type: string }[]
}
