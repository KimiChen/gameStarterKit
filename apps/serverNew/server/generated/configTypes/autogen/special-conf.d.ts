declare interface ParamTypes {
    /** 元神-妖术重置技能消耗[道具id，数量] */
    readonly GongSkillRefreshCost: [number, number]
    /** 聊天-发言要求-等级 */
    readonly ChatTalkingLevel: number
    /** 聊天-读取最新聊天数据-条数 */
    readonly ChatLoad: number
    /** 聊天-世界发言间隔时间-秒 */
    readonly ChatInterval: number
    /** 聊天-发言字数限制 */
    readonly ChatLength: number
    /** 临时消息,对方未回复前，最多只能发送3条临时消息 */
    readonly ChatStrangerNum: number
    /** 聊天-同时发消息的陌生人数量 */
    readonly LetterStrangerLimit: number
    /** 聊天消息最多保留X天，单位秒 */
    readonly ChatDay: number
    /** 邮件最大数量上限X封 */
    readonly MailLimit: number
    /** 超过X天的邮件自动删除，单位秒 */
    readonly LetterMailLastTime: number
    /** 战斗-关口占领信息持续时间 */
    readonly BattleGateTipsLastTime: number
    /** 个人修炼npc初始赠送的点击次数 */
    readonly Npc1: number
    /** 个人修炼npc每日5点回复的次数 */
    readonly Npc2: number
    /** 个人修炼npc的形象资源 */
    readonly Npc3: number
    /** 黑名单上限 */
    readonly FriendBlackList: number
    /** 好友申请上限 */
    readonly FriendApplyMaxLimit: number
    /** 好友申请最多保留15天 */
    readonly FriendApplyTime: number
    /** 修炼-快速挂机的收益时间，单位秒 */
    readonly PracticeFastTime: number
    /** 修炼-快速每天挂机次数 */
    readonly PracticeFastMaxTimes: number
    /** 修炼-快速挂机每日免费领取次数 */
    readonly PracticeFastFreeTimes: number
    /** 修炼-挂机最大收益时间，单位秒 */
    readonly PracticeHangUpMaxTime: number
    /** 修炼-挂机的单位结算收益时间，单位秒 */
    readonly PracticeUnitTime: number
    /** 修炼-NPC每天增加攻击次数 */
    readonly PracticeNpcAddTimesPerDay: [number, number]
    /** 修炼-NPC攻击次数上限 */
    readonly PracticeNpcAttackMaxTimes: number
    /** 个人-自由加点重置消耗(每重置一点的消耗)[道具id，数量] */
    readonly UserAttrAddRefreshCost: [number, number]
    /** 个人-改名消耗[道具id，数量] */
    readonly UserChangeNameCost: [number, number]
    /** 属性-力量转化攻击力倍率，1万代表1的数值 */
    readonly TransferStrengthRate: number
    /** 属性-耐力转化防御力倍率，1万代表1的数值 */
    readonly TransferEnduranceRate: number
    /** 属性-体力转化血量倍率，1万代表1的数值 */
    readonly TransferConstitutionRate: number
    /** 评分-攻击力评分倍率，1万代表1的数值 */
    readonly FpAtkRate: number
    /** 评分-防御力评分倍率，1万代表1的数值 */
    readonly FpDefRate: number
    /** 评分-生命值评分倍率，1万代表1的数值 */
    readonly FpHpRate: number
    /** 个人-自由加点数上限 */
    readonly UserAttrAddLimit: number
    /** 个人初始释放技能次数 */
    readonly SkillInitialTime: number
    /** 一次释放次数的法力初始上限 */
    readonly SkillManaLimit: number
    /** 1点精力换算X法力 */
    readonly ManaChange: number
    /** 竞技场初始法力值 */
    readonly ArenaBaseMana: number
    /** 竞技场刷新cd */
    readonly ArenaRefreshCd: number
    /** 普攻增加法力值 */
    readonly AtkMana: number
    /** 夔牛活动历练开启时间，X点开启(24小时制) */
    readonly KuiCowStart: number
    /** 夔牛活动历练持续时间，单位秒 */
    readonly KuiCowTime: number
    /** 回复1点精力消耗的时间，单位秒 */
    readonly PowerRecoverCd: number
    /** 创角-中文名字数限制 */
    readonly PlayerCreateChineseNameLimit: number
    /** 创角-其他语言名字字数限制 */
    readonly PlayerCreateOtherNameLimit: number
    /** 创角-改名冷却时间 （单位天） */
    readonly PlayerCreateChangeNameCD: number
    /** 装备等级范围 */
    readonly EquipSmeltLv: [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
    ]
    /** 夔牛的地图id */
    readonly KuiCowMap: number
    /** 器灵-保底橙色洗练次数 */
    readonly WeaponSmallBaseNum: number
    /** 器灵-保底红色洗练次数 */
    readonly WeaponBigBaseNum: number
    /** 器灵-小保底给的品质id */
    readonly WeaponSmallBaseQuality: number
    /** 器灵-大保底给的品质id */
    readonly WeaponBigBaseQuality: number
    /** 装备背包的最大上限 */
    readonly EquipNumMax: number
    /** 个人修炼掉落X品质装备宝箱每日最大数量 */
    readonly PracticeDropLimit1: number
    /** 个人修炼掉落X品质装备宝箱每日最大数量 */
    readonly PracticeDropLimit2: number
    /** 个人修炼掉落X品质装备宝箱每日最大数量 */
    readonly PracticeDropLimit3: number
    /** 个人修炼掉落X品质装备宝箱每日最大数量 */
    readonly PracticeDropLimit4: number
    /** 个人修炼掉落X品质装备宝箱每日最大数量 */
    readonly PracticeDropLimit6: number
    /** 个人修炼掉落X品质装备宝箱每日最大数量 */
    readonly PracticeDropLimit8: number
    /** 个人修炼自动开启X品质及之下的装备宝箱 */
    readonly OpenDropLimit: number
    /** 山头-创山消耗[道具id，数量] */
    readonly GuildCreateCost: [number, number]
    /** 山头-改名消耗[道具id，数量] */
    readonly GuildChangeNameCost: [number, number]
    /** 山头-名称中文限长 */
    readonly GuildCreateChinseNameLimit: number
    /** 山头-名称其他语言限长 */
    readonly GuildCreateOtherNameLimit: number
    /** 山头-宣言限长 */
    readonly GuildCreateDeclLimit: number
    /** 山头-公告限长 */
    readonly GuildCreateNoticeLimit: number
    /** 山头-联系方式限长 */
    readonly GuildCreateContactLimit: number
    /** 山头-大王多少天非活跃自动转让（天） */
    readonly GuildLeaderAutoTransferTime: number
    /** 山头-最多可储存X条入盟申请 */
    readonly GuildLogLimit: number
    /** 山头-退山冷却周期（秒） */
    readonly GuildQuitCD: number
    /** 山头-邀请他人加入山头/自动拒绝山头邀请的间隔(毫秒) */
    readonly GuildInviteCD: number
    /** 月卡练功房经验增益比例，万分比 */
    readonly PrivilegeMonthPracticeEffect: number
    /** 一个玩家初始的攻击速度 */
    readonly UserInitSpeed: number
    /** 玩家主动大招/神符的攻击速度 */
    readonly SkillAtkSpeed: number
    /** 竞技场声望失败系数 */
    readonly ArenaPrestigeLoseRatio: number
    /** 竞技场天梯分胜利系数 */
    readonly ArenaScoreWinRatio: number
    /** 竞技场天梯分失败系数 */
    readonly ArenaScoreLoseRatio: number
    /** 竞技场挑战领奖次数上限 */
    readonly ArenaAwardTimes: number
    /** 竞技场开放初始声望 */
    readonly ArenaInceptionPrestige: number
    /** X等级后聊天可发言 */
    readonly ChatWorldTalkLevel: number
    /** X等级后好友聊天可发言 */
    readonly ChatFriendTalkLevel: number
    /** 护山妖兽试炼开启时间，每天的第X秒 */
    readonly GuildMissionStartTime: number
    /** 护山妖兽试炼结束时间，每天的第X秒 */
    readonly GuildMissionEndeTime: number
    /** 神秘人不得超过玩家等级 */
    readonly SteriousMan1: number
    /** 看广告获得精力的每日限制次数 */
    readonly PowerRecoverAdLimit: number
    /** 看一次广告增加多少精力 */
    readonly PowerRecoverAdValue: number
    /** 每日仙玉购买精力的限购次数 */
    readonly PowerRecoverGcLimit: number
    /** 道具恢复精力所消耗的道具id */
    readonly PowerRecoverPropId: number
    /** 使用道具增加多少精力 */
    readonly PowerRecoverPropValue: number
    /** 使用道具增加精力是否开启(1开启，0关闭） */
    readonly PowerRecoverPropIdOpen: number
    /** 看广告增加精力是否开启(1开启，0关闭） */
    readonly PowerRecoverAdOpen: number
    /** 仙玉购买精力是否开启(1开启，0关闭） */
    readonly PowerRecoverGcOpen: number
    /** 冲榜活动双倍次数上限，填写使用双倍卡的张数，由程序换算成次数上限 */
    readonly DoubleDropLimit: number
    /** 不进行滚屏公告播报的系统id */
    readonly MarqueeBlock: [number, number, number, number, number, number, number, number, number, number, number]
    /** 中午免费领取的精力 */
    readonly noonReceiveEnergy: number
    /** 晚上免费领取的精力 */
    readonly nightReceiveEnergy: number
    /** 中午免费领取的开始时间 */
    readonly noonReceiveEnergyStart: number
    /** 晚上免费领取的结束时间 */
    readonly noonReceiveEnergyEND: number
    /** 晚上免费领取的开始时间 */
    readonly nightReceiveEnergyStart: number
    /** 晚上免费领取的结束时间 */
    readonly nightReceiveEnergyEND: number
    /** 哪些品质的物品icon展示通用描边动效 */
    readonly propEffect: [number, number, number, number]
    /** 增伤,境界压制系数 */
    readonly RealmHurtRate_Win: number
    /** 减伤,境界压制系数 */
    readonly RealmHurtRate_Fail: number
    /** 默认显示动物形态的境界限制 */
    readonly TransRealm: number
    /** 显示人形需要的时装类型(当前:神装) */
    readonly TransType: [number]
    /** 化形-重塑消耗[道具id，数量] */
    readonly TransRealmRefreshCost: [number, number]
    /** 器灵-坑位开启的赠送品质id */
    readonly WeaponOpenQuality: number
    /** 本服夔牛类型 */
    readonly KuiCowType: number
    /** 跨服夔牛类型 */
    readonly CrossKuiCowType: number
    /** 跨服夔牛活动历练开启时间，X点开启(24小时制) */
    readonly CrossKuiCowStart: number
    /** 跨服夔牛活动历练持续时间，单位秒 */
    readonly CrossKuiCowTime: number
    /** 任务类型展示怪物标识,需要击杀怪物任务类型（param1配置地图id） */
    readonly fightBossTaskTypes: [number, number, number]
    /** 伤害公式浮动下限 */
    readonly damage_float_min: number
    /** 伤害公式浮动上限 */
    readonly damage_float_max: number
    /** 游戏帮助滚屏公告推送间隔，单位分 */
    readonly MarqueeSystemPushTime: number
    /** 聊天-私聊发言间隔时间-秒；各个私聊对象独立cd */
    readonly PrivateChatInterval: number
    /** 聊天-跨服频道发言间隔时间-秒；各个跨服活动频道独立cd */
    readonly CrossChatInterval: number
    /** 聊天-山头频道发言间隔时间-秒； */
    readonly GuildChatInterval: number
    /** 炼器-品质特效设置 */
    readonly EquipShowQuality: number
    /** 单次释放怒气初始上限 */
    readonly CrossKuiCowSkillManaLimit: number
    /** 最大释放次数 */
    readonly CrossKuiCowSkillMaxTimes: number
    /** 单点精力消耗转化为素萝攻击消耗道具id~数量 */
    readonly SteriousManChangeItem: [number, number]
    /** 素萝攻击1次消耗道具id~数量 */
    readonly SteriousManClickCost: [number, number]
    /** 素萝境界和次数变更的节点主线id（完成）第二幕-上部分触发的主线节点id */
    readonly SteriousManTransMainTaskId: number
    /** 素萝境界和次数变更的节点主线id（完成）第二幕-下部分触发的主线节点id */
    readonly SteriousManTransMainTaskId2: number
    /** 素萝境界和次数变更的节点主线id后触发的剧情id */
    readonly SteriousManTransPlotId: number
    /** 素萝境界和次数变更的节点主线id前境界 */
    readonly SteriousManTransRealmBefore: number
    /** 素萝境界和次数变更的节点主线id后境界 */
    readonly SteriousManTransRealmAfter: number
    /** 素萝境界和次数变更的节点主线id前spineID */
    readonly SteriousManTransRealmBeforeSpine: number
    /** 素萝境界和次数变更的节点主线id前单次点击攻击力 */
    readonly SteriousManTransRealmBeforeAtk: number
    /** 素萝点击次数间隔时间限制 */
    readonly SteriousManClickTimeLimit: number
    /** 开场演出第二幕上下承接时进入单人修炼触发的剧情id */
    readonly Perform2ForbidPracticePlotId: number
    /** 夔牛狂暴的血量限制，万分比 */
    readonly KuiCowRageHp: number
    /** 自动熔炼品质 */
    readonly EquipSmeltquality: [number, number, number, number, number, number]
    /** 罗刹鬼市-上跑马灯品质 */
    readonly GhostCityLEDQuality: number
    /** 装备历练首次定制掉落 */
    readonly EquipMissionFirst: [[number, number], [number, number], [number, number]]
    /** 装备历练第二次额外掉落 */
    readonly EquipMissionSecond: []
    /** 元神历练首次定制掉落 */
    readonly GongMissionFirst: [[number, number], [number, number], [number, number]]
    /** 法宝历练首次定制掉落 */
    readonly WeaponMissionFirst: [[number, number], [number, number], [number, number]]
    /** 历练-邀请弹窗、复活提示弹窗自动关闭cd（毫秒）(黄泉秘境战斗内邀请cd) */
    readonly MissionNoticeCdTime: number
    /** 鏖战天庸-怪物说话文本刷新间隔(秒) */
    readonly CrossMissionTalkInterval: number
    /** 当前服务器内达到该境界的前-名玩家会有境界提升播报与公告 */
    readonly pushRealmLimit: number
    /** 前N个主线任务，完成时若不处于修炼页签，会引导点击修炼按钮(填主线任务的orderId) */
    readonly MainTaskOrderGuideFinger: number
    /** 通用战场boss单管血条血量 */
    readonly ArenaBossBloodBarSingleNum: number
    /** 通用战场玩家击杀数量保存时间（秒） */
    readonly ArenaKillRecordSaveTime: number
    /** 特殊定制的主线节点 */
    readonly PracticeTaskPoint: [number, number, number]
    /** 在该系统内进行/完成主线任务时，不播报主线横幅提示 */
    readonly TaskTipLimit: [number, number]
    /** 元神等级最高可比角色等级多的等级数 */
    readonly GongLvLimit: number
    /** 法宝等级最高可比角色等级多的等级数 */
    readonly WeaponLvLimit: number
    /** 供奉技能抽取消耗 */
    readonly WorshipSkillcost: [number, number]
    /** 供奉技能抽保底次数1[保底品质，保底次数,抽取最低次数](保底优先级先time1） */
    readonly WorshipSkillMaxTime1: [number, number, number]
    /** 供奉技能抽保底次数2[保底品质，保底次数，抽取最低次数] */
    readonly WorshipSkillMaxTime2: [number, number, number]
    /** 供奉技能坑位解锁玩家等级需求 */
    readonly WorshipPlotOpenLv: [number, number, number]
    /** 主角战斗时发招音效播放概率（万分比） */
    readonly AudioPlayerFghitRate: number
    /** BOSS受击时音效播放概率（万分比） */
    readonly AudioMonsterHitRate: number
    /** 小怪死亡时音效播放概率（万分比） */
    readonly AudioMonsterDieRate: number
    /** 怪物台词播放概率（万分比） */
    readonly AudioMonsterSpeakRate: number
    /** 怪物台词播放间隔时间（毫秒） */
    readonly AudioMonsterSpeakGapTime: number
    /** 桃园-进入系统时播放的音频概率（万分比） */
    readonly AudioPeach0rchardEnterSpeakRate: number
    /** 播放称号入场播报的称号品质(配置的品质及以上) */
    readonly TitleReportQuality: number
    /** 第二幕假战斗，初始状态王大壮剩余血量 */
    readonly GuideFightLeftHp: number
    /** 第二幕假战斗，我单次普攻打掉的血 */
    readonly GuideFightMyNormalAtk: [number, number]
    /** 第二幕假战斗，我第五击打掉的血 */
    readonly GuideFightMySpecialAtk: [number, number]
    /** 第二幕假战斗，王大壮单次普攻打我的血 */
    readonly GuideFightDazhuangNormalAtk: [number, number]
    /** 第二幕假战斗，怪物血量上限 */
    readonly GuideFightMonsterMaxHp: number
    /** 第二幕假战斗，玩家血量上限 */
    readonly GuideFightPlayerMaxHp: number
    /** 强引导中需要配置返回修炼引导手指的id */
    readonly PracticeTabFingerByGuideIds: [number]
    /** 满词条数量 */
    readonly equip_roleeffect_limit: number
    /** 掉落X品质以上装备的特殊效果限制 */
    readonly Equip_dropeffect_limit: number
    /** 炼器前五抽固定装备 */
    readonly EquipFirstFiveDraw: [number, number, number, number, number]
    /** 有可点击的波次BOSS挑战按钮时，弱引导弹出的地图等级范围 */
    readonly bossFightFingerMapLv: number
    /** 掉落X品质及以上装备的特殊音效 */
    readonly EquipAudioSpecialDrop: number
    /** 神装神器神符耐久度每隔X小时回复 */
    readonly durableRecovery: number
    /** 山头礼包功能，山头中每个玩家每日砍价次数上限 */
    readonly playerDailyCutTimes: number
    /** 山头礼包，活动期间内每个玩家的限购次数 */
    readonly guildCutGiftBuyLimit: number
    /** 装备分享奖励每日次数 */
    readonly equipShareTimes: number
    /** 装备分享单次道具奖励和数量 */
    readonly equipShareAward: [number, number]
    /** 抽到品质为X及以上的装备，播报公告和跑马灯 */
    readonly EquipDrawInfo: number
    /** 玩家信息展示的元神时间，[a,b]，a=展示间隔，b=持续时间，单位：秒 */
    readonly PlayerBackShow: [number, number]
    /** 冲榜活动排行榜显示人数上限 */
    readonly ActivityRankLimit: number
    /** 大招瞬间元神及吟唱置顶展示的时间（毫秒） */
    readonly BigSkillShowTime: number
    /** 大招技能元神展示的总时长（毫秒） */
    readonly BigSkillShowTime2: number
    /** 桃园收获基础时间（秒） */
    readonly PeachOrchardCd: number
    /** 桃园收获存储最大次数 */
    readonly PeachOrchardMaxTimes: number
    /** 桃园收获每日最大次数 */
    readonly PeachOrchardDailyTimes: number
    /** 桃园浇水次数 */
    readonly PeachOrchardWaterTimes: number
    /** 桃园浇水减少收获时间（秒） */
    readonly PeachOrchardWaterReTime: number
    /** 桃园协助盟友次数 */
    readonly PeachOrchardHelpTimes: number
    /** 桃园受盟友协助次数 */
    readonly PeachOrchardHelpedTimes: number
    /** 桃园蛤蟆摸鱼次数 */
    readonly PeachOrchardSleepTimes: number
    /** 桃园蛤蟆摸鱼间隔区间（秒） */
    readonly PeachOrchardSleepCd: [number, number]
    /** 桃园唤醒蛤蟆减少收获时间（秒） */
    readonly PeachOrchardWakeReTime: number
    /** 桃园蛤蟆切换动作时间（秒） */
    readonly PeachOrchardNpcStateTime: number
    /** 桃园浇水间隔（秒） */
    readonly PeachOrchardWaterCd: number
    /** 桃园发起协助间隔时间（秒） */
    readonly PeachOrchardAskHelpCd: number
    /** 被玩家击杀装备耐久减少值 */
    readonly KilledReDurable: number
    /** 破损装备剩余属性万分比 */
    readonly BrokenEquipmentAttrRatio: number
    /** 耐久红点提示阈值 */
    readonly DurableTips: number
    /** 击杀玩家增加红名值 */
    readonly KillEvilValue: number
    /** 红名值减少1点需要时间 */
    readonly EvilValueReCd: number
    /** 桃园弱引导 */
    readonly PeachOrchardWaterGoto: [number]
    /** 青蛙气泡显示时长（秒） */
    readonly PeachOrchardNpcTalkTime: number
    /** 青蛙气泡显示间隔（秒） */
    readonly PeachOrchardNpcTalkCd: number
    /** 桃园蛤蟆未获得时的传送系统id */
    readonly PeachOrchardGetNpcJumpId: number
    /** 青蛙锄草时间（毫秒） */
    readonly PeachOrchardWeedingTime: number
    /** 青蛙站原地待机时间（毫秒） */
    readonly PeachOrchardIdleTime: number
    /** 山头试炼开启时间，每天的第X秒 */
    readonly GuildBossStartTime: number
    /** 山头试炼结束时间，每天的第X秒 */
    readonly GuildBossEndeTime: number
    /** 山头试炼每日的挑战次数 */
    readonly GuildBossTimes: number
    /** 试炼红包每日的领取次数 */
    readonly GuildBossEnvelopeTimes: number
    /** 爬塔黄泉秘境每日帮助次数 */
    readonly TowerHelpTimes: number
    /** 爬塔黄泉秘境每日挑战令恢复数量 */
    readonly TowerDailyTimes: number
    /** 山头红包每日可领取次数 */
    readonly GuildRedEnvelopeTimes: number
    /** 功绩红包的过期时间（秒） */
    readonly GuildRedEnvelopeOverTimes: number
    /** 山头提醒Cd */
    readonly GuildRemindCd: number
    /** 山头系统通知保留时长（秒） */
    readonly GuildNoticeHideTime: number
    /** 可以被隐藏的系统通知类型(对应System_info中的ID) */
    readonly GuildNoticeHideType: [number, number, number, number, number]
    /** 灵脉每次占领保护时间 */
    readonly LodeProtectTime: number
    /** 灵脉每天初始保护次数 */
    readonly LodeProtectTimes: number
    /** 灵脉每天被协助次数上限 */
    readonly LodeBeHelpedTimes: number
    /** 灵脉每次被保护时长， */
    readonly LodeBeProtectedTime: number
    /** 灵脉每天协助他人次数上限 */
    readonly LodeHelpTimes: number
    /** 灵脉收益累计最大时长 */
    readonly LodeMaxTime: number
    /** 灵脉收单位结算时长 */
    readonly LodeUnitTime: number
    /** 每日最大挑战次数 */
    readonly LodeRobDailyTimes: number
    /** 灵脉掠夺有主地收益（等于对应位置每次产出*系数） */
    readonly LodeRobRatio: number
    /** 灵脉刷新地块cd */
    readonly LodeRefreshCd: number
    /** 灵脉请求帮助cd */
    readonly LodeAskHelpCd: number
    /** 黄泉秘境可同时邀请人数限制 */
    readonly TowerInviteNumlimit: number
    /** 拖箱子地图距离 */
    readonly TowBoxdistance: number
    /** 拖箱子速度 */
    readonly TowBoxSpeed: number
    /** 拖箱子刷新货物次数(废弃） */
    readonly TowBoxRefreshTimes: number
    /** 拖箱子刷新货物cd(废弃） */
    readonly TowBoxRefreshCd: number
    /** 拖箱子刷新货物仙玉消耗，超过次数的按最后一个消耗 */
    readonly TowBoxRefreshCost: [number, number, number, number, number, number, number, number, number, number]
    /** 拖箱子刷新列表cd */
    readonly TowBoxRefreshListCd: number
    /** 拖箱子刷新列表次数上限 */
    readonly TowBoxRefreshListNum: number
    /** 拖箱子刷新列表，解锁玩家数低于(包含)一定数量时，启用机器人 */
    readonly TowBoxRefreshRobotLimitNum: number
    /** 拖箱子工人持有数量上限 */
    readonly TowBoxWorkerOwnNum: number
    /** 拖箱子元宝购买工人价格 */
    readonly TowBoxWorkerPrice: number
    /** 拖箱子元宝购买工人限购数，终生限购 */
    readonly TowBoxWorkerBuyLimit: number
    /** 拖箱子元宝购买工人获得的物品，填写物品表id */
    readonly TowBoxWorkerBuyItem: [number, number]
    /** 拖箱子工人体力值上限 */
    readonly TowBoxWorkerPowerNum: number
    /** 拖箱子日志存储及显示数量限制，超出限制后删除时间较早的日志 */
    readonly TowBoxInfoLimit: number
    /** 拖箱子玩法，玩家本人场景内资源空位大于一定数量时，一定时间后自动刷新空位资源。格式[资源空位数(大于等于)，间隔时间(秒)] */
    readonly TowBoxAutoRefresh: [number, number]
    /** 拖箱子玩法，服务器达到指定时间点时自动刷新所有玩家场景的资源，格式为[时间点1,时间点2,时间点3](24小时制) */
    readonly TowBoxServerAutoRefresh: [number, number, number]
    /** 拖箱子探寻列表中，陌生人条目的数量 */
    readonly TowBoxListStrangerNum: number
    /** 拖箱子探寻列表中，好友+同山头成员条目的总数量 */
    readonly TowBoxListFriendNum: number
    /** 拖箱子功能引导，第一次拖拽货物的id */
    readonly TowBoxFirstTowId: number
    /** 拖箱子功能引导，第一次拖拽魂石的时间。单位：秒 */
    readonly TowBoxFirstTowTime: number
    /** 渡劫战斗自动战斗倒计时秒 */
    readonly RealmBattlePreTime: number
    /** 渡劫自动战斗开始数量 */
    readonly RealmAutoStartNumb: number
    /** 渡劫战斗首次协助者id（读monster表） */
    readonly RealmHelperId: [number, number, number, number, number]
    /** 点赞日志上限 */
    readonly UpvoteLimit: number
    /** 弹幕从屏幕一端到另一端所需的时间，毫秒 */
    readonly BarrageSpeed: number
    /** 下一条弹幕时间，毫秒 */
    readonly BarrageGap: number
    /** 最终命中率》=50% */
    readonly AttrFinalHitMin: number
    /** 初始暴击伤害=200% */
    readonly AttrBaseCritDamage: number
    /** 眩晕概率，最终是初始施加buff概率的N倍（万分比） */
    readonly AttrVertigoRatio: number
    /** 祝贺间隔时间，秒 */
    readonly FestivalCongratulationTime: number
    /** 素罗祝福间隔，分钟 */
    readonly SteriousManCongratulationTime: number
    /** 春节基金历练积分 */
    readonly SpringFundMissionScore: number
}
