import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

/**
 * 校验规则-value：后面一个数字必须比前面一个数大
 * Class ActivityRulerValue
 * @package App\Service\ActivityCheckRuler
 */
export class ActivityRulerValue extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_VALUE

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        const value = Number(Reflect.get(detail, this.rulerField))
        if (value <= 0) {
            return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}必须为数字，且不能小于等于0']
        }
        if (!(preDetail == undefined) && value <= Number(Reflect.get(preDetail, this.rulerField))) {
            return [ActivityDefine.GM_ERR_CODE, '下一个{$this->rulerField}不能小于或等于上一个{$this->rulerField}']
        }

        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }
}
