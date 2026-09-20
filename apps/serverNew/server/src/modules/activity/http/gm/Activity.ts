import { strtotime, md5 } from '@arthropoda/game-engine'
import { GmAction } from '../../../gm/http/GmAction'
import { ServerListModel } from '../../../../../generated/persistence/ServerListModel'
import { ActivityDefine } from '../../rules/ActivityDefine'
import { GiftDefine } from '../../gift/GiftDefine'
import { GiftModel } from '../../../../../generated/persistence/GiftModel'
import { In } from '@arthropoda/typeorm'
import { ActGift } from '../../gift/ActGift'

export abstract class Activity extends GmAction {
    static readonly STATUS_NORMAL = 1 //常规状态

    static readonly STATUS_DEL = 2 // 活动删除

    static readonly STATUS_CLOSE = 3 // 活动关闭

    // 跨服活动导入跨服未开启的提示
    public static crossTipsMsg: string[] = []

    private static readonly CHANGE_FIELD_SPECIAL_STR_TO_TIME = '__strToTime' // 特殊字段，将原字段的日期格式转化为时间戳格式

    /**
     * @param string activityName
     * @param array  confArr
     * @return array
     */
    public static setConfDetail(activityName: string, confArr: Object): any {
        const listConf = C.list(activityName)
        if (ActivityDefine.isRankActivity(activityName)) {
            // 冲榜活动的detail不需要id索引
            return this.commonRank(confArr, listConf)
        }
        return confArr
    }

    /**
     * 重置数组的key
     * {s:{a:1, b:2}}  => resetArrayKey(xxx,b)  => {2:{a:1, b:2}}
     * @param array arr
     * @param string field
     * @return array
     */
    private static resetArrayKey(arr: Record<string, Object>, field: string): Record<string, Object> {
        const result = {}
        for (const key in arr) {
            const element = arr[key]
            const newKey = Reflect.get(element, field)
            Reflect.set(result, newKey, element)
        }
        return result
    }

    /**
     * 通用设置 给配置强行加上id及changeArr里配置的特殊字段
     * @param array confArr
     * @param array changeArr
     * @param array changeFieldArr 字段修改
     * @param string ident
     * @param bool resetKey
     * @param int initId
     * @return array
     */
    private static setCommon(
        confArr: any[],
        changeArr: Record<string, string> = {},
        changeFieldArr: Record<string, string> = {},
        ident: string = 'id',
        resetKey = true,
        initId = 1,
    ): any[] | Record<string, any> {
        const newArr = []
        const newObj: Record<string, any> = {}
        let id = initId // 初始化id 强行指定
        let returnObjData = false
        for (const [key, val] of confArr) {
            for (const [k, v] of Object.entries(changeArr)) {
                val[k] = v
            }
            for (const [field, toField] of Object.entries(changeFieldArr)) {
                if (Object.hasOwn(val, field)) {
                    if (toField == this.CHANGE_FIELD_SPECIAL_STR_TO_TIME) {
                        // 特殊转化字段，将日期格式转为时间戳
                        val[field] = strtotime(val[field])
                    } else {
                        val[toField] = val[field]
                        delete val[field]
                    }
                }
            }
            if (ident) {
                val[ident] = id
            }
            if (ident && resetKey) {
                newObj[id] = val
                returnObjData = true
            } else {
                newArr[key] = val
            }
            id++
        }
        if (returnObjData) {
            return newObj
        }
        return newArr
    }

    /**
     * 设置detail层
     * @param array    confArr
     * @param ListConf confDetail
     * @return array
     */
    private static setDetail(confArr: any[], confDetail: IConfList) {
        return {
            activityName: confDetail.activityName,
            desc: confDetail.desc,
            detail: confArr,
        }
    }

    /**
     * 设置salt
     * @param activity
     * @return string
     */
    public static getSalt(activity: string | Object[]) {
        const salt = ''
        switch (typeof activity) {
            case 'string':
                return md5(activity)
            case 'object': // 数组也是object..
                return md5(JSON.stringify(activity))
        }
    }

    /**
     * 更新礼包商城、商城配置
     * @param sId
     * @param id
     * @param activityName
     * @param activityConf
     * @return bool
     */
    public static updateGcStoreGift(sId: number, id: number, activityName: string, activityConf: Object): boolean {
        //        conf = self::getUpdateConf(id, activityName, activityConf);
        //        if (conf !== activityConf) {
        //            return ServerActivityModel::updateById(sId, id, ['activity_conf' => conf]) > 0;
        //        }
        return true
    }

    /**
     * 获取更新后的配置
     * @param id
     * @param activityName
     * @param activityConf
     * @param updateTime
     */
    public static getUpdateConf(id: number, activityName: string, activityConf: string, updateTime = []) {
        //        startTime = updateTime[0] ?? 0;
        //        endTime = updateTime[1] ?? 0;
        //        if (activityName == ActivityDefine::GcGift || activityName == ActivityDefine::GcStore) {
        //            confArr = json_decode(activityConf, JSON_UNESCAPED_UNICODE);
        //            newArr = [];
        //            foreach (confArr as detailArr) {
        //                index = (int)detailArr['id'];
        //                newIndex = id * 1000000 + index;
        //                detailArr['id'] = newIndex;
        //                startTime && detailArr['startTime'] = startTime;
        //                endTime && detailArr['endTime'] = endTime;
        //                newArr[newIndex] = detailArr;
        //            }
        //            return json_encode(newArr, JSON_UNESCAPED_UNICODE);
        //        }
        return activityConf
    }

