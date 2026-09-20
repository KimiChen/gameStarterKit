import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

/**
 * 校验规则-grade：必须是从0开始，且必须从0开始，后面一个数字必须跟前面一个数一样或者连续
 * Class ActivityRulerGrade
 * @package App\Service\ActivityCheckRuler
 */
export class ActivityRulerGrade extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_GRADE

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        const grade = Number(Reflect.get(detail, this.rulerField) ?? 0)
        if (grade < 0) {
            return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}必须为数字，且不能小于0']
        }

        const isFirst = preDetail == undefined
        if (isFirst && grade) {
            return [ActivityDefine.GM_ERR_CODE, '第一个{$this->rulerField}必须配置成0']
        }
        if (!isFirst) {
            const diff = grade - Number(Reflect.get(preDetail, this.rulerField))
            if (diff !== 0 && diff !== 1) {
                return [
                    ActivityDefine.GM_ERR_CODE,
                    '下一个{$this->rulerField}不能小于上一个{$this->rulerField}，且值不同必须得连续',
                ]
            }
        }

        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }
}
