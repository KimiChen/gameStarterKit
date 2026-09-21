import { Listen } from '@arthropoda/game-engine'
import { UserHash } from '@arthropoda/game-engine'
import { Mod, OnlyNet, OnlyRedis } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { PropBean } from '../../props/bean/PropBean'
import { TimesBean } from './TimesBean'
import { UserForbidBean } from './UserForbidBean'
import { RedDotBean } from '../../reddot/bean/RedDotBean'
import { RedDotListBean } from '../../reddot/bean/RedDotListBean'
import { UserAttrBean } from './UserAttrBean'
import { UserGongBean } from '../../gong/bean/UserGongBean'
import { UserWeaponBean } from '../../weapon/bean/UserWeaponBean'
import { UserEquipBean } from '../../equip/bean/UserEquipBean'
import { UserFashionBean } from '../../equip/bean/UserFashionBean'
import { UserPracticeBean } from '../../practice/bean/UserPracticeBean'
import { MailBean } from '../../mail/bean/MailBean'
import { ModFpBean } from './ModFpBean'
import { PowerBuyItem } from './PowerBuyItem'
import { DiffArray } from '@arthropoda/game-engine'
import { AdItem } from '../../ads/bean/AdItem'
import { TitleBean } from '../../title/bean/TitleBean'
import { BreakAwardItem } from '../../equip/bean/BreakAwardItem'
import { TqInfoItem } from '../../pay/bean/TqInfoItem'
import { PayInfoItem } from '../../pay/bean/PayInfoItem'
import { FirstPayItem } from '../../pay/bean/FirstPayItem'
import { GiftBuyItem } from '../../pay/bean/GiftBuyItem'
import { FundItem } from '../../pay/bean/FundItem'
import { TaskBoxAwardItem } from '../../task/bean/TaskBoxAwardItem'
import { ChatDailyItem } from '../../chat/bean/ChatDailyItem'
import { GuildNoticeItem } from '../../guild/bean/GuildNoticeItem'
import { MissionBean } from '../../mission/bean/MissionBean'
import { SceneFightSet } from '../../scene/bean/SceneFightSet'
import { SceneUsePropItem } from '../../scene/bean/SceneUsePropItem'
import { SceneCdItem } from '../../scene/bean/SceneCdItem'
import { SceneInviteShieldItem } from '../../scene/bean/SceneInviteShieldItem'
import { FightKillItem } from '../../scene/bean/FightKillItem'
import { TaskProgress } from '../../task/bean/TaskProgress'
import { TaskMonsterItem } from '../../task/bean/TaskMonsterItem'
import { GeneralCashItem } from '../../activity/bean/GeneralCashItem'
import {
    ListenAdsMapHandler,
    ListenEvilHandler,
    ListenGuildMFListHandler,
    ListenOpenidHandler,
} from '../event/ListenUser'

@Mod
export class User extends UserHash {
    //#region 基础数据

    /**
     * 玩家Id
     */
    id: int = 0

    /**
     * 区服Id
     */
    sId: int = 0

    /**
     * 注册渠道ID
     */
    spid: string = ''

    /**
     * 注册ID
     */
    @Listen(ListenOpenidHandler)
    openid: string = ''

    /**
     * 注册时间
     */
    initTime: int = 0

    /**
     * 是否已引导完创角
     */
    initRole: boolean = false

    /**
     * 第三方小游戏id
     */
    @OnlyRedis
    lineOpenId: string = ''

    /**
     * 昵称
     */
    name = ''

    /**
     * 上次改名时间
     */
    lastChangeNameTime: int = 0

    /**
     * 玩家形象
     */
    playerImage: int = 0

    /**
     * 等级
     */
    lv: int = 0

    /** 铜币 */
    copper: int = 0

    /** 铜币上次结算时间；仅服务端持久化，不下发客户端 */
    @OnlyRedis
    lastCopperIncomeTime: int = 0

    /**
     * 已算好但**尚未领取**的离线铜币。
     *
     * 登录时由 `CopperIncome.parkOffline` 暂存在这里，等客户端请求领取才进 `copper`
     * （离线收益不再在登录时自动到账）。断线前没领走的那笔会在下次登录时累加，不会丢。
     */
    @OnlyRedis
    offlineCopperPending: int = 0

    /** 上面那笔离线收益对应的离线秒数；同样只在领取时清零，供弹窗展示 */
    @OnlyRedis
    offlineCopperSecondsPending: int = 0

    /**
     * 经验
     */
    exp: int = 0

    /**
     * 玩家战力
     */
    fp: int = 0

