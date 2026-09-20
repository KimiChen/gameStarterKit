export class ActivityDefine {
    /** 冲榜类型 */
    static readonly TypeActivityName_Rank = 'Rank'

    /** 首充活动  */
    static readonly FirstPay = 'FirstRecharge'

    /** 每日充值 */
    static readonly DailyRecharge = 'dailyRecharge'

    /** 累日充值 */
    static readonly DaysRecharge = 'daysRecharge'

    /** 累计充值 */
    static readonly TotalRecharge = 'totalRecharge'

    /** 礼包前缀 */
    static readonly Gift_Prefix = 'Gift'

    /** 限时礼包活动 */
    static readonly GiftLimit = this.Gift_Prefix + 'Limit'

    /** 仙玉礼包活动 */
    static readonly GiftGc = this.Gift_Prefix + 'Gc'

    /** 限时奖励前缀 */
    static readonly LimitReward_Prefix = 'limitReward'

    /** 登录天数 */
    static readonly LimitReward_LoginDay = this.LimitReward_Prefix + 'LoginDay'

    /** 活动冲榜前缀 */
    static readonly Rank_Prefix = 'Rank'

    static readonly Cross_Rank_Prefix = 'CrossRank'

    /** 本服 角色等级冲榜 个人 */
    static readonly RankLevel = 'RankLevel'

    /** 本服 法宝等级冲榜 个人 */
    static readonly RankWeapon = 'RankWeapon'

    /** 本服 功法等级冲榜 个人 */
    static readonly RankGong = 'RankGong'

    /** 本服 灵气掉落冲榜 个人 */
    static readonly RankAbPointDraw = 'RankAbPointDraw'

    /** 本服 妖气掉落 个人 */
    static readonly RankEnergyDraw = 'RankEnergyDraw'

    /** 本服 装备评分冲榜 个人 */
    static readonly RankEquipFp = 'RankEquipFp'

    /** 本服 功法评分冲榜 个人 */
    static readonly RankGongFp = 'RankGongFp'

    /** 本服 法宝评分冲榜 个人 */
    static readonly RankWeaponFp = 'RankWeaponFp'

    /** 每日充值 */
    static readonly RechargeDaily = 'RechargeDaily'

    /** 累日充值 */
    static readonly RechargeDays = 'RechargeDays'

    /** 累计充值 */
    static readonly RechargeTotal = 'RechargeTotal'

    /**跨服夔牛*/
    static readonly CrossKuiCow = 'CrossKuiCow'

    /**八荒历练*/
    static readonly CrossMission = 'CrossMission'

    // #region 跨服型定义
    /**跨服*/
    static readonly CROSS_TYPE_CROSS = 1
    // #endregion

    // #region 活动的状态
    static readonly STATUS_NORMAL = 1 // 常规状态

    static readonly STATUS_DEL = 2 // 活动删除

    static readonly STATUS_CLOSE = 3 // 活动关闭

    static readonly DEL_SUCCESS = 100 // 删除成功
    // #endregion

    //#region gmService添加活动错误码枚举
    static readonly GM_ERR_CODE = 400

    static readonly GM_SUCCESS_CODE = 0

    /**
     * 是否是冲榜活动
     * @param string activityName
     */
    static isRankActivity(activityName: string) {
        return C.list(activityName).typeActivityName == ActivityDefine.TypeActivityName_Rank
    }

    /**
     * 是否是礼包活动
     * @param string activityName
     */
    static isGiftActivity(activityName: string) {
        //以 Gift 开头的是礼包活动
        return activityName.indexOf(ActivityDefine.Gift_Prefix) == 0
    }

    /**
     * 是否是限时奖励活动
     * @param string activityName
     */
    static isLimitActivity(activityName: string) {
        //以 limitReward_ 开头的是限时奖励
        return activityName.indexOf(ActivityDefine.LimitReward_Prefix) == 0
    }
}
