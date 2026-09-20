import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

/**
 * 校验规则-exhibition：只能是0跟1
 * Class ActivityRulerExhibition
 * @package App\Service\ActivityCheckRuler
 */
export class ActivityRulerExhibition extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_EXHIBITION

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        {
            const value = Reflect.get(detail, this.rulerField)
            if (value != 0 && value != 1) {
                return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}不符合规则']
            }
            return [ActivityDefine.GM_SUCCESS_CODE, '']
        }
    }
}
