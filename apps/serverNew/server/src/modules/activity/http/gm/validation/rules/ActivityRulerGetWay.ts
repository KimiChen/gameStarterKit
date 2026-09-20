import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

export class ActivityRulerGetWay extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_GET_WAY

    protected type = 'string'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        if (!ActivityRulerGetWay.getWay(Reflect.get(detail, this.rulerField))) {
            return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}不符合规则']
        }
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }

    /**
     * 判断获取途径 格式为 51|52|53
     * @param string $getWay
     * @return bool
     */
    public static getWay(getWay: string): boolean {
        const arr = getWay.split('|')
        return true
    }
}
