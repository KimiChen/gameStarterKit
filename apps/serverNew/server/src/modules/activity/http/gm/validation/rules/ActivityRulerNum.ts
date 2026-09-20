import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

export class ActivityRulerNum extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_NUM

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        if (!ActivityRulerNum.num(Reflect.get(detail, this.rulerField), this.isAllowEmpty)) {
            return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}不符合规则']
        }
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }

    /**
     * 校验数量
     * @param int $num
     * @param bool $allowEmpty
     * @return bool
     */
    public static num(num: number, allowEmpty = false): boolean {
        if (allowEmpty && !num) {
            return true
        }
        if (num <= 0) {
            return false
        }
        return true
    }
}
