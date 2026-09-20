import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'
import { EquipPropBean } from '../../../generated/protocol/server/C2S/mod/equip/EquipPropBean'

export interface ReqEquipAutoDissolve extends Service<'Base'> {
    /**
     *  装备自动溶解条件设置（等级、品质）
     */
    dissolveSets: DissolveSet[]
    /**
     * 是否开启评分比较
     */
    isOpenFpDissolve: boolean
}

export interface ResEquipAutoDissolve {}

export interface DissolveSet {
    enable: int // 是否生效
    quality: int // 品质
    level: int // 对应等级
}

export interface ReqEquipDisassembly extends Service<'Base'> {
    /**
     * 装备拆解
     */
    ids: int[]
}

export interface ResEquipDisassembly {
    awards: AwardResponse
}

export interface ReqEquipFashionRecover extends Service<'Base'> {
    /**
     *  时装恢复耐久
     */
    propId: int
    cId: int
}
export interface ResEquipFashionRecover {}

export interface ReqEquipFashionWear extends Service<'Base'> {
    cIds: fashionWearItem[]
}

export interface ResEquipFashionWear {}

export interface fashionWearItem {
    type: int
    cId: int
}

export interface ReqEquipForgeDraw extends Service<'Base'> {
    /**
     * 装备打造
     * 打造类型：1 单次打造 2 多连打造 3 单次仙玉打造
     */
    type: int
    /**
     * 指定道具使用id
     */
    propUseId: int
}

export interface ResEquipForgeDraw {
    awards: AwardResponse
}

export interface ReqEquipGemEngrave extends Service<'Base'> {
    /**
     * 宝石坑位镌刻
     */
    pos: int
}

export interface ResEquipGemEngrave {}

export interface ReqEquipGemInlay extends Service<'Base'> {
    /**
     * 宝石镶嵌
     */
    pos: int
}

export interface ResEquipGemInlay {}

export interface ReqEquipGetInfo extends Service<'Base'> {
    /**
     * 玩家编号
     */
    uId: int
    /**
     * 装备Id
     */
    equipId: int
}

export interface ResEquipGetInfo {
    /**
     * 装备信息
     */
    equipInfo: EquipPropBean
}

export interface ReqEquipLock extends Service<'Base'> {
    /**
     * 装备锁定
     */
    id: int
}

export interface ResEquipLock {}

export interface ReqEquipWear extends Service<'Base'> {
    /**
     * 装备穿戴-Id传0卸下
     */
    pos: int
    id: int
}

export interface ResEquipWear {}

/**
 * 突破奖励
 */
export interface ReqEquipBreakAward extends Service<'Base'> {}

export interface ResEquipBreakAward {
    /**
     * 奖励
     */
    awards: AwardResponse
}

/**
 * 修复装备
 */
export interface ReqEquipRepair extends Service<'Base'> {
    /** 装备id */
    id: int
    /** 耐久点 */
    num: int
}
