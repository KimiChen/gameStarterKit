import { ActivityDefine } from '../../../../rules/ActivityDefine'
import { ActivityConfCheckRuler } from '../ActivityConfCheckRuler'
import { ActivityCheckRule } from './ActivityCheckRule'

/**
 * 校验规则-rank：下一个排名的rank1必须大于上一个排名的rank2，rank1必须<=rank2
 * Class ActivityRulerRank
 * @package App\Service\ActivityCheckRuler
 */
export class ActivityRulerRank extends ActivityCheckRule {
    protected rulerName = ActivityConfCheckRuler.RULER_RANK

    protected type = 'int'

    public checkRuler(detail: Object, preDetail?: Object | undefined): [number, string] {
        const rankField1 = this.rulerField[0]
        const rankField2 = this.rulerField[1]
        if (!Object.hasOwn(detail, rankField1)) {
            return [ActivityDefine.GM_ERR_CODE, '排名字段{$rankField1}必传']
        }
        if (!Object.hasOwn(detail, rankField2)) {
            return [ActivityDefine.GM_ERR_CODE, '排名字段{$rankField2}必传']
        }
        const rank1 = Reflect.get(detail, rankField1)
        const rank2 = Reflect.get(detail, rankField2)

        if (!Number.isSafeInteger(rank1) && rank1 < 0) {
            return [ActivityDefine.GM_ERR_CODE, '排名字段{$rankField1}必须为数字，且不能小于0']
        }
        if (!Number.isSafeInteger(rank2) && rank2 < 0) {
            return [ActivityDefine.GM_ERR_CODE, '排名字段{$rankField2}必须为数字，且不能小于0']
        }
        if (rank2 < rank1) {
            return [ActivityDefine.GM_ERR_CODE, '{$rankField2}}必须>={$rankField1}']
        }

        // 下一个排名的rank1必须大于上一个排名的rank2
        if (!(preDetail == undefined)) {
            const preRank2 = Reflect.get(preDetail ?? {}, rankField2) ?? 0 // 上一个排名的rank2
            if (rank1 - preRank2 != 1) {
                return [ActivityDefine.GM_ERR_CODE, '下一个{$rankField1}必须大于上一个{$rankField2}且连续']
            }
        }

        return [ActivityDefine.GM_SUCCESS_CODE, '']
    }
}
