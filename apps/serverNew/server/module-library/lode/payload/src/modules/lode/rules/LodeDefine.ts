/**
 * 灵脉定义
 */
export class LodeDefine {
    /** 灵脉视野格子数 */
    static readonly POS_NUM = 9

    /** 默认位置 */
    static readonly DEFAULT_POS = 5

    //#region 结算类型
    /** 被动离开 */
    static readonly SETTLE_TYPE_BE_LEAVE = 1

    /** 境界提升 */
    static readonly SETTLE_TYPE_UP_REALM = 2

    /** 主动离开 */
    static readonly SETTLE_TYPE_LEAVE = 3

    /** 自动离开 */
    static readonly SETTLE_TYPE_AUTO_LEAVE = 4

    /** 手动结算 */
    static readonly SETTLE_TYPE_PICK = 5
    //#endregion

    //#region 战斗类型进攻/防御/复仇
    static readonly FIGHT_ATK = 1 // 进攻(匹配)

    static readonly FIGHT_DEF = 2 // 防御

    static readonly FIGHT_REVENGE = 3 // 进攻(复仇)
    //#endregion

    //#region 战斗类型进攻 / 防御
    static readonly FIGHT_RESULT_WIN = 1 // 胜利

    static readonly FIGHT_RESULT_LOSE = 2 // 失败
    //#endregion

    //#region 匹配对象类型
    /**真人**/
    static readonly MATCH_TARGET_PLAYER = 1

    /**npc固定属性**/
    static readonly MATCH_TARGET_NPC = 2

    /**自身镜像**/
    static readonly MATCH_TARGET_IMG = 3
    //#endregion
}
