import { AttrTypeBean } from '../attr/AttrTypeBean'

export interface WeaponSoulBean {
    /**
     * 坑位id
     */
    id: int
    /**
     * 品质
     */
    quality: int
    /**
     * 器灵基础评分
     */
    baseFp: int
    /**
     * 器灵特殊属性评分
     */
    specialFp: int
    /**
     * 新器灵基础评分
     */
    newBaseFp: int
    /**
     * 新器灵特殊属性评分
     */
    newSpecialFp: int
    /**
     * 属性列表
     */
    attrs?: Map<int, AttrTypeBean>
    /**
     * 洗练品质
     */
    newQuality: int
    /**
     * 洗练属性列表
     */
    newAttrs?: Map<int, AttrTypeBean>
}
