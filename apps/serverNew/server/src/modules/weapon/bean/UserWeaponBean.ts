import { Bean } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { RareBean } from './RareBean'
import { WeaponSoulBean } from './WeaponSoulBean'

/**
 * 玩家法宝系统
 */
export class UserWeaponBean extends Bean {
    /**
     * 法宝等级
     */
    lv: int = 0

    /**
     * 小保底
     */
    baseSmallNum: int = 0

    /**
     * 大保底
     */
    baseBigNum: int = 0

    /**
     * 法宝强度
     */
    master: int = 0

    /**
     * 当前佩戴的至宝
     */
    rareId: int = 0

    /**
     * 器灵
     */
    souls?: DiffMap<int, WeaponSoulBean>

    /**
     * 至宝列表
     */
    rares?: DiffMap<int, RareBean>
}
