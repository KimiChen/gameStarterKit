import { GuildNoticeItem } from '../guild/GuildNoticeItem'
import { ModFpBean } from '../user/ModFpBean'
import { ChatDailyItem } from '../chat/ChatDailyItem'
import { AdItem } from '../ads/AdItem'
import { PayInfoItem } from '../pay/PayInfoItem'
import { FirstPayItem } from '../pay/FirstPayItem'
import { GiftBuyItem } from '../pay/GiftBuyItem'
import { FundItem } from '../pay/FundItem'
import { TaskBoxAwardItem } from '../task/TaskBoxAwardItem'
import { TaskProgress } from '../task/TaskProgress'
import { TaskMonsterItem } from '../task/TaskMonsterItem'
import { TimesBean } from '../user/TimesBean'
import { UserEquipBean } from '../equip/UserEquipBean'
import { GeneralCashItem } from '../activity/GeneralCashItem'
import { UserGongBean } from '../gong/UserGongBean'
import { UserWeaponBean } from '../weapon/UserWeaponBean'
import { UserAttrBean } from '../user/UserAttrBean'
import { SceneFightSet } from '../scene/SceneFightSet'
import { SceneCdItem } from '../scene/SceneCdItem'
import { SceneInviteShieldItem } from '../scene/SceneInviteShieldItem'
import { SceneUsePropItem } from '../scene/SceneUsePropItem'
import { FightKillItem } from '../scene/FightKillItem'
import { MissionBean } from '../mission/MissionBean'
import { TitleBean } from '../title/TitleBean'
import { BreakAwardItem } from '../equip/BreakAwardItem'
import { TqInfoItem } from '../pay/TqInfoItem'
import { MailBean } from '../mail/MailBean'
import { PropBean } from '../props/PropBean'
import { UserFashionBean } from '../equip/UserFashionBean'
import { PowerBuyItem } from '../user/PowerBuyItem'
import { UserForbidBean } from '../user/UserForbidBean'
import { RedDotBean } from '../reddot/RedDotBean'
import { RedDotListBean } from '../reddot/RedDotListBean'
import { UserPracticeBean } from '../practice/UserPracticeBean'

