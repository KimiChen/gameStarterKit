import { ModuleOpenType } from '../../user/access/ModuleOpenType'

/**
 * 属性模块定义 (只收集固定属性)
 */
export class AttrModDefine {
    /** 装备 */
    static readonly Equip = 1

    /** 功法 */
    static readonly Gong = 2

    /** 法宝 */
    static readonly Weapon = 3

    /** 器灵 */
    static readonly Soul = 4

    /** 玩家等级 */
    static readonly UserLv = 5

    /** 玩家自由加点 */
    static readonly Addition = 6

    /** 符石*/
    static readonly EquipGem = 7

    /** 时装*/
    static readonly EquipFashion = 8

    /** 奇珍*/
    static readonly Treasure = 9

    /** 至宝*/
    static readonly Rare = 10

    /** 初始属性*/
    static readonly InitRole = 11

    /** 妖盟秘法*/
    static readonly Mf = 12

    /** 神通*/
    static readonly Magic = 13

    /** 个人境界*/
    static readonly Realm = 14

    /** 功法境界*/
    static readonly GongMaster = 15

    /** 法宝境界*/
    static readonly WeaponMaster = 16

    /** 装备境界*/
    static readonly EquipMaster = 17

    /** 彩色变异套装*/
    static readonly EquipSuit = 18

    /** @var int[] 系统id 映射 属性模块id */
    static AttrModMap = new Map()

    static init() {
        this.AttrModMap = new Map([
            [ModuleOpenType.SYS_GONG, this.GongMaster],
            [ModuleOpenType.SYS_WEAPON, this.WeaponMaster],
            [ModuleOpenType.SYS_EQUIP, this.EquipMaster],
        ])
    }
}
