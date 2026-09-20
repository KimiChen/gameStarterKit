import { strtotime, timestamp } from '@arthropoda/game-engine'
import { Activity } from './Activity'
import { ServerActivityModel } from '../../../../../generated/persistence/ServerActivityModel'
import { Equal, Not, SelectQueryBuilder } from '@arthropoda/typeorm'
import { UtilTime } from '@arthropoda/game-engine'

/**活动列表
 */
export class ActionActivityActivityList extends Activity {
    public async doAction(params: reqParams) {
        const [offset, limit] = this.getPageParams(params)
        params = this.initWhere(params)
        if (!params.server_id) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }

        const serverS = String(params.server_id).split(',')
        const returnData: {
            activity_id: number
            server_id: number
            state: number
            start_time: string
            end_time: string
            logo_start_time: string
            logo_end_time: string
            activity_config: string
        }[] = []
        let count = 0
        for (const sId of serverS) {
            const builder = ServerActivityModel.createQueryBuilder()
            const builderWithParams = this.addModelCondition(builder, params)
            count += await builderWithParams.getCount()
            const data = await builderWithParams
                .orderBy(ServerActivityModel.f_start_ts, 'DESC')
                .addOrderBy(ServerActivityModel.f_id, 'ASC')
                .offset(offset)
                .limit(limit)
                .getMany()
            const serverTime = timestamp()
            for (let k = 0; k < data.length; k++) {
                const v = data[k]
                returnData[k] = {
                    activity_id: 0,
                    server_id: 0,
                    state: 0,
                    start_time: '',
                    end_time: '',
                    logo_start_time: '',
                    logo_end_time: '',
                    activity_config: '',
                }
                returnData[k].activity_id = v.id
                returnData[k].server_id = Number(sId)
                if (v.endTs < serverTime) {
                    returnData[k].state = -1
                } else if (v.startTs > serverTime) {
                    returnData[k].state = 0
                } else {
                    returnData[k].state = 1
                }
                returnData[k].start_time = UtilTime.format(v.startTs)
                returnData[k].end_time = UtilTime.format(v.endTs)
                returnData[k].logo_start_time = UtilTime.format(v.openTs)
                returnData[k].logo_end_time = UtilTime.format(v.closeTs)
                returnData[k].activity_config = v.activityDetail //返回给后台用后台给的原始配置
            }
        }
        return { list: returnData, count: count }
    }

    private addModelCondition(model: SelectQueryBuilder<ServerActivityModel>, params: Record<string, any>) {
        model
            .where(`${ServerActivityModel.f_type}=:type`, { type: 2 })
            .andWhere(`${ServerActivityModel.f_status}=:status`, { status: Activity.STATUS_NORMAL })
            .andWhere(`${ServerActivityModel.f_activity_detail} <> :activity_detail`, { activity_detail: '' })
        if (Array.isArray(params.activity_id) && params.activity_id.length > 0) {
            model.andWhereInIds(params.activity_id)
        }
        if (params.logo_start_time) {
            let [st, et] = params.logo_start_time.split(',')
            if (st) {
                st = strtotime(st)
            }
            if (et) {
                et = strtotime(et)
            }
            model
                .andWhere(`${ServerActivityModel.f_open_ts} > :open_ts`, { open_ts: st })
                .andWhere(`${ServerActivityModel.f_open_ts} < :open_ts`, { open_ts: et })
        }
        return model
    }

    public initWhere(params: reqParams) {
        params.logo_start_time = params.logo_start_time ?? ''
        params.server_id = params.server_id ?? ''
        params.activity_id = params.activity_id ?? ''
        return params
    }
}

type reqParams = {
    activity_id: ''
    limit: 10
    logo_start_time: ''
    page: 1
    server_id: 1
}
