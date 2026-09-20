import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

/**
 * 校验规则-item：道具表里必须存在
 * Class ActivityRulerItem
 * @package App\Service\ActivityCheckRuler
 */
export class ActivityRulerItem extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_ITEM

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        if (!ActivityRulerItem.item(Reflect.get(detail, this.rulerField))) {
            return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}与规则不符']
        }
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }

    /**
     * 判断道具id
     * @param int $itemId
     * @return bool
     */
    public static item(itemId: number): boolean {
        return C.item().has(itemId)
    }
}