    /**
     * 境界等级
     */
    realm: int = 0

    /**
     * 当前穿戴境界时装ID
     */
    realmImageId: int = 0

    /**
     * 种族
     */
    race: int = 0

    /**
     * 性别
     */
    sex: int = 0

    /**
     * 灵气
     */
    sc = 0.0

    /**
     * 仙玉
     */
    gc = 0.0

    /**
     * 玩家使用的语言
     */
    language: string = ''

    /**
     * 玩家定位的配置id
     */
    location: int = 0

    /**
     * 设备ID
     */
    deviceId: string = ''

    /**
     * 总颜值
     */
    appearance: int = 0

    /**
     * 头像
     */
    head: int = 0

    /**
     * 头像过期时间 #Temp
     */
    headIdExpire: int = 0

    /**
     * 玩家默认头像，到达土地后选的头像为默认头像
     */
    defaultHead: int = 0

    /**
     * 头像框ID #Temp
     */
    headFrameId: int = 0

    /**
     * 头像框过期时间 #Temp
     */
    headFrameExpire: int = 0

    /**
     * 脸
     */
    face: int = 0

    /**
     * 发型
     */
    hair: int = 0

    /**
     * 脸饰
     */
    faceDecorate: int = 0

    /**
     * 发饰
     */
    hairDecorate: int = 0

    /**
     * 玩家所属城市
     */
    city: string = ''

    /**
     * 资历
     */
    seniority: int = 0

    //#endregion

    //#region 联盟
    /**
     * 联盟Id
     */
    guild: int = 0

    /**
     * 联盟可加入的最低时间
     */
    nextCanAddGuildTime: int = 0

    /**
     * 联盟名称
     */
    guildName: string = ''

    /**
     * 联盟职位
     */
    guildRole: int = 0

    /**
     * 联盟秘法<id,lv>
     */
    @Listen(ListenGuildMFListHandler)
    guildMFList?: DiffMap<int, int>

    /**
     * 个人贡献
     */
    guildContribute: int = 0

    /**
     * 妖丹
     */
    demonPill: int = 0

    /**
     * 屏蔽玩家邀请自己加入联盟
     */
    maskInviteGuild?: DiffArray<int>

    /**
     * 上次联盟历练时间
     */
    guildMissionTime: int = 0

    /**
     * 山头boss历练次数
     */
    guildBossTimes: int = 0

    /**
     * 山头聊天chatId
     */
    guildChatId: int = 0

    /**
     * 每日联盟建设消耗数量 #Temp
     */
    dailyDonateCost: int = 0

    /**
     * 妖盟礼包-每日砍价次数 #Temp
     */
    dayBargainTimes: int = 0

    /**
     * 妖盟礼包-每日购买礼包次数 #Temp
     */
    dayGuildGiftTimes: int = 0

    /**
     * 妖盟礼包-礼包购买时的价格 #Temp
     */
    guildGiftBuyPrice: int = 0

    /**
     * 妖盟礼包-上次重置的事件 #Temp
     */
    lastRestGiftTime: int = 0

    /**
     * 妖盟礼包-是否领取差价补偿 #Temp
     */
    isCompensate: boolean = false

    /**
     * 上次山头一键提醒的时间
     */
    guildNoticeCds?: DiffMap<int, GuildNoticeItem>

    //#endregion

    //#region 战力

    /**
     * 玩家历史最高战力
     */
    maxFp: int = 0

    /**
     * 玩家战力(境界提升后)
     */
    realmUpFp: int = 0

    /**
     * 玩家历史最高战力(境界提升后)
     */
    maxRealmUpFp: int = 0

    /**
     * 各个模块评分
     */
    modFps?: DiffMap<int, ModFpBean>

    /**
     * 各模块评分(境界提升后的评分)
     */
    modRealmUpFps?: DiffMap<int, ModFpBean>

    //#endregion

    //#region 活跃数据
    /**
     * 下次每日重置时间
     */
    nextDayTime: int = 0

    /**
     * 登录天数
     */
    loginDays: int = 0

    /**
     * 七日签到-已领取的天数
     */
    signNum: int = 0

    /**
     * 七日签到-上次领取时间
     */
    signLastTime: int = 0

    /**
     *当日在线时长
     */
    onlineTime: int = 0

    /**
     * 历史总在线时长
     */
    totalOnlineTime: int = 0

    /**
     * 最近一次活跃时间
     */
    activityTime: int = 0

    /**
     * 每日首次登录时间
     */
    @OnlyRedis
    dailyFirstLoginTime: int = 0
    //#endregion

