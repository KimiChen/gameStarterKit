import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

export class ActivityRulerLimit extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_LIMIT

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        if (!ActivityRulerLimit.limit(Reflect.get(detail, this.rulerField))) {
            return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}不符合规则']
        }
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }

    /**
     * 判断限购数量
     * @param int $limit
     * @return bool
     */
    public static limit(limit: number): boolean {
        if (limit > 0 || limit == -1) {
            return true
        }
        return false
    }
}
