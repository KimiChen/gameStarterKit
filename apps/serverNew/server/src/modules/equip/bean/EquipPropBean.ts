import { DiffMap } from '@arthropoda/game-engine'
import { AttrTypeBean } from '../../attr/bean/AttrTypeBean'
import { EntryBean } from './EntryBean'
import { Bean } from '@arthropoda/game-engine'
import { DiffArray } from '@arthropoda/game-engine'

export class EquipPropBean extends Bean {
    /**
     * 装备唯一ID
     */
    id: int = 0

    /**
     * 装备配表ID
     */
    cId: int = 0

    /**
     * 装备属性
     */
    attr?: DiffMap<int, AttrTypeBean>

    /**
     * 装备词条
     */
    entries?: DiffMap<int, EntryBean>

    /**
     * 装备效果
     */
    effects?: DiffArray<int>

    /**
     * 装备总评分
     */
    fp: int = 0

    /**
     * 装备词条评分
     */
    entryFp: int = 0

    /**
     * 装备效果评分
     */
    effectFp: int = 0

    /**
     * 装备属性评分
     */
    attrFp: int = 0

    /**
     * 装备状态(0:正常,1:锁定)
     */
    status: int = 0

    /**
     * 耐久
     */
    durable: int = 0
}