export interface User {
    /**
     * 玩家Id
     */
    id: int
    /**
     * 区服Id
     */
    sId: int
    /**
     * 注册渠道ID
     */
    spid: string
    /**
     * 注册ID
     */
    openid: string
    /**
     * 注册时间
     */
    initTime: int
    /**
     * 是否已引导完创角
     */
    initRole: boolean
    /**
     * 第三方小游戏id
     */
    lineOpenId: string
    /**
     * 昵称
     */
    name: string
    /**
     * 上次改名时间
     */
    lastChangeNameTime: int
    /**
     * 玩家形象
     */
    playerImage: int
    /**
     * 等级
     */
    lv: int
    /**
     * 经验
     */
    exp: int
    /**
     * 玩家战力
     */
    fp: int
    /**
     * 境界等级
     */
    realm: int
    /**
     * 当前穿戴境界时装ID
     */
    realmImageId: int
    /**
     * 种族
     */
    race: int
    /**
     * 性别
     */
    sex: int
    /**
     * 灵气
     */
    sc: number
    /**
     * 仙玉
     */
    gc: number
    /**
     * 玩家使用的语言
     */
    language: string
    /**
     * 玩家定位的配置id
     */
    location: int
    /**
     * 设备ID
     */
    deviceId: string
    /**
     * 总颜值
     */
    appearance: int
    /**
     * 头像
     */
    head: int
    /**
     * 头像过期时间 #Temp
     */
    headIdExpire: int
    /**
     * 玩家默认头像，到达土地后选的头像为默认头像
     */
    defaultHead: int
    /**
     * 头像框ID #Temp
     */
    headFrameId: int
    /**
     * 头像框过期时间 #Temp
     */
    headFrameExpire: int
    /**
     * 脸
     */
    face: int
    /**
     * 发型
     */
    hair: int
    /**
     * 脸饰
     */
    faceDecorate: int
    /**
     * 发饰
     */
    hairDecorate: int
    /**
     * 玩家所属城市
     */
    city: string
    /**
     * 资历
     */
    seniority: int
    /**
     * 联盟Id
     */
    guild: int
    /**
     * 联盟可加入的最低时间
     */
    nextCanAddGuildTime: int
    /**
     * 联盟名称
     */
    guildName: string
    /**
     * 联盟职位
     */
    guildRole: int
    /**
     * 联盟秘法<id,lv>
     */
    guildMFList?: Map<int, int>
    /**
     * 个人贡献
     */
    guildContribute: int
    /**
     * 妖丹
     */
    demonPill: int
    /**
     * 屏蔽玩家邀请自己加入联盟
     */
    maskInviteGuild?: int[]
    /**
     * 上次联盟历练时间
     */
    guildMissionTime: int
    /**
     * 山头boss历练次数
     */
    guildBossTimes: int
    /**
     * 山头聊天chatId
     */
    guildChatId: int
    /**
     * 每日联盟建设消耗数量 #Temp
     */
    dailyDonateCost: int
    /**
     * 妖盟礼包-每日砍价次数 #Temp
     */
    dayBargainTimes: int
    /**
     * 妖盟礼包-每日购买礼包次数 #Temp
     */
    dayGuildGiftTimes: int
    /**
     * 妖盟礼包-礼包购买时的价格 #Temp
     */
    guildGiftBuyPrice: int
    /**
     * 妖盟礼包-上次重置的事件 #Temp
     */
    lastRestGiftTime: int
    /**
     * 妖盟礼包-是否领取差价补偿 #Temp
     */
    isCompensate: boolean
    /**
     * 上次山头一键提醒的时间
     */
    guildNoticeCds?: Map<int, GuildNoticeItem>
    /**
     * 玩家历史最高战力
     */
    maxFp: int
    /**
     * 玩家战力(境界提升后)
     */
    realmUpFp: int
    /**
     * 玩家历史最高战力(境界提升后)
     */
    maxRealmUpFp: int
    /**
     * 各个模块评分
     */
    modFps?: Map<int, ModFpBean>
    /**
     * 各模块评分(境界提升后的评分)
     */
    modRealmUpFps?: Map<int, ModFpBean>
    /**
     * 下次每日重置时间
     */
    nextDayTime: int
    /**
     * 登录天数
     */
    loginDays: int
    /**
     * 七日签到-已领取的天数
     */
    signNum: int
    /**
     * 七日签到-上次领取时间
     */
    signLastTime: int
    /**
     * 当日在线时长
     */
    onlineTime: int
    /**
     * 历史总在线时长
     */
    totalOnlineTime: int
    /**
     * 最近一次活跃时间
     */
    activityTime: int
    /**
     * 每日首次登录时间
     */
    dailyFirstLoginTime: int
    /**
     * 聊天气泡
     */
    chatFrame: int
    /**
     * 上次世界、临时聊天发言时间
     *       #Temp
     */
    chatTime: int
    /**
     * 上次世界、临时聊天发言时间
     *       #Temp
     */
    guildChatTime: int
    /**
     * 上次世界、临时聊天发言时间
     *       #Temp
     */
    crossChatTime: int
    /**
     * 引导步骤
     */
    guide?: int[]
    /**
     * 广告观看次数
     */
    ads?: Map<int, AdItem>
    /**
     * 特殊的系统解锁记录
     */
    unlockSpecSysIds?: int[]
    /**
     * VIP等级
     */
    vip: int
    /**
     * VIP经验
     */
    vipExp: int
    /**
     * vip奖励数据(二进制)
     */
    vipAward: int
    /**
     * 记录vip领取的奖励信息
     */
    vipAwards?: int[]
    /**
     * 1 展示 0 不展示
     */
    vipIsShow: int
    /**
     * 每日礼包详情
     */
    dailyGifts?: Map<int, GiftBuyItem>
    /**
     * 终身礼包详情
     */
    lifeGifts?: Map<int, GiftBuyItem>
    /**
     * 当前已购首充礼包id
     */
    firstGiftId: int
    /**
     * 基金购买详情
     */
    funds?: Map<int, FundItem>
    /**
     * 已购首充礼包id集合
     */
    firstGiftIds?: int[]
    /**
     * 今日充值次数 #Temp
     */
    dailyPayTimes: int
    /**
     * 客户端需要使用的数据
     */
    clientData: string
    /**
     * 成就资历奖励领取情况
     */
    achieveBadges?: Map<int, int>
    /**
     * 主线章节ID
     */
    mainTaskId: int
    /**
     * 主线章节任务进度
     */
    mainTaskProgress: int
    /**
     * 主线任务怪剩余血量
     */
    mainTaskMonsters?: Map<int, TaskMonsterItem>
    /**
     * 主线是否已达标，停止自动攻击
     */
    mainTaskStopAutoAtk: int
    /**
     * 精力
     */
    wifeEnergy?: TimesBean
    /**
     * 万能活动
     */
    generalCash?: Map<int, GeneralCashItem>
    /**
     * 功法系统
     */
    gong: UserGongBean
    /**
     * 功能预览奖励
     */
    previewIds?: int[]
    /**
     * 属性果使用次数
     */
    attrPropUseTimes: int
    /**
     * 是否解锁呆桃表情包
     */
    isUnlockEmoji: boolean
    /**
     * 看广告次数
     */
    adAwardTimes: int
    /**
     * npc攻击次数
     */
    npcAtkTimes: int
    /**
     * npc自动攻击过期时间
     */
    npcAutoAtkTime: int
    /**
     * npc自动攻击使用的道具id
     */
    npcAutoAtkPropId: int
    /**
     * 场景使用道具cd
     */
    sceneProps?: Map<int, SceneUsePropItem>
    /**
     * 大招释放次数
     */
    skillTimes: int
    /**
     * 累计恢复多少法力
     */
    skillRecoveryNum: int
    /**
     * 战斗击杀记录
     */
    fightKills?: Map<int, FightKillItem>
    /**
     * 红名值
     */
    evil?: TimesBean
    /**
     * 已领场景个人伤害排行奖励列表
     */
    sceneAwardsRanks?: string[]
    /**
     * 是否解锁竞技场
     */
    unlockArena: boolean
    /**
     * 是否匹配npc
     */
    matchNpc: boolean
    /**
     * 渡劫当前挑战是否被帮助
     */
    realmBeHelpUid?: int[]
    /**
     * 时装ID
     */
    skinId: int
    /**
     * 时装过期时间
     */
    skinExpire: int
    /**
     * 开捐纳红包次数
     */
    openRedTimes: int
    /**
     * 开试炼红包次数
     */
    openBossRedTimes: int
    /**
     * 今日发起请求协助的次数
     */
    dayPlantAskHelpTimes: int
    /**
     * 上次手动刷新列表的时间
     */
    lastRefreshNearTime: int
    /**
     * 上次自动动刷新列表的时间
     */
    lastAutoRefreshNearTime: int
    /**
     * 今日刷新资源次数
     */
    dayRefreshBoxTimes: int
    /**
     * 今日刷新列表次数
     */
    dayRefreshListTimes: int
    /**
     * 玩家体力
     */
    power?: TimesBean
    /**
     * 今日消耗的玩家体力数量
     */
    dayCostPower: int
    /**
     * 玩家体力购买次数 [购买类型 => 购买次数]
     */
    powerBuyTimes?: Map<int, PowerBuyItem>
    /**
     * 玩家封禁数据
     */
    refuse?: Map<int, UserForbidBean>
    /**
     * 已经膜拜的排行榜列表<rankType,time>
     */
    worshipRankTypes?: Map<string, int>
    /**
     * 开关列表
     */
    switch?: int[]
    /**
     * 斩心魔当前关卡
     */
    heartDemonChapter: int
    /**
     * 修炼系统
     */
    practice: UserPracticeBean

    taVersion: int
    /**
     * 铜币
     */
    copper: int
    /**
     * 铜币上次结算时间；仅服务端持久化，不下发客户端
     */
    lastCopperIncomeTime: int
    /**
     * 已算好但尚未领取的离线铜币。
     *
     *       登录时由 `CopperIncome.parkOffline` 暂存在这里，等客户端请求领取才进 `copper`
     *       （离线收益不再在登录时自动到账）。断线前没领走的那笔会在下次登录时累加，不会丢。
     */
    offlineCopperPending: int
    /**
     * 上面那笔离线收益对应的离线秒数；同样只在领取时清零，供弹窗展示
     */
    offlineCopperSecondsPending: int
    /**
     * 已招募英雄；只由 heroRecruit 域读取和写入，不进入通用 User 同步面。
     */
    recruitedHeroIds?: int[]
}