    //#region 聊天模块
    /**
     * 聊天气泡
     */
    chatFrame: int = 0

    /**
     * 上次世界、临时聊天发言时间
     * #Temp
     */
    @OnlyRedis
    chatTime: int = 0

    /**
     * 上次世界、临时聊天发言时间
     * #Temp
     */
    @OnlyRedis
    guildChatTime: int = 0

    /**
     * 上次世界、临时聊天发言时间
     * #Temp
     */
    @OnlyRedis
    crossChatTime: int = 0

    /**
     * 每日聊天次数 #Temp
     */
    @Mod
    dailyChatList?: DiffMap<int, ChatDailyItem>

    //#endregion

    //#region 通用模块
    /**
     * 引导步骤
     */
    guide?: DiffArray<int>

    /**
     * 广告观看次数
     */
    @Listen(ListenAdsMapHandler)
    ads?: DiffMap<int, AdItem>

    /**
     * 特殊的系统解锁记录
     */
    @OnlyRedis
    unlockSpecSysIds?: DiffArray<int>

    //#endregion

    //#region  VIP、充值模块
    /**
     * VIP等级
     */
    vip: int = 0

    /**
     * VIP经验
     */
    vipExp: int = 0

    /**
     * vip奖励数据(二进制)
     */
    vipAward: int = 0

    /**
     * 记录vip领取的奖励信息
     */
    vipAwards?: DiffArray<int>

    /**
     * 1 展示 0 不展示
     */
    vipIsShow: int = 1

    /**
     * 充值记录
     */
    @Mod
    pay?: DiffMap<int, PayInfoItem>

    /**
     * 累计充值
     */
    @Mod
    firstPays?: DiffMap<int, FirstPayItem>

    /**
     * 每日礼包详情
     */
    dailyGifts?: DiffMap<int, GiftBuyItem>

    /**
     * 终身礼包详情
     */
    lifeGifts?: DiffMap<int, GiftBuyItem>

    /**
     * 当前已购首充礼包id
     */
    firstGiftId: int = 0

    /**
     * 基金购买详情
     */
    funds?: DiffMap<int, FundItem>

    /**
     * 已购首充礼包id集合
     */
    firstGiftIds?: DiffArray<int>

    /**
     * 今日充值次数 #Temp
     */
    dailyPayTimes: int = 0
    //#endregion

    //#region 客户端临时存储
    /**
     * 客户端需要使用的数据
     */
    clientData: string = ''
    //#endregion

    //#region 任务

    /**
     * 限时任务活跃度宝箱领取数据 #Temp
     */
    @Mod
    limitTaskBoxes?: DiffMap<int, TaskBoxAwardItem>

    /**
     * 累积型任务数值记录（以任务类型为key）
     */
    @Mod
    taskTotal?: DiffMap<int, TaskProgress>

    /**
     * 成就领取记录
     */
    @Mod
    achieveTask?: DiffMap<int, int>

    /**
     * 成就资历奖励领取情况
     */
    achieveBadges?: DiffMap<int, int>

    /**
     * 主线章节ID
     */
    mainTaskId: int = 0

    /**
     * 主线章节任务进度
     */
    mainTaskProgress: int = 0

    /**
     * 主线任务怪剩余血量
     */
    mainTaskMonsters?: DiffMap<int, TaskMonsterItem>

    /**
     * 主线是否已达标，停止自动攻击
     */
    @OnlyRedis
    mainTaskStopAutoAtk: int = 0

    //#endregion

    //#region 红颜模块
    /**
     * 精力
     */
    wifeEnergy?: TimesBean
    //#endregion

    //#region 装备模块
    /**
     * 装备系统
     */
    @Mod
    equip!: UserEquipBean
    //#endregion

    //#region 活动相关模块
    /**
     * 万能活动
     */
    generalCash?: DiffMap<int, GeneralCashItem>

    //#endregion

    //#region 功法
    /**
     * 功法系统
     */
    gong!: UserGongBean

    /**
     * 功能预览奖励
     */
    previewIds?: DiffArray<int>
    //#endregion

    //#region 法宝
    /**
     * 法宝系统
     */
    @Mod
    weapon!: UserWeaponBean
    //#endregion

    //#region 其他模块系统
    /**
     * 属性系统
     */
    @Mod
    attr!: UserAttrBean

    /**
     * 属性果使用次数
     */
    attrPropUseTimes: int = 0

    /**
     * 是否解锁呆桃表情包
     */
    isUnlockEmoji: boolean = false

    /**
     * 看广告次数
     */
    adAwardTimes: int = 0

    /**
     * npc攻击次数
     */
    npcAtkTimes: int = 0

