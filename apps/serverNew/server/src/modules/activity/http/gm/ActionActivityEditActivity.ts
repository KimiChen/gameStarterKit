import { datetotime, strtotime, timestamp } from '@arthropoda/game-engine'
import { Activity } from './Activity'
import { ServerListModel } from '../../../../../generated/persistence/ServerListModel'
import { DB } from '@arthropoda/game-engine'
import { UtilTime } from '@arthropoda/game-engine'
import { ServerActivityModel } from '../../../../../generated/persistence/ServerActivityModel'
import { ServerActivityProxy } from '../../persistence/ServerActivityProxy'
import { ActivityDefine } from '../../rules/ActivityDefine'
import { CenterActivityModel } from '../../../../../generated/persistence/CenterActivityModel'
import { ActivityConfCheck } from './validation/ActivityConfCheck'
import { CenterActivityProxy } from '../../persistence/CenterActivityProxy'
import { ServerSettingProxy } from '../../../serverSettings/persistence/ServerSettingProxy'
import { GmAction } from '../../../gm/http/GmAction'
import { QueuedLocalAction } from '../../../../runtime/action/QueuedLocalAction'
import { ActionActivityClose } from '../../action/ActionActivityClose'

/**
 * GM_Activity_editActivity
 * 修改活动时间
 * 1 要判断是不是关闭正在进行中的活动，是的话会有额外操作
 * @author yangjc
 */
export class ActionActivityEditActivity extends Activity {
    public serverList: Record<number, ServerListModel> = {} // 区服列表

