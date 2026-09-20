import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler, ActivityConfCheckRulerItem } from '../ActivityConfCheckRuler'

/**
 * 活动规则校验
 * 活动配置检查规则
 * @package App\Service\ActivityCheckRuler
 */
export abstract class ActivityCheckRule {
    protected rulerName = '' // 规则名称

    protected rulerField: string = '' // 解析规则名称，这个值可能是数组

    protected isAllowEmpty = false // 是否允许为空

    protected isset = true // 字段是否必须必传 （默认必传）

    protected abstract type: string // 类型，目前支持int string array

    protected initResult: [number, string] = [ActivityDefine.GM_SUCCESS_CODE, ''] // __construct 时的结果，默认正确

    public constructor(
        private detail: Object,
        rulerDetail: ActivityConfCheckRulerItem,
    ) {
        this.rulerField = rulerDetail[ActivityConfCheckRuler.f_field] ?? ''
        this.isAllowEmpty = rulerDetail[ActivityConfCheckRuler.f_isAllowEmpty] ?? false
        this.isset = rulerDetail[ActivityConfCheckRuler.f_isset] ?? true

        if (!Array.isArray(this.rulerField) && !Object.hasOwn(detail, this.rulerField) && this.isset) {
            this.initResult = [ActivityDefine.GM_ERR_CODE, '字段{this.rulerField}必传']
            return
        }

        if (Array.isArray(this.rulerField)) {
            return
        }
    }

    private checkConstructParam() {
        const detail = this.detail
        // 判断类型
        switch (this.type) {
            case 'int': {
                const val = Reflect.get(detail, this.rulerField) ?? 0
                if (!Number.isSafeInteger(val)) {
                    this.initResult = [ActivityDefine.GM_ERR_CODE, '字段{this.rulerField}必须为int类型']
                }
                break
            }
            case 'string': {
                const val = Reflect.get(detail, this.rulerField) ?? ''
                if (!(typeof val != 'string')) {
                    this.initResult = [ActivityDefine.GM_ERR_CODE, '字段{this.rulerField}必须为string类型']
                }
                break
            }
            case 'array': {
                const val = Reflect.get(detail, this.rulerField) ?? []
                if (!Array.isArray(val)) {
                    this.initResult = [ActivityDefine.GM_ERR_CODE, '字段{this.rulerField}必须为array类型']
                }
                break
            }
            default: {
                this.initResult = [ActivityDefine.GM_ERR_CODE, '字段类型规则定义错误，暂不支持此类型']
            }
        }
    }

    /**
     * 校验规则入口
     * @param array detail
     * @param array|null preDetail
     * @return array
     */
    public checkAll(detail: Object, preDetail?: Object): [number, string] {
        this.checkConstructParam()
        if (this.initResult[0]) {
            return this.initResult
        }
        return this.checkRuler(detail, preDetail)
    }

    /**
     * 详细规则校验
     * @param array detail
     * @param array|null preDetail 上一个detail的值 为null则为第一个detail
     * @return array
     */
    public abstract checkRuler(detail: Object, preDetail?: Object): [number, string]
}
