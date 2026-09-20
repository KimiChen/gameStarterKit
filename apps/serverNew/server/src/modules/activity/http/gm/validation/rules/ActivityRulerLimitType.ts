import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

export class ActivityRulerLimitType extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_LIMIT

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        // 限购类型0不限购1每日2每周3每月4总限购
        const limitType = Reflect.get(detail, this.rulerField)
        if (limitType < 0 || limitType > 4) {
            return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}不符合规则']
        }
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }
}
