import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler, ActivityConfCheckRulerItem } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

/**
 * 校验规则-awards
 * Class ActivityRulerAwards
 * @package App\Service\ActivityCheckRuler
 */
export class ActivityRulerAwards extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_AWARDS

    protected type = 'array'

    public constructor(detail: Object, rulerDetail: ActivityConfCheckRulerItem) {
        super(detail, rulerDetail)
    }

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        if (!this.isset) {
            return [ActivityDefine.GM_SUCCESS_CODE, '']
        }
        if (!ActivityRulerAwards.awards(Reflect.get(detail, this.rulerField) ?? [], this.isAllowEmpty)) {
            return [ActivityDefine.GM_ERR_CODE, '奖励道具格式错误']
        }
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }

    /**
     * 判断奖励格式是否正确
     * @param array awards
     * @param bool allowEmpty 是否允许奖励为空 有些活动奖励格式可能为空
     * @return bool
     */
    public static awards(awards: { propId: number; num: number }[], allowEmpty = false): boolean {
        if (!Array.isArray(awards)) {
            return false
        }

        if (!awards.length) {
            return allowEmpty
        }

        for (const award of awards) {
            if (!Array.isArray(award)) {
                return false
            }
            const propId = award.propId ?? 0
            const num = award.num ?? 0
            if (!Number.isSafeInteger(num)) {
                // 数量必须为数字类型，且不能为负数
                return false
            }
            if (Number(num) <= 0) {
                return false
            }
            if (!C.item().has(propId)) {
                // 道具必须在配置表里面存在
                return false
            }
        }

        return true
    }
}
