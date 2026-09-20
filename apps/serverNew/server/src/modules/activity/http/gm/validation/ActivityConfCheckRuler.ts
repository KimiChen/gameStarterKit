import { ActivityRulerAwards } from './rules/ActivityRulerAwards'
import { ActivityRulerExhibition } from './rules/ActivityRulerExhibition'
import { ActivityRulerExp } from './rules/ActivityRulerExp'
import { ActivityRulerGetWay } from './rules/ActivityRulerGetWay'
import { ActivityRulerGrade } from './rules/ActivityRulerGrade'
import { ActivityRulerItem } from './rules/ActivityRulerItem'
import { ActivityRulerLimit } from './rules/ActivityRulerLimit'
import { ActivityRulerLimitType } from './rules/ActivityRulerLimitType'
import { ActivityRulerName } from './rules/ActivityRulerName'
import { ActivityRulerNum } from './rules/ActivityRulerNum'
import { ActivityRulerPriceIncrease } from './rules/ActivityRulerPriceIncrease'
import { ActivityRulerRank } from './rules/ActivityRulerRank'
import { ActivityRulerTaskType } from './rules/ActivityRulerTaskType'
import { ActivityRulerValue } from './rules/ActivityRulerValue'

/**
 * 校验活动配置通用的规则
 * Class ActivityConfCheckRuler
 * @package App\GmExecutionContext\Activity
 */
export class ActivityConfCheckRuler {
    // 校验规则定义
    static readonly RULER_AWARDS = 'awards' // 规则-奖励

    static readonly RULER_GRADE = 'grade' // 规则-档位

    static readonly RULER_VALUE = 'value' // 规则-后面一个数字必须比前面一个数大

    static readonly RULER_RANK = 'rank' // 规则-排名

    static readonly RULER_ITEM = 'item' // 规则-道具id

    static readonly RULER_NUM = 'num' // 规则-数量

    static readonly RULER_LIMIT = 'limit' // 规则-限购次数

    static readonly RULER_LIMIT_TYPE = 'limitType' // 规则-限购类型

    static readonly RULER_GET_WAY = 'getWay' // 规则-获得渠道

    static readonly RULER_EXHIBITION = 'exhibition' // 规则-展示字段

    static readonly RULER_EXP = 'exp' // 规则-经验

    static readonly RULER_TASK_TYPE = 'taskType' // 规则-任务类型

    static readonly RULER_NAME = 'name' // 规则-名字

    static readonly RULER_PRICE_INCREASE = 'priceIncrease' // 规则-涨价系数

    // 规则校验类映射
    public static rulerMap = {
        [this.RULER_AWARDS]: ActivityRulerAwards,
        [this.RULER_GRADE]: ActivityRulerGrade,
        [this.RULER_VALUE]: ActivityRulerValue,
        [this.RULER_RANK]: ActivityRulerRank,
        [this.RULER_ITEM]: ActivityRulerItem,
        [this.RULER_NUM]: ActivityRulerNum,
        [this.RULER_LIMIT]: ActivityRulerLimit,
        [this.RULER_LIMIT_TYPE]: ActivityRulerLimitType,
        [this.RULER_GET_WAY]: ActivityRulerGetWay,
        [this.RULER_EXHIBITION]: ActivityRulerExhibition,
        [this.RULER_EXP]: ActivityRulerExp,
        [this.RULER_TASK_TYPE]: ActivityRulerTaskType,
        [this.RULER_NAME]: ActivityRulerName,
        [this.RULER_PRICE_INCREASE]: ActivityRulerPriceIncrease,
    }

    // 奖励规则的字段
    static readonly f_field = 'field' // 字段

    static readonly f_isAllowEmpty = 'isAllowEmpty' // 是否允许为空

    static readonly f_isset = 'isset' // 是否必传
}
export type ActivityConfCheckRulerItem = { field: string; isAllowEmpty?: boolean; isset?: boolean }
