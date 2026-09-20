import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

/**
 * 校验规则-taskType：必须在taskType配置内存在
 * Class ActivityRulerTaskType
 * @package App\Service\ActivityCheckRuler
 */
export class ActivityRulerTaskType extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_TASK_TYPE

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        const value = Reflect.get(detail, this.rulerField)

        if (!C.task_type().has(value)) {
            return [ActivityDefine.GM_ERR_CODE, '字段{$this->rulerField}不符合规则']
        }
        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }
}
