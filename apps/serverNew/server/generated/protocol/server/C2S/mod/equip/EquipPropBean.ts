import { AttrTypeBean } from '../attr/AttrTypeBean'
import { EntryBean } from '../equip/EntryBean'

export interface EquipPropBean {
    /**
     * 装备唯一ID
     */
    id: int
    /**
     * 装备配表ID
     */
    cId: int
    /**
     * 装备属性
     */
    attr?: Map<int, AttrTypeBean>
    /**
     * 装备词条
     */
    entries?: Map<int, EntryBean>
    /**
     * 装备效果
     */
    effects?: int[]
    /**
     * 装备总评分
     */
    fp: int
    /**
     * 装备词条评分
     */
    entryFp: int
    /**
     * 装备效果评分
     */
    effectFp: int
    /**
     * 装备属性评分
     */
    attrFp: int
    /**
     * 装备状态(0:正常,1:锁定)
     */
    status: int
    /**
     * 耐久
     */
    durable: int
}
