import { GameError } from '@arthropoda/game-engine'

export class GuildErrors {
    static readonly GuildNotUnlock = new GameError(15001, '联盟未解锁')

    static readonly GuildIsNull = new GameError(15002, '联盟不存在')

    static readonly GuildNameToLong = new GameError(15003, '联盟名字需小于6个字')

    static readonly GuildDeclToLong = new GameError(15004, '联盟宣言需小于50个字')

    static readonly GuildNoticeToLong = new GameError(15005, '联盟公告需小于50个字')

    static readonly GuildContactToLong = new GameError(15006, '盟主联系方式需小于10个字')

    static readonly GuildNoThisHead = new GameError(15007, '联盟未获取该头像')

    static readonly GuildNoRandGuild = new GameError(15008, '没有可以随机加入的联盟')

    static readonly GuildTargetIsJoinOther = new GameError(15009, '该玩家已经加入妖盟')

    static readonly GuildNotJoinGuild = new GameError(15011, '您暂未加入妖盟')

    static readonly GuildTargetNoApply = new GameError(15012, '此玩家没有申请')

    static readonly GuildAlreadyGuild = new GameError(15014, '已加入过联盟')

    static readonly GuildNameHasExist = new GameError(15015, '联盟名称已被占用')

    static readonly GuildLeaveCd = new GameError(15016, '退盟冷却期间无法加入联盟')

    static readonly GuildMemberFull = new GameError(15017, '联盟成员已满')

    static readonly GuildNotOpen = new GameError(15018, '联盟暂未开放加入')

    static readonly GuildHasApply = new GameError(15019, '您已申请过啦，请勿重复申请')

    static readonly GuildApplyFull = new GameError(15020, '申请数量已达上限')

    static readonly GuildNoPower = new GameError(15021, '暂未拥有该权限哦~')

    static readonly GuildRoleMaxCnt = new GameError(15022, '联盟职务数量已达上限')

    static readonly GuildNoGuild = new GameError(15023, '尚未加入联盟')

    static readonly GuildHaveMember = new GameError(15024, '联盟内还有其他成员')

    static readonly GuildTransNeedJoinTime = new GameError(15033, '该玩家加入联盟不足24小时，无法转让')

    static readonly GuildTransInIntervalTime = new GameError(15034, '盟主正在转让中')

    static readonly GuildNotApplyGuild = new GameError(15035, '您暂未申请该联盟')

    static readonly GuildNoTransfer = new GameError(15036, '当前未在转让中')

    static readonly GuildUserNoLv = new GameError(15037, '当前官品等级不足')

    static readonly GuildDecreeTitleToLong = new GameError(15038, '标题过长')

    static readonly GuildDecreeContentToLong = new GameError(15039, '内容过长')

    static readonly GuildCaptureUnOperator = new GameError(15040, '当前处于俘虏状态，无法操作')

    static readonly GuildCaptureIdentity = new GameError(15041, '当前处于俘虏状态')

    static readonly GuildHasInvite = new GameError(15042, '玩家已被邀请过，请勿重复邀请')

    static readonly GuildTargetNoInvite = new GameError(15043, '您未被邀请加入')

    static readonly GuildDonateLimit = new GameError(15044, '建设已达上限')

    static readonly GuildGroupNotExist = new GameError(15055, '分组不存在')

    static readonly GuildHaveRole = new GameError(15056, '拥有职位，请先罢免')

    static readonly GuildRoleLimit = new GameError(15057, '职位未满足要求')

    static readonly GuildDonateCostLimit = new GameError(15058, '今日可捐贡金超出上限')

    static readonly GuildRoleChange = new GameError(15059, '该成员职位已变更')

    static readonly GuildTrialNoStart = new GameError(15060, '未达开启时间')

    static readonly GuildLvLimit = new GameError(15061, '联盟等级不足')

    static readonly GuildTrialOpen = new GameError(15062, '副本已开启，请勿重复操作')

    static readonly GuildTrialHeroUsed = new GameError(15063, '门客已出战')

    static readonly GuildTrialMonsterDie = new GameError(15064, 'boss已阵亡')

    static readonly GuildTrialNoOpen = new GameError(15065, '副本未开启')

    static readonly GuildNamePrefixToLong = new GameError(15066, '修改昵称超过上限')

    static readonly GuildHasNamePrefix = new GameError(15067, '昵称已发布')

    static readonly GuildDissolution = new GameError(15068, '该联盟已解散')

    static readonly GuildDonateCd = new GameError(15069, '建设冷却中')

    static readonly GuildStateIdLimit = new GameError(15070, '无法邀请非本州玩家')

    static readonly GuildOtherAllyLimit = new GameError(15071, '对方结盟已达上限')

    static readonly GuildLeaveCdByCreate = new GameError(15072, '退盟冷却期间无法创建联盟')

    static readonly GuildSysNotOpen = new GameError(15073, '对方尚未解锁联盟')

    static readonly GuildCreatGroupLimit = new GameError(15074, '分组数量已达上限')

    static readonly GuildAddMarkLimit = new GameError(15075, '联盟标记已达上限')

    static readonly GuildGroupHasAppointed = new GameError(15076, '当前分组已被指派攻城计划，无法解散')

    static readonly GuildMissionNoStart = new GameError(15077, '妖盟历练未开始')

    static readonly GuildMagicUnLock = new GameError(15078, '法阵未解锁')

    static readonly GuildMagicMaxLv = new GameError(15079, '法阵已满级')

    static readonly GuildPillNotEnough = new GameError(15080, '妖丹不足')

    static readonly GuildExpiredRed = new GameError(15081, '红包已过期')

    static readonly GuildNoRedTimes = new GameError(15082, '红包领取次数不足')

    static readonly GuildHasOpened = new GameError(15083, '重复领取')

    static readonly GuildNoNum = new GameError(15084, '红包已领完')

    static readonly GuildNoCutTimes = new GameError(15085, '砍价次数不足')

    static readonly GuildNotCutTime = new GameError(15086, '不在砍价时间')

    static readonly GuildLowestPrice = new GameError(15087, '您购买的礼包已经是最低价啦')

    static readonly GuildNoCompensate = new GameError(15088, '已经无补差价次数')

    static readonly GuildNoCut = new GameError(15089, '购买前请先砍价')

    static readonly GuildGiftLimt = new GameError(15090, '山头礼包购买次数不足')

    static readonly GuildNotBuyGift = new GameError(15091, '您未购买礼包，没有差价补偿')

    static readonly GuildNotAlly = new GameError(15092, '对方不是盟友')
}
