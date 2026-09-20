import { DB } from '@arthropoda/game-engine'
import { Activity } from './Activity'
import { ServerListModel } from '../../../../../generated/persistence/ServerListModel'
import { array_unique, strtotime, datetotime, clone, map2Object } from '@arthropoda/game-engine'
import { ActivityDefine } from '../../rules/ActivityDefine'
import { ActivityConfCheck } from './validation/ActivityConfCheck'
import { Config } from '@arthropoda/game-engine'
import { UtilJson } from '@arthropoda/game-engine'
import { GmAction } from '../../../gm/http/GmAction'
import { ServerSettingProxy } from '../../../serverSettings/persistence/ServerSettingProxy'
import { QueryRunner } from '@arthropoda/typeorm'
import { ServerListConfigProxy } from '../../../serverSettings/persistence/ServerListConfigProxy'
import { Server } from '../../../serverSettings/http/gm/Server'
import { UtilTime } from '@arthropoda/game-engine'
import { ServerActivityModel } from '../../../../../generated/persistence/ServerActivityModel'
import { ServerActivityProxy } from '../../persistence/ServerActivityProxy'
import { CenterActivityProxy } from '../../persistence/CenterActivityProxy'
import { CenterActivityModel } from '../../../../../generated/persistence/CenterActivityModel'

/**
 * ActivityActionAddActivity
 * 新增活动
 * @author yangjc
 * @since  2020/11/8 22:17
 */
export class ActionActivityAddActivity extends Activity {
    public serverList: ServerList = {} // 区服列表

    public async doAction(params: ReqParams) {
        Activity.crossTipsMsg = []
        const returnData: ResData = {}

        if (!params) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }
        if (!params.server_list) {
            this.gmContext.setGmMsg(1002, '区服参数为空', params)
            return false
        }
        const server = params.server_list.split(',').map((el: string) => Number(el))
        if (!this.checkList(params.activity_list)) {
            this.gmContext.setGmMsg(1003, '列表参数有误', params)
            return false
        }
        const signs = params.activity_list.map((el) => el.activity_sign)
        const tmpServerList = await ServerListModel.findBy({})
        const serverList: Record<number, ServerListModel> = {}
        for (const item of tmpServerList) {
            serverList[item.sId] = item
        }
        this.serverList = serverList