    /**
     * 检查区服跨服情况
     * @param string activityName
     * @param array sIds
     * @param array serverList
     */
    public static checkServersCross(activityName: string, sIds: number[], serverList: ServerList) {
        const err1 = 1
        const err2 = 2
        const err3 = 3
        const errMsg = {
            [err1]: '区服不存在',
            [err2]: '后台未开启跨服功能',
            [err3]: '登仙台未打通',
        }
        const res = {
            [err1]: new Array<number>(),
            [err2]: new Array<number>(),
            [err3]: new Array<number>(),
        } // 用于记录检查结果

        for (const sId of sIds) {
            const server = serverList[sId] ?? null
            if (!server) {
                res[err1].push(sId)
                continue
            }
            //            isCross = server['is_cross'] ?? 0;
            //            if (!isCross) {
            //                res[err2][] = sId;
            //                continue;
            //            }
            //            now = time() + UtilTime::getTimeAdd(sId); // 当前游戏时间
            //            openTime = crossServerInfo[sId]['openTime'] ?? 0;
            //            closeTime = crossServerInfo[sId]['closeTime'] ?? 0;
            //
            //            if (!self::checkRealCrossTime(isCross, openTime, closeTime, now)) {
            //                res[err3][] = sId;
            //                continue;
            //            }
        }

        let msg = '跨服活动{activityName}导刷错误-'
        let flag = false
        for (const [tmpKey, tmpSIds] of Object.entries(res)) {
            const key = Number(tmpKey) as keyof typeof res
            if (!tmpSIds.length) {
                continue
            }
            flag = true
            msg += errMsg[key] + '：' + sIds.join(',') + '；'
        }
        flag && Activity.crossTipsMsg.push(msg)
    }

    /**
     * 冲榜活动-活动配置转换
     * @param array    confArr
     * @param ListConf listConf
     * @return array
     */
    private static async commonRank(confArr: any, listConf: IConfList): Promise<any> {
        const data: any = {
            activityName: listConf.activityName,
            name: listConf.name,
            rank: {},
            task: {},
            gifts: {},
            crossRank: {},
            doubleDrop: 0,
        }
        data.doubleDrop = Int(confArr.config.doubleDrop ?? 0)

        // 排名奖励
        let rankId = 0
        for (const rank of confArr.detail) {
            rankId++

            const award1 = []
            for (const item of rank.awards) {
                award1.push({ ...item, rankId: rankId })
            }
            data.rank[rankId] = {
                rankId: rankId,
                award1: award1,
                award2: [],
                rank: [Int(rank.rankMin), Int(rank.rankMax)],
                activityName: listConf.activityName,
            }
        }

        // 跨服排名
        if (confArr.svRank) {
            rankId = 0
            for (const rank of confArr.svRank) {
                rankId++
                data.crossRank[rankId] = {
                    rankId: rankId,
                    crossRankAward: rank.awards,
                    rank: [rank.rankMin, rank.rankMax],
                }
            }
        }

        // 活动任务
        if (confArr.multiLimitTask) {
            for (const item of confArr.multiLimitTask) {
                data.task[item.id] = {
                    taskId: item.id,
                    taskType: item.taskType,
                    recordType: item.recordType ?? 0,
                    value: item.value,
                    param1: item.param1,
                    param2: item.param2,
                    taskAward: item.awards,
                    taskDesc: {
                        zh_hans: {
                            lang: 'zh_hans',
                            name: item.taskName,
                            desc: item.desc,
                        },
                    },
                }
            }
        }
        // 活动礼包
        if (confArr.gift) {
            const giftIds = []
            for (const item of confArr.gift) {
                data.gifts[item.id] = {
                    activityName: listConf.activityName,
                    giftId: item.id,
                    sort: Int(item.sort),
                    icon: Int(item.icon),
                    detail: '',
                    limitType: item.limit_type ?? GiftDefine.LIMIT_TYPE_NO, // 限购类型
                }

                giftIds.push(item.id)
            }
            if (giftIds.length > 0) {
                await this.formatGiftConf(giftIds, data.gifts)
            }
        }

        return data
    }

    /**
     * formatGiftConf
     * @param array  $giftIds
     * @param array  $data
     * @param string $field
     * @access
     */
    public static async formatGiftConf(giftIds: number[], data: any, field = 'detail') {
        const giftModels = await GiftModel.findBy({ id: In(giftIds) })
        for (const giftModel of giftModels) {
            data[giftModel.id][field] = JSON.stringify(ActGift.formatByModel(giftModel))
        }
    }
}

type ServerList = {
    length?: undefined
    [n: number]: ServerListModel
}
