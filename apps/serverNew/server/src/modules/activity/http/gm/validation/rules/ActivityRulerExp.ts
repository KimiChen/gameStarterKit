import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

/**
 * 校验规则-exp：必须>0,且每个值都一样
 * Class ActivityRulerExp
 * @package App\Service\ActivityCheckRuler
 */
export class ActivityRulerExp extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_EXP

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        const isFirst = preDetail == undefined
        const exp = Reflect.get(detail, this.rulerField)
        if (isFirst) {
            if (exp <= 0) {
                return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}必须大于0']
            }
        } else {
            const preExp = Reflect.get(preDetail, this.rulerField)
            if (exp != preExp) {
                return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}每个值必须相同']
            }
        }

        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }
}