        return DB.startTransaction(async (runner) => {
            for (const ac of params.activity_list) {
                const acName = ac.activity_sign ?? '-'
                const st = strtotime(ac.start_time)
                const et = strtotime(ac.end_time)
                const ost = strtotime(ac.logo_start_time)
                const oet = strtotime(ac.logo_end_time)
                let ats = st
                //冲榜活动,活动开启后即可领奖
                if (ActivityDefine.isRankActivity(ac.activity_sign)) {
                    ats = et
                }
                const type = ac.show == 1 ? 2 : 3
                const listConf = C.list(ac.activity_sign)
                const confArr = await Activity.setConfDetail(ac.activity_sign, ac.activity_config)
                let result = ActivityConfCheck.checkConf(confArr, ac.activity_sign, [st, et]) // 校验一遍配置
                if (!result[0]) {
                    try {
                        if (listConf.fromName) {
                            if (listConf.fromDB > 1) {
                                //覆盖整个confMap
                                Config.convertJsonDataToMapData(listConf.fromName, clone(confArr))
                            } else {
                                Config.convertJsonDataToMapData(listConf.fromName, {
                                    [listConf.activityName]: clone(confArr),
                                })
                            }
                        }
                    } catch (err) {
                        result = [400, '配置预转换错误：' + JSON.stringify(err)]
                    }
                    //结构对比
                    try {
                        const confMap = Config.getConfig(listConf.fromName)
                        const template = (confMap as ConfigReadonlyMap<string, any>).first()[1]
                        const templateObject = map2Object(template)
                        if (!UtilJson.structCompare(templateObject, confArr, { printDebug: true })) {
                            result = [401, '导入配置和表仓里的结构不一致：']
                        }
                    } catch (e) {
                        Log.warn('无法进行检查:' + JSON.stringify(e))
                    }
                }

                if (result[0]) {
                    //失败 回滚所有操作
                    await runner.rollbackTransaction()
                    this.gmContext.setGmMsg(1003, '活动配置错误！' + (result[1] ?? '活动导入失败！'), params)
                    return false
                }
                const activityListConf = C.list(acName)
                const conf = JSON.stringify(confArr)
                const salt = Activity.getSalt(conf)
                const insertData = {
                    name: ac.activity_sign,
                    type: type,
                    openTs: ost,
                    closeTs: oet,
                    startTs: st,
                    endTs: et,
                    awardTs: ats,
                    salt: salt,
                    activityConf: conf,
                    activityDetail: JSON.stringify(ac.activity_config), //activity_detail 记录后台导刷的原始配置,
                    planCode: params.plan_code,
                    dailyStartTime: ac.daily_start_time ?? 0,
                    dailyEndTime: ac.daily_end_time ?? 0,
                }
                const errorMsg = '活动导入失败！'
                let ret

                if (!activityListConf.crossType) {
                    ret = await this.addServerActivity(server, params, ac, insertData, returnData, 0, runner)
                } else {
                    ret = await this.addCrossServerActivity(params, ac, insertData, returnData, serverList, runner)
                }

                if (!ret.result) {
                    await runner.rollbackTransaction()
                    this.gmContext.setGmMsg(1003, ret.errorMsg ?? errorMsg, params)
                    return false
                }
            }
            for (const msg of Activity.crossTipsMsg) {
                Log.error(msg)
            }
            Activity.crossTipsMsg = []
            await runner.commitTransaction()
            await ServerSettingProxy.updateServerSetting(GmAction.ACTIVITY_TAG, server)
            return { list: returnData, plan_code: params.plan_code }
        })
    }

    public checkList(list: { start_time: string; end_time: string; logo_start_time: string; logo_end_time: string }[]) {
        for (const ac of list) {
            const st = strtotime(ac.start_time)
            const et = strtotime(ac.end_time)
            const ost = strtotime(ac.logo_start_time)
            const oet = strtotime(ac.logo_end_time)
            if (!st || !et || !ost || !oet) {
                return false
            }
        }
        return true
    }

    private handleCrossServerIds(
        serverConfig: {
            cross_server: string
            server_id: string
        }[],
    ): number[][] {
        let sIds: string[] = []
        for (const item of serverConfig) {
            if (item.cross_server) {
                sIds = sIds.concat(item.cross_server)
                sIds = array_unique(sIds)
            }
        }
        const data = []
        for (const list of sIds) {
            const resArr = []
            const arr = list.split(',')
            for (const r of arr) {
                if (r.indexOf('-') >= 0) {
                    const explode = r.split('-')
                    const start = Number(explode[0] ?? 0)
                    const end = Number(explode[1] ?? 0)
                    if (start <= end) {
                        for (let i = start; i <= end; i++) {
                            resArr.push(i)
                        }
                    }
                } else {
                    resArr.push(Number(r))
                }
            }
            data.push(resArr)
        }

        return data
    }

    private async addServerActivity(
        sIds: number[],
        params: ReqParams,
        ac: ReqParams['activity_list'][0],
        insertData: InsertActivity,
        returnData: ResData,
        crossId: number,
        runner: QueryRunner,
    ): Promise<{ result: boolean; errorMsg: string }> {
        // 当前自动开区的区服
        const configObj = await ServerListConfigProxy.getObj()
        let autoOpenServerId = 0
        if (configObj && configObj.openStatus == Server.OPEN_STATUS_OPEN) {
            autoOpenServerId = configObj.openServerId ?? 0
        }

        for (const sId of sIds) {
            if (
                sId != autoOpenServerId &&
                insertData.openTs < UtilTime.getDayStartTime(datetotime(this.serverList[sId].sTime))
            ) {
                return { result: false, errorMsg: '导入活动时间不能小于开服时间！' }
            }
            let isUpdate = false
            let r = false
            let id = 0
            const forceImport = params.force_import
            if (forceImport) {
                // 强制导入

                const sam = await ServerActivityProxy.getByNameOpenCloseTime(
                    sId,
                    ac.activity_sign,
                    insertData.openTs,
                    insertData.closeTs,
                )

                if (sam) {
                    //存在一致 更新
                    id = sam.id
                    r = await ServerActivityProxy.updateById(
                        sId,
                        id,
                        {
                            activityConf: Activity.getUpdateConf(id, insertData.name, insertData.activityConf),
                            activityDetail: JSON.stringify(ac.activity_config),
                            //activity_detail 记录后台导刷的原始配置
                            planCode: params.plan_code,
                            salt: insertData.salt,
                        },
                        runner,
                    )
                    isUpdate = true
                } else {
                    // 判断新导入的活动是否有时间重复
                    const isTimeRepeat = await ServerActivityProxy.checkActivityTime(
                        sId,
                        ac.activity_sign,
                        insertData.openTs,
                        insertData.closeTs,
                    )
                    if (isTimeRepeat) {
                        return { result: false, errorMsg: '活动时间重复！' }
                    }
                }
            } else {
                const isTimeRepeat = await ServerActivityProxy.checkActivityTime(
                    sId,
                    ac.activity_sign,
                    insertData.openTs,
                    insertData.closeTs,
                )
                if (isTimeRepeat) {
                    return { result: false, errorMsg: '活动时间重复！' }
                }
            }

            if (!isUpdate) {
                // 增加区服activity
                id = await ServerActivityProxy.insertActivity(
                    sId,
                    {
                        ...insertData,
                        crossId: crossId,
                    },
                    runner,
                )
                r = id > 0
                // 特殊处理礼包商城跟商城的id
                if (r) {
                    r = Activity.updateGcStoreGift(sId, id, insertData.name, insertData.activityConf)
                }
            }
            if (!r) {
                //失败整个服活动回滚
                return { result: false, errorMsg: `活动数据保存失败,sId:${sId},activityName:${ac.activity_sign}` }
            }
            if (!Object.hasOwn(returnData, sId)) {
                returnData[sId] = { server_id: sId, state: 1, msg: '', list: [] }
            }
            returnData[sId].list.push({ activity_sign: ac.activity_sign, activity_id: id })
        }
        return { result: true, errorMsg: '' }
    }

    private async addCrossServerActivity(
        params: ReqParams,
        ac: ReqParams['activity_list'][0],
        insertData: InsertActivity,
        returnData: ResData,
        serverList: ServerList,
        runner: QueryRunner,
    ): Promise<{ result: boolean; errorMsg: string }> {
        const serverArr = this.handleCrossServerIds(ac.server_config)
        if (serverArr.length == 0) {
            return { result: false, errorMsg: '跨服活动区服列表为空！' }
        }
        for (const server of serverArr) {
            // 检查区服是否正确
            Activity.checkServersCross(insertData.name, server, serverList)
            const serverIds = server.join(',')
            let isUpdateCenter = false
            let crossId = 0
            if (params.force_import) {
                // 更新center_activity
                const samCenterActivity = await CenterActivityProxy.getByNameOpenCloseTime(
                    ac.activity_sign,
                    insertData.openTs,
                    insertData.closeTs,
                    serverIds,
                )
                if (samCenterActivity) {
                    const centerUpdateData = {
                        activity_conf: insertData.activityConf,
                        plan_code: params.plan_code,
                        salt: insertData.salt,
                    }
                    const ret = await CenterActivityProxy.updateById(samCenterActivity.id, centerUpdateData, runner)
                    if (!ret) {
                        return { result: false, errorMsg: '活动数据（CenterActivityModel）保存失败！' }
                    }
                    crossId = samCenterActivity.id
                    isUpdateCenter = true
                }
            }

            if (!isUpdateCenter) {
                // 增加center_activity
                crossId = await CenterActivityProxy.insertGetId(
                    {
                        ...insertData,
                        serverId: serverIds,
                    },
                    runner,
                )
            }
            if (!crossId) {
                return { result: false, errorMsg: '活动数据（CenterActivityModel）保存失败！' }
            }

            // 增加区服活动
            const ret = await this.addServerActivity(server, params, ac, insertData, returnData, crossId, runner)
            if (!ret) {
                return { result: false, errorMsg: '添加区服活动失败:' + JSON.stringify(server) }
            }
        }
        return { result: true, errorMsg: '' }
    }
}

