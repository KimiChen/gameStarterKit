import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

export class ActivityRulerPriceIncrease extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_PRICE_INCREASE

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        const priceIncrease = Reflect.get(detail, this.rulerField) ?? 0 // 涨价系数
        if (priceIncrease < 10000) {
            return [ActivityDefine.GM_ERR_CODE, '涨价系数不能<10000']
        }
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }
}