    /**
     * npc自动攻击过期时间
     */
    npcAutoAtkTime: int = 0

    /**
     * npc自动攻击使用的道具id
     */
    npcAutoAtkPropId: int = 0

    //#endregion

    // #region 场景战斗
    /**
     * 场景战斗设置
     */
    @Mod
    sceneFightSet!: SceneFightSet

    /**
     * 场景进入冷却时间
     */
    @Mod
    sceneCd?: DiffMap<string, SceneCdItem>

    /**
     * 战斗邀请屏蔽列表
     */
    @Mod
    sceneShields?: DiffMap<int, SceneInviteShieldItem>

    /**
     * 场景使用道具cd
     */
    sceneProps?: DiffMap<int, SceneUsePropItem>

    /**
     * 大招释放次数
     */
    skillTimes: int = 0

    /**
     * 累计恢复多少法力
     */
    skillRecoveryNum: int = 0

    /**
     * 战斗击杀记录
     */
    @OnlyRedis
    fightKills?: DiffMap<int, FightKillItem>

    /**
     * 红名值
     */
    @Listen(ListenEvilHandler)
    evil?: TimesBean

    /**
     * 已领场景个人伤害排行奖励列表
     */
    sceneAwardsRanks?: DiffArray<string>

    // #endregion

    //#region 历练
    /**
     * 历练模块
     */
    @Mod
    mission!: MissionBean
    //#endregion

    //#region 竞技场
    /**
     * 是否解锁竞技场
     */
    @OnlyRedis
    unlockArena: boolean = false

    /**
     * 是否匹配npc
     */
    @OnlyRedis
    matchNpc: boolean = false

    //#endregion

    //#region 爱心值
    //#endregion

    //#region 渡劫
    /**
     * 渡劫当前挑战是否被帮助
     */
    realmBeHelpUid?: DiffArray<int>
    //#endregion

    //#region 推箱子

    //#endregion

    //#region 时装
    /**
     * 时装ID
     */
    skinId: int = 0

    /**
     * 时装过期时间
     */
    skinExpire: int = 0
    //#endregion

    //#region 点赞

    //#endregion

    /**
     * 开捐纳红包次数
     */
    openRedTimes: int = 0

    /**
     * 开试炼红包次数
     */
    openBossRedTimes: int = 0

    /**
     * 今日发起请求协助的次数
     */
    dayPlantAskHelpTimes: int = 0

    /**
     * 上次手动刷新列表的时间
     */
    lastRefreshNearTime: int = 0

    /**
     * 上次自动动刷新列表的时间
     */
    lastAutoRefreshNearTime: int = 0

    /**
     * 今日刷新资源次数
     */
    dayRefreshBoxTimes: int = 0

    /**
     * 今日刷新列表次数
     */
    dayRefreshListTimes: int = 0

    /**
     * 称号信息
     */
    @Mod
    title!: TitleBean

    /**
     * 未领取的突破奖励
     */
    @Mod
    breakAwards?: DiffMap<int, BreakAwardItem>

    /**
     * 特权卡信息
     */
    @Mod
    tq?: DiffMap<int, TqInfoItem>

    /**
     * 邮件系统
     */
    @Mod
    mail?: MailBean

    /**
     * 背包系统
     */
    @Mod
    bag?: DiffMap<int, PropBean>

    /**
     * 时装系统
     */
    @Mod
    fashion!: UserFashionBean

    /**
     * 玩家体力
     */
    power?: TimesBean

    /**
     * 今日消耗的玩家体力数量
     */
    dayCostPower: int = 0

    /**
     * 玩家体力购买次数 [购买类型 => 购买次数]
     */
    powerBuyTimes?: DiffMap<int, PowerBuyItem>

    /**
     * 玩家封禁数据
     */
    refuse?: DiffMap<int, UserForbidBean>

    /**
     * 已经膜拜的排行榜列表<rankType,time>
     */
    worshipRankTypes?: DiffMap<string, int>

    /**
     * 红点信息
     */
    @Mod
    redDot?: DiffMap<string, RedDotBean>

    /**
     * 红点多维度信息
     */
    @Mod
    redDotList?: DiffMap<string, RedDotListBean>

    /**
     * 开关列表
     */
    @OnlyNet
    switch?: DiffArray<int>

    //#region 修炼功能
    /**
     * 斩心魔当前关卡
     */
    heartDemonChapter: int = 0

    /**
     * 修炼系统
     */
    practice!: UserPracticeBean
    //#endregion

    @OnlyRedis
    taVersion: int = 0
}
