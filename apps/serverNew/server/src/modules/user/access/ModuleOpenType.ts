/**
 * 系统ID
 */
export class ModuleOpenType {
    // #region 开关状态
    readonly STATUS_OPEN = 1 // 开启

    readonly STATUS_OFF = 2 // 关闭
    // #endregion

    // #region 系统
    /** @var int 个人修炼 */
    static readonly SYS_PRACTICE = 1

    /** @var int 多人修炼 */
    static readonly SYS_PRACTICEMULTI = 2

    /** @var int 功法 */
    static readonly SYS_GONG = 3

    /** @var int 法宝 */
    static readonly SYS_WEAPON = 4

    /** @var int 装备 */
    static readonly SYS_EQUIP = 5

    /** @var int 夔牛 */
    static readonly SYS_KUICOW = 6

    /** @var int 聊天 */
    static readonly SYS_CHAT = 7

    /** @var int 帮会 */
    static readonly SYS_GUILD = 8

    /** @var int 成就 */
    static readonly SYS_ACHIEVEMENT = 9

    /** @var int 任务 */
    static readonly SYS_TASK = 10

    /** @var int 排行榜 */
    static readonly SYS_RANK = 11

    /** @var int 好友 */
    static readonly SYS_FRIEND = 12

    /** @var int 背包 */
    static readonly SYS_BAG = 13

    /** @var int 邮件 */
    static readonly SYS_MAIL = 14

    /** @var int 个人历练 */
    static readonly SYS_MISSION = 15

    /** @var int 斩心魔 */
    static readonly SYS_HEART_DEMON = 16

    /** @var int 竞技场 */
    static readonly SYS_ARENA = 17

    /** @var int 妖盟历练 */
    static readonly SYS_GUILD_MISSION = 18

    /** @var int 炼器 */
    static readonly SYS_FORGE_POOLS = 35

    /** @var int 挂机收益 */
    static readonly SYS_OFFLINE_AWARD = 37

    /** @var int 法宝历练-两禅寺 */
    static readonly SYS_MISSION_WEAPON = 38

    /** @var int 元神历练-昆仑山 */
    static readonly SYS_MISSION_GONG = 39

    /** @var int 装备历练-东林院 */
    static readonly SYS_MISSION_EQUIP = 40

    /** @var int 跨服夔牛 */
    static readonly SYS_CROSS_KUI_COW = 43

    /** @var int 八荒历练 */
    static readonly SYS_CROSS_MISSION = 44

    /** @var int 首充礼包 */
    static readonly SYS_FIRST_GIFT = 53

    /** @var int 铭文（原器灵） */
    static readonly SYS_SOUL = 57

    /** @var int 天赋（自由加点） */
    static readonly SYS_ATTR_ADD = 58

    /** @var int 妖术 */
    static readonly SYS_SORCERY = 59

    /** @var int 个人境界 */
    static readonly SYS_REALM = 60

    /** @var int 罗刹鬼市 */
    static readonly SYS_GHOST_CITY = 64

    /** @var int 七日签到 */
    static readonly SYS_SIGN = 65

    /** @var int 山头礼包 */
    static readonly SYS_GUILD_GIFT = 75

    /** @var int 桃园 */
    static readonly SYS_PLANT = 77

    /** @var int 世界等级 */
    static readonly SYS_WORLD_LEVEL = 79

    /** @var int 山头试炼 */
    static readonly SYS_GUILD_BOSS = 80

    /** @var int 爬塔系统 */
    static readonly SYS_TOWER = 81

    /** @var int 灵脉 */
    static readonly SYS_LODE = 82

    /** @var int 拖箱子 */
    static readonly SYS_HOME = 85
    // #endregion

    // #region 数值开关-游戏配置
    readonly CONFIG_CREATE_ROLE_LIMIT = 1 // 创角上限
    // #endregion

    // #region 线路开关
    readonly LINE_GONGGAO = 1 // 登录前的公告
    // #endregion

    // 解锁后需要触发的系统及处理方法
    static unlockSysTrigger = new Map([
        [this.SYS_SOUL, 'onUnlockSoul'],
        [this.SYS_WEAPON, 'onUnlockWeapon'],
        [this.SYS_PLANT, 'onUnlockPlant'],
        [this.SYS_TOWER, 'onUnlockTower'],
        [this.SYS_OFFLINE_AWARD, 'onUnlockOfflineAward'],
        [this.SYS_HOME, 'onUnlockHome'],
        [this.SYS_LODE, 'onUnlockLode'],
        [this.SYS_ARENA, 'onUnlockArena'],
    ])

    /** 击杀后需要发送通知的系统id */
    static afterKillNoticeSystem = [this.SYS_PRACTICEMULTI, this.SYS_MISSION, this.SYS_CROSS_MISSION]
}