type ReqParams = {
    activity_list: {
        activity_config: Object
        activity_sign: string
        start_time: string
        end_time: string
        entrance_name: string
        show: number
        logo_start_time: string
        logo_end_time: string
        daily_start_time: number
        daily_end_time: number
        server_config: {
            cross_server: string
            server_id: string
        }[]
    }[]
    plan_code: string
    force_import: boolean
    server_list: string
}

type ResData = Record<
    number,
    {
        server_id: number
        state: number
        msg: string
        list: { activity_sign: string; activity_id: number }[]
    }
>

type InsertActivity =
    | Pick<
          ServerActivityModel,
          | 'name'
          | 'type'
          | 'openTs'
          | 'closeTs'
          | 'startTs'
          | 'endTs'
          | 'awardTs'
          | 'salt'
          | 'activityConf'
          | 'activityDetail'
          | 'planCode'
          | 'dailyStartTime'
          | 'dailyEndTime'
      >
    | Pick<
          CenterActivityModel,
          | 'name'
          | 'type'
          | 'openTs'
          | 'closeTs'
          | 'startTs'
          | 'endTs'
          | 'awardTs'
          | 'salt'
          | 'activityConf'
          | 'activityDetail'
          | 'planCode'
          | 'dailyStartTime'
          | 'dailyEndTime'
      >

type ServerList = {
    length?: undefined
    [n: number]: ServerListModel
}
