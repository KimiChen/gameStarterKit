import { ActivityDefine } from '../../../rules/ActivityDefine'
import { ActivityConfCheckRuler, ActivityConfCheckRulerItem } from './ActivityConfCheckRuler'
import { ActivityRulerItem } from './rules/ActivityRulerItem'

/**
 * 活动配置检查
 * Class ActivityConfCheck
 * @package App\GmExecutionContext\Activity
 */
export class ActivityConfCheck {
    /**
     * 检查后台上传并且经过解析后的配置
     */
    public static checkConf(confArr: Object, activityName: string, acTimeList: [number, number]): any[] {
        const st = acTimeList[0] ?? 0
        const et = acTimeList[1] ?? 0
        if (!C.list().has(activityName)) {
            return [ActivityDefine.GM_ERR_CODE, '配置' + activityName + '不存在']
        }
        const conf = C.list(activityName)
        const returnData = [ActivityDefine.GM_SUCCESS_CODE, ''] // 默认格式正确
        switch (conf.typeActivityName) {
            //根据活动类型 调用check方法
            case ActivityDefine.TypeActivityName_Rank:
                return this.checkRank(confArr)
                break
        }
        return returnData
    }

    /**
     * 天梯活动检查
     * @param array $confArr
     * @return array
     */
    private static checkRank(confArr: Record<string, any>): [number, string] {
        // 每日排行
        const result = this.check(confArr, 'gifts', {
            [ActivityConfCheckRuler.RULER_NUM]: [
                {
                    field: 'giftId',
                },
            ],
        })
        if (result[0]) {
            return result
        }

        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }

    /**
     * 校验
     * @param array $confArr
     * @param string $field
     * @param array $rulerArr
     * @return array
     */
    public static check(
        confArr: Object,
        field: string,
        rulerArr: Record<string, ActivityConfCheckRulerItem[]>,
    ): [number, string] {
        let detailArr
        if (field) {
            detailArr = Reflect.get(confArr, field) ?? null
            if (!detailArr) {
                return [ActivityDefine.GM_ERR_CODE, '配置内容{$field}不能为空']
            }
        } else {
            detailArr = confArr
        }

        //校验规则
        return ActivityConfCheck.checkDetailByRuler(detailArr, rulerArr)
    }

    /**
     * 根据规则，检查detail里面的内容
     * @param array $detailArr
     * @param array $rulerArr
     * @return array
     */
    public static checkDetailByRuler(
        detailArr: Object,
        rulerArr: Record<string, ActivityConfCheckRulerItem[]>,
    ): [number, string] {
        let preDetail = null
        for (const key in detailArr) {
            const detail = Reflect.get(detailArr, key)

            for (const rulerName in rulerArr) {
                const rulerDetailArr = rulerArr[rulerName]
                for (const rulerDetail of rulerDetailArr) {
                    const classDefine = Reflect.get(ActivityConfCheckRuler.rulerMap, rulerName)
                    const result = new classDefine(detail, rulerDetail).checkAll(detail, preDetail)
                    if (result[0]) {
                        return result
                    }
                }
            }
            // 获取上一个detail的数组
            preDetail = detail
        }

        // 校验通过
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }
}
