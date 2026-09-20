import { DB, timestamp } from '@arthropoda/game-engine'
import { Banned } from './Banned'
import { format } from 'util'
import { UserForbidType } from '../../rules/UserForbidType'
import { UserForbidModel } from '../../../../../generated/persistence/UserForbidModel'

/**
 * BannedActionBanned
 * 封禁
 */
export class ActionBannedBanned extends Banned {
    public async doAction(params: ReqParam) {
        params = this.initWhere(params)
        if (!params.banned_name || !params.data || !params.type) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }
        const accountType = Banned.ACCOUNT_TYPE[params.banned_name] ?? '' //账号类型
        if (!accountType) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }

        const ids = params.data.map((el) => el.id)
        if (!(await this.checkUser(ids, accountType))) {
            this.gmContext.setGmMsg(1000, Banned.TYPE_MESSAGE[accountType] ?? '', params)
            return false
        }

        try {
            await DB.startTransaction(async (runner) => {
                const forbidType = params.type?.split(',') ?? []
                const now = timestamp()
                for (const v of params.data) {
                    const timeSecond = v.banned_time == -1 ? v.banned_time : v.banned_time * 60
                    const endTime = timeSecond == -1 ? -1 : now + timeSecond
                    for (const type of forbidType) {
                        if (!Object.hasOwn(UserForbidType.TYPE_MAP, type)) {
                            await runner.rollbackTransaction()
                            this.gmContext.setGmMsg(1001, '封禁类型错误', params)
                            return false
                        }
                        let forbidModel = await UserForbidModel.findOneBy({
                            account: v.id,
                            accountType: accountType,
                            type: Int(type),
                        })
                        // UserForbidModel:: f_account => v['id'],
                        // UserForbidModel:: f_account_type => accountType,
                        // UserForbidModel:: f_type => type])[0] ?? null;
                        if (!forbidModel) {
                            forbidModel = new UserForbidModel()
                            forbidModel.account = v.id
                            forbidModel.accountType = accountType
                            forbidModel.type = Int(type)
                        }
                        forbidModel.endTime = endTime
                        forbidModel.cTime = new Date()
                        await runner.manager.save(forbidModel)
                        await this.pushForbidMsg(v.id, accountType, Int(type), true, endTime)
                    }
                }
            })
        } catch (e) {
            this.gmContext.setGmMsg(1001, format('不存在的账号 %s %s', e, params))
            return false
        }

        return true
    }

    initWhere(params: ReqParam): ReqParam {
        params.banned_name = params.banned_name ?? ''
        params.id = params.id ?? ''
        params.type = params.type ?? ''
        params.banned_time = params.banned_time ?? ''
        return params
    }
}

type ReqParam = {
    banned_name?: string
    id?: string
    type?: string
    banned_time?: string
    data: { id: string; banned_time: int }[]
}
