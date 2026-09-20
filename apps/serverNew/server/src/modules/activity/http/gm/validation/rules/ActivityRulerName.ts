import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

export class ActivityRulerName extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_NAME

    protected type = 'string'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        if (Reflect.get(detail, this.rulerField) == '') {
            return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}不符合规则']
        }
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }
}
