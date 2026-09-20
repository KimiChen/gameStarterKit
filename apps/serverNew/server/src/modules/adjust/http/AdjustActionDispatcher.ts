import { RedisInstance, TimeAdd, Url, getServerIdByUid, strtotime, timestamp } from '@arthropoda/game-engine'
import json5 from 'json5'
import { Service } from 'typedi'
import { User } from '../../user/bean/User'
import { ApiChangeAction } from '../api/ApiChangeAction'
import { FixedServerEndpoint } from '../../../http/FixedServerEndpoint'
import { ParseCommitActionResponse } from './NewUserQuery'

@Service()
export class AdjustActionDispatcher {
    async reloadTimeAdd() {
        const timeAddVal = await RedisInstance.getCenterRedis().get(TimeAdd.TIME_ADD_KEY)
        TimeAdd.initTimeAdd(timeAddVal ? parseInt(timeAddVal) : 0)
    }

    async execApiAction(user: User, actionItem: any, params: any): Promise<ParseCommitActionResponse> {
        const action = new ApiChangeAction(user)
        const result = await (action as any)[actionItem.action.methodName](...params)
        return result.code == 0
            ? { status: 0, msg: result.msg, data: [] }
            : { status: 0, msg: result.msg, data: [], notification: result.msg }
    }

    async execNoticeAction(uId: int, actionItem: any, params: any) {
        return this.sendActionToNotice(uId, actionItem.routeList[1], params)
    }

    async sendActionToNotice(uId: int, method: string, params: any[], timeout: int = 7000) {
        const sid = getServerIdByUid(uId)
        const url = FixedServerEndpoint.internalActionUrl(sid)
        if (!url) throw new Error(`fixed server endpoint not found: sid=${sid}`)

        const result = await Url.postJson(
            url,
            { type: 'adjust', actionParams: { uId, method, params } },
            undefined,
            { 'x-internal-secret': CP.platform.gmSecret ?? '' },
            timeout,
        )
        Log.http.info('sendActionToNotice res:' + json5.stringify(result.data))
        return result
    }

    async sendDataModifyAction(uId: int, routeList: (string | number)[], action: any, timeout: int = 7000) {
        const sid = getServerIdByUid(uId)
        const url = FixedServerEndpoint.internalActionUrl(sid)
        if (!url) throw new Error(`fixed server endpoint not found: sid=${sid}`)

        return Url.postJson(
            url,
            {
                type: 'adjust',
                actionParams: {
                    uId,
                    method: '__dataModify',
                    params: [],
                    routeList,
                    action,
                },
            },
            undefined,
            { 'x-internal-secret': CP.platform.gmSecret ?? '' },
            timeout,
        )
    }

    async changeServerTime(uId: number, timeFormat: string) {
        const newTime = strtotime(timeFormat ?? '')
        if (!newTime) return { status: 100, msg: '请输入正确的时间格式' }
        const addSecond = newTime - timestamp()
        if (addSecond <= 0) return { status: 100, msg: '时间不能往前调啊' }

        await RedisInstance.getCenterRedis().incrBy(TimeAdd.TIME_ADD_KEY, addSecond)
        TimeAdd.addTime(addSecond)
        const response = await this.sendActionToNotice(uId, 'addTime', [timeFormat])
        return response.status == 200 ? { status: 0, msg: '' } : { status: 1, msg: '', result: response.data }
    }
}
