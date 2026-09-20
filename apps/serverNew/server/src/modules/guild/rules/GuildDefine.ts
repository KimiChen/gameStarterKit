import { SystemErrors } from '../../../runtime/errors/SystemErrors'

/**
 * 联盟
 */
export class GuildDefine {
    //#region 妖盟角色

    /**盟主*/
    static readonly ROLE_LEADER = 1

    /**副盟主*/
    static readonly ROLE_DEPUTY_LEADER = 2

    /**长老*/
    static readonly ROLE_OLDER = 3

    /**成员*/
    static readonly ROLE_MEMBER = 4

    //#endregion

    //#region 退出类型

    /** 主动退出 */
    static readonly QUIT_TYPE_INITIATIVE = 1

    /** 被踢退出 */
    static readonly QUIT_TYPE_KICK = 2

    /** 解散退出 */
    static readonly QUIT_TYPE_DISSOLUTION = 3

    //#endregion

    //#region 入盟审核

    /** 同意 */
    static readonly AUDIT_AGREE = 1

    /** 拒绝 */
    static readonly AUDIT_REJECT = 2

    /** 全部拒绝 */
    static readonly AUDIT_REJECT_ALL = 3

    /** 全部通过 */
    static readonly AUDIT_ACCEPT_ALL = 4

    //#endregion

    //#region 加入条件
    /** 无条件加入 */
    static readonly JOINT_TYPE_NO_CONDITION = 1

    /** 审核加入 */
    static readonly JOIN_TYPE_AUDIT = 2

    /** 条件加入 */
    static readonly JOINT_TYPE_CONDITION = 3

    //#endregion

    //#region 妖盟法阵

    /** 法阵-增伤 */
    static readonly MAGIC_ID_HURT = 1

    /** 法阵-减伤 */
    static readonly MAGIC_ID_HARMLESS = 2

    /** 法阵-抗晕 */
    static readonly MAGIC_ID_LOW_VERTIGO = 3

    //#endregion

    /** 联盟职务列表 */
    static readonly roleMap = new Map([
        [this.ROLE_LEADER, '盟主'],
        [this.ROLE_DEPUTY_LEADER, '副盟主'],
        [this.ROLE_OLDER, '长老'],
        [this.ROLE_MEMBER, '成员'],
    ])

    /** 退盟原因 */
    static readonly quitTypeMap = new Map([
        [this.QUIT_TYPE_INITIATIVE, '主动退出'],
        [this.QUIT_TYPE_KICK, '提出要能'],
        [this.QUIT_TYPE_DISSOLUTION, '妖盟解散'],
    ])

    /** 退出类型是否需要cd 0不需要 1需要 */
    static readonly quitCdMap = new Map([
        [this.QUIT_TYPE_INITIATIVE, true],
        [this.QUIT_TYPE_KICK, false],
        [this.QUIT_TYPE_DISSOLUTION, false],
    ])

    /**
     * 退出是否需要cd
     * @param quitType
     * @returns
     */
    static isQuitCd(quitType: int) {
        const isNeed = this.quitCdMap.get(quitType)
        if (isNeed == null) {
            throw SystemErrors.SysParamError
        }
        return isNeed
    }
}
