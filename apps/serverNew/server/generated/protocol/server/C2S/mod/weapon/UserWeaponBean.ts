import { WeaponSoulBean } from '../weapon/WeaponSoulBean'
import { RareBean } from '../weapon/RareBean'

export interface UserWeaponBean {
    /**
     * 法宝等级
     */
    lv: int
    /**
     * 小保底
     */
    baseSmallNum: int
    /**
     * 大保底
     */
    baseBigNum: int
    /**
     * 法宝强度
     */
    master: int
    /**
     * 当前佩戴的至宝
     */
    rareId: int
    /**
     * 器灵
     */
    souls?: Map<int, WeaponSoulBean>
    /**
     * 至宝列表
     */
    rares?: Map<int, RareBean>
}
