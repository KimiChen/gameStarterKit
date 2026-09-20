import { DiffMap } from '@arthropoda/game-engine'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { Bean } from '@arthropoda/game-engine'

export class WeaponSoulBean extends Bean {
    /**
     * 坑位id
     */
    id: int = 0

    /**
     * 品质
     */
    quality: int = 0

    /**
     * 器灵基础评分
     */
    baseFp: int = 0

    /**
     * 器灵特殊属性评分
     */
    specialFp: int = 0

    /**
     * 新器灵基础评分
     */
    newBaseFp: int = 0

    /**
     * 新器灵特殊属性评分
     */
    newSpecialFp: int = 0

    /**
     * 属性列表
     */
    attrs?: DiffMap<int, AttrTypeBean>

    /**
     * 洗练品质
     */
    newQuality: int = 0

    /**
     * 洗练属性列表
     */
    newAttrs?: DiffMap<int, AttrTypeBean>
}