    public async doAction(params: ReqParam): Promise<ResData | false> {
        return DB.startTransaction(async (runner) => {
            const returnData: ResData = []
            const sIds: number[] = []
            const sIdCloseNames: Record<number, Record<string, number>> = {}
            if (
                !params.start_time ||
                !params.end_time ||
                !params.logo_start_time ||
                !params.logo_end_time ||
                !params.list
            ) {
                this.gmContext.setGmMsg(1001, '参数错误', params)
                return false
            }
            const st = strtotime(params.start_time)
            const et = strtotime(params.end_time)
            const lst = strtotime(params.logo_start_time)
            const logoEndTime = strtotime(params.logo_end_time)
            let editConfigStr = ''
            let editConfig = undefined
            if (
                params.activity_config &&
                typeof params.activity_config == 'object' &&
                Object.keys(params.activity_config).length > 0
            ) {
                editConfig = params.activity_config
                editConfigStr = JSON.stringify(editConfig)
            }
            const serverList: Record<number, ServerListModel> = {}
            for (const item of await ServerListModel.findBy({})) {
                serverList[item.sId] = item
            }
            this.serverList = serverList
            const now = timestamp()
            for (const l of Object.values(params.list)) {
                const sId = l.server_id
                const acId = l.activity_id
                if (lst < UtilTime.getDayStartTime(datetotime(this.serverList[sId].sTime))) {
                    this.gmContext.setGmMsg(
                        1003,
                        `'activity_id' => ${acId}, 'server_id' => ${sId}, 'msg' => '修改的导入活动时间不能大于开服时间'`,
                    )
                    return false
                }
                const one = await ServerActivityProxy.getById(sId, acId)
                if (!one) {
                    await runner.rollbackTransaction()
                    this.gmContext.setGmMsg(
                        1003,
                        `'activity_id' => ${acId}, 'server_id' => ${sId}, 'msg' => '活动不存在'`,
                    )
                    return false
                }

                let isRank = false
                let ats = st
                if (ActivityDefine.isRankActivity(one.name)) {
                    //冲榜活动
                    ats = et
                    isRank = true
                }
                let serverIds = [sId]
                if (one.crossId != 0) {
                    // 判断是否是跨服活动，是的话，要修改同个区服组全部的活动
                    const cross_activity = await CenterActivityModel.findOneBy({ id: one.crossId })
                    if (!cross_activity) {
                        await runner.rollbackTransaction()
                        this.gmContext.setGmMsg(
                            1003,
                            `'activity_id' => ${acId}, 'server_id' => ${sId}, 'msg' => '活动不存在'`,
                        )
                        return false
                    }
                    serverIds = cross_activity.serverId.split(',').map((el: string) => Number(el))
                }
                const activityConf = C.list(one.name)
                if (!activityConf) {
                    await runner.rollbackTransaction()
                    this.gmContext.setGmMsg(
                        1003,
                        `'activity_id' => ${acId}, 'server_id' => ${sId}, 'msg' => '活动配置不存在'`,
                    )
                    return false
                }
                // 判断是否是关闭活动 一是活动已开启二是该操作要关闭活动
                let isClose = false
                if (now >= one.openTs && now < one.closeTs) {
                    // 在活动开启时间内
                    if (one.openTs != lst) {
                        // 活动开启(图标)，无法修改活动开始展示时间
                        await runner.rollbackTransaction()
                        this.gmContext.setGmMsg(
                            1003,
                            `'activity_id' => ${acId}, 'server_id' => ${sId}, 'msg' => '活动图标已开启，无法修改图标开始时间']`,
                        )
                        return false
                    }
                    if (now >= one.startTs && one.startTs != st) {
                        // 活动开启（正式），无法修改活动正式开启时间
                        await runner.rollbackTransaction()
                        this.gmContext.setGmMsg(
                            1003,
                            `'activity_id' => ${acId}, 'server_id' => ${sId}, 'msg' => '活动已开启，无法修改活动开始时间'`,
                        )
                        return false
                    }
                    if (isRank) {
                        // 万能活动、冲榜活动在领奖阶段后不能修改领奖时间
                        if (now >= one.awardTs && one.awardTs != ats) {
                            await runner.rollbackTransaction()
                            this.gmContext.setGmMsg(
                                1003,
                                `'activity_id' => ${acId}, 'server_id' => ${sId}, 'msg' => '冲榜活动已到领奖阶段，无法修改领奖时间（即活动结束时间）'`,
                            )
                            return false
                        }
                    }
                    if (now >= one.endTs && one.endTs != et) {
                        returnData.push({ activity_id: acId, server_id: sId, msg: '活动已结束，无法修改活动结束时间' })
                        continue
                    }

                    if (one.closeTs > now && logoEndTime < now) {
                        isClose = true
                        await ServerActivityProxy.updateById(sId, one.id, { status: Activity.STATUS_CLOSE }, runner)
                    }
                }
                // 活动已关闭，无法修改
                if (now >= one.closeTs) {
                    await runner.rollbackTransaction()
                    this.gmContext.setGmMsg(
                        1003,
                        `'activity_id' => ${acId}, 'server_id' => ${sId}, 'msg' => '活动已关闭，无法修改'`,
                        params,
                    )
                    return false
                }

                const updateData: {
                    [P in keyof ServerActivityModel & keyof CenterActivityModel]?: ServerActivityModel[P] &
                        CenterActivityModel[P]
                } = {}
                if (editConfig) {
                    const confArr = Activity.setConfDetail(one.name, editConfig)
                    let activityConfStr = JSON.stringify(confArr)
                    activityConfStr = Activity.getUpdateConf(acId, one.name, activityConfStr)

                    updateData.activityDetail = editConfigStr
                    updateData.activityConf = activityConfStr
                    updateData.salt = Activity.getSalt(activityConfStr)

                    const result = ActivityConfCheck.checkConf(confArr, one.name, [st, et])
                    if (result[0]) {
                        await runner.rollbackTransaction()
                        this.gmContext.setGmMsg(
                            1003,
                            `'activity_id' => ${acId}, 'server_id' => ${sId}, 'msg' => result[1]`,
                            params,
                        )
                        return false
                    }
                }

                updateData.openTs = lst
                updateData.closeTs = logoEndTime
                updateData.startTs = st
                updateData.endTs = et
                updateData.awardTs = ats
                for (const subSIdKey of serverIds) {
                    const subSId = Number(subSIdKey)
                    let activity
                    if (one.crossId != 0) {
                        activity = await ServerActivityProxy.getByCrossId(subSId, one.crossId)
                    } else {
                        activity = one
                    }
                    if (!activity) {
                        continue
                    }
                    const res = await ServerActivityProxy.updateById(subSId, activity.id, updateData, runner)
                    if (res) {
                        returnData.push({ activity_id: activity.id, server_id: subSId, state: 1, msg: '' })
                        sIds[subSId] = subSId
                        if (isClose) {
                            sIdCloseNames[subSId] = sIdCloseNames[subSId] ?? {}
                            sIdCloseNames[subSId][one.name] = one.id
                        }
                    }
                }
                // 更新center活动
                if (one.crossId != 0) {
                    await CenterActivityProxy.updateById(one.crossId, updateData, runner)
                }
            }
            await runner.commitTransaction()
            await ServerSettingProxy.updateServerSetting(GmAction.ACTIVITY_TAG, sIds)
            //通知区服
            for (const sId in sIdCloseNames) {
                const activityNameIds = sIdCloseNames[sId]
                for (const activityName in activityNameIds) {
                    const activityId = activityNameIds[activityName]
                    if (ActivityDefine.isRankActivity(activityName)) {
                        await QueuedLocalAction.rpc(
                            ActionActivityClose,
                            { activityName: activityName, id: activityId, sId: Number(sId) },
                            0,
                            Number(sId),
                        )
                    }
                }
            }
            return returnData
        })
    }
}

type ReqParam = {
    start_time: string
    end_time: string
    logo_start_time: string
    logo_end_time: string
    list: Record<string, { activity_id: number; server_id: number }>
    activity_config: any
}
type ResData = { activity_id: number; server_id: number; state?: number; msg: string }[]
