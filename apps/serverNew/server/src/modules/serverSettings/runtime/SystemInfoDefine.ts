/**
 * 系统消息常量定义
 */
export class SystemInfoDefine {
    // #region 类型定义 1、世界频道 2、系统频道 3、妖盟频道 4、跑马灯 5、玩家日志（战斗流水）6、怪物日志（战斗流水）7、其他日志（战斗流水）8、弹窗 9、TIP 10、邮件（可以填数组）11.妖盟日志
    /** 世界频道 */
    static readonly TYPE_CHAT_WORLD = 1

    /** 系统频道 */
    static readonly TYPE_CHAT_SYSTEM = 2

    /** 妖盟频道 */
    static readonly TYPE_CHAT_GUILD = 3

    /** 跑马灯 */
    static readonly TYPE_LED = 4

    /** 战斗怪物流水 */
    static readonly TYPE_FIGHT_USER_LOG = 5

    /** 战斗怪物流水 */
    static readonly TYPE_FIGHT_MONSTER_LOG = 6

    /** 战斗其他流水 */
    static readonly TYPE_FIGHT_OTHER_LOG = 7

    /** 弹窗 */
    static readonly TYPE_POP = 8

    /** Tip */
    static readonly TYPE_TIP = 9

    /** 邮件 */
    static readonly TYPE_MAIL = 10

    /** 妖盟日志 */
    static readonly TYPE_GUILD_LOG = 11
    // #endregion

    // #region 系统日志ID定义，系统_事件id
    /** 您以{0}修为击败了{1}，搜获秘宝：{2} */
    static readonly UserMission_1 = 1

    /** 您以{0}修为击败了{1}，因机缘耗尽，你无法搜获秘宝。 */
    static readonly UserMission_2 = 2

    /** 您以{0}修为帮助其他修士击败了{1}，获得{2} */
    static readonly UserMission_3 = 3

    /** 您以{0}修为击败了{1}，因本日机缘耗尽，你无法搜获秘宝。 */
    static readonly UserMission_4 = 4

    /** 您一时大意，被{0}敌人{1}重创 */
    static readonly UserMission_5 = 5

    /** 您以归属者身份携手击败了{0}，搜获秘宝：{1}，归属盟会额外搜获秘宝：{2} */
    static readonly ActivityMission_6 = 6

    /** 您与{0}的道友以归属者身份携手击败了{1}，搜获秘宝：{2}，归属盟会额外搜获秘宝：{3} */
    static readonly ActivityMission_7 = 7

    /** 您以{0}修为击败{1}，因本日机缘耗尽，你无法搜获秘宝 */
    static readonly ActivityMission_8 = 8

    /** 您以{0}修为击败了{1}修士{2} */
    static readonly ActivityMission_9 = 9

    /** 您一时大意，被{0}敌人{1}重创 */
    static readonly ActivityMission_12 = 12

    /** 您以{0}修为击败了{1}修士{2}，获得了{3}的归属 */
    static readonly ActivityMission_13 = 13

    /** 您一时大意，被{0}修士{1}重创 */
    static readonly ActivityMission_14 = 14

    /** 多人修炼杀怪有奖励 */
    static readonly MultiPractice_17 = 17

    /** 多人修炼杀怪体力不足 */
    static readonly MultiPractice_18 = 18

    /** 多人修炼被怪杀死 */
    static readonly MultiPracticeUserDie_19 = 19

    /** 装备打造 */
    static readonly EquipForge_20 = 20

    /** 妖盟解散-弹窗 */
    static readonly GuildDissolution_22 = 22

    /** 被移出妖盟-邮件 */
    static readonly GuildKick_23 = 23

    /** 妖盟解散-邮件 */
    static readonly GuildDissolution_24 = 24

    /** 妖盟捐献-聊天 */
    static readonly GuildDonate_30 = 30

    /** 妖盟修改昵称-聊天 */
    static readonly GuildSetName_31 = 31

    /** 妖盟修改公告-聊天 */
    static readonly GuildSetNotice_32 = 32

    /** 妖盟任命-聊天 */
    static readonly GuildAppoint_33 = 33

    /** 妖盟成员加入-聊天 */
    static readonly GuildJoin_34 = 34

    /** 妖盟成员退出-聊天 */
    static readonly GuildQuit_35 = 35

    /** 妖盟成员被踢-聊天 */
    static readonly GuildKick_36 = 36

    /** 妖盟转让-聊天 */
    static readonly GuildTransfer_37 = 37

    /** 妖盟捐献-日志 */
    static readonly GuildDonate_40 = 40

    /** 妖盟盟主上限-聊天 */
    static readonly GuildLeaderOnLine_42 = 42

    /** 装备已满额外发放邮件 */
    static readonly EquipOverMail_43 = 43

    /** {0}通过不懈努力，将个人境界突破至{1} */
    static readonly UserRealmUp_48 = 48

    /** 在众位道友的努力下，夔牛被再次封印！ */
    static readonly KillKuiCow_51 = 51

    /** 装备打造红品质 */
    static readonly EquipForge_53 = 53

    /** 冲榜奖励补发**/
    static readonly ACTIVITY_RANK_AWARD_54 = 54

    /**竞技场每日奖励*/
    static readonly ARENA_DAILY_AWARD_61 = 61

    /**竞技场赛季奖励*/
    static readonly ARENA_SEASON_AWARD_62 = 62

    /** {0}妖缘深厚，鸿运当头，获得了稀有的彩色变异装备{1}！ */
    static readonly EquipEffect_66 = 66

    /**
     * 恭喜您所在的区服在{0}中获得第{1}]名。这是您获得的奖励，请查收！
     * 活动区服排行奖励补发邮件，{0}为活动名；{1}为玩家所在区服名次
     */
    static readonly ActivityRankCrossAward_67 = 67

    /** {0}吉星高照，鸿运当头，在罗刹鬼市中获得了{1}！*/
    static readonly GhostCity_68 = 68

    /** {0}拒绝了您的入盟申请 */
    static readonly GuildRefuse_69 = 69

    /** 重复获得{0}，已自动转化为{1} */
    static readonly PropConvert_71 = 71

    /** 个人历练-新手保护奖励 */
    static readonly MissionPickUpAwards = 72

    /** 山头历练-开始前5分钟推送 */
    static readonly GuildMissionBeforeStart = 73

    /** 山头历练-开始推送 */
    static readonly GuildMissionStart = 74

    /** 山头历练-胜利推送 */
    static readonly GuildMissionWin = 75

    /** 桃园-盟友求助 */
    static readonly PlantHelpWaterHelpGuildTip = 76

    /** 桃园-协助成功山头 */
    static readonly PlantAskHelpGuild = 78

    /** 您一时大意，被{0}敌人{1}重创，{2}耐久度-{3}，红名额外-{4} */
    static readonly UserMission_80 = 80

    /** 您一时大意，被{0}敌人{1}重创，{2}耐久度-{3} */
    static readonly UserMission_86 = 86

    /** 您以{0}修为击败了{1}修士{2}，令{3}耐久度-{4},红名额外-{5} */
    static readonly ActMission_81 = 81

    /** 您以{0}修为击败了{1}修士{2}，令{3}耐久度-{4} */
    static readonly ActMission_87 = 87

    /** 您以{0}修为击败了{1}修士{2}，获得了{3}的归属，并令{4}耐久度-{5},红名额外-{6} */
    static readonly ActMission_83 = 83

    /** 您以{0}修为击败了{1}修士{2}，获得了{3}的归属，并令{4}耐久度-{5} */
    static readonly ActMission_89 = 89

    /** 您一时大意，被{0}敌人{1}重创，{2}耐久度-{3}，红名额外-{4} */
    static readonly ActMission_82 = 82

    /** 您一时大意，被{0}敌人{1}重创，{2}耐久度-{3} */
    static readonly ActMission_88 = 88

    /** 您一时大意，被{0}修士{1}重创，{2}耐久度-{3}，红名额外-{4} */
    static readonly ActMission_84 = 84

    /** 您一时大意，被{0}敌人{1}重创，{2}耐久度-{3}，红名额外-{4} */
    static readonly MultiPracticeUserDie_85 = 85

    /** 您一时大意，被{0}修士{1}重创，{2}耐久度-{3} */
    static readonly ActMission_90 = 90

    /** 您一时大意，被{0}敌人{1}重创，{2}耐久度-{3} */
    static readonly MultiPracticeUserDie_91 = 91

    /** 成员在地图中将人击杀，且对方有所属山头，{0}山头成员{1}地图名称(等级){2}被击杀者{3}被击杀者的山头 */
    public static readonly GuildUserDie_92 = 92

    /** 成员在地图中将人击杀，且对方无所属山头，{0}山头成员{1}地图名称(等级){2}被击杀者 */
    public static readonly GuildUserDie_93 = 93

    /** 成员在地图中被人击杀，且对方有所属山头，{0}山头成员{1}地图名称(等级){2}击杀者 */
    public static readonly GuildUserDie_94 = 94

    /** 成员在地图中被人击杀，且对方无所属山头，{0}山头成员{1}地图名称(等级){2}击杀者 */
    public static readonly GuildUserDie_95 = 95

    /** 山头获得夔牛归属，{0}本次夔牛的第一归属人名称 */
    public static readonly KuiCowKilled_96 = 96

    /** 夔牛被击败，且第一归属者无山头，{0}第一归属者 */
    static readonly KuiCowKilled_97 = 97

    /** {0}领取了[color=#fb6400]{1}[/color] */
    static readonly GuildRedChatMsg_99 = 99

    /** {0}已被领完，{1}[color=#ff2b49]手气最佳[/color] */
    static readonly GuildRedBest_100 = 100

    /** 功绩红包已发送至山头 */
    static readonly GuildRedSuccess_101 = 101

    /** 以下您未及时领取的山头奖励，请注意查收：*/
    static readonly GuildBossMail_112 = 112

    /** {0} 今日还没有发放功绩红包哦~ */
    static readonly GuildRedNotce_113 = 113

    /** {0} 今日还没有参与山头试炼哦~ */
    static readonly GuildBossNotice_114 = 114

    /** {0} 今日还没有进行夕夕狸砍价哦~ */
    static readonly GuildBargainNotice_115 = 115

    /** 山头卡片，山头升级，{0}山头升级后的等级 */
    static readonly GuildLvUp_116 = 116

    /** 山头卡片，夕夕狸小铺被砍至0元 */
    static readonly GuildBargain_117 = 117

    /** 山头卡片，活动获得第1名，{0}活动名称 */
    static readonly GuildGongRankOne_118 = 118

    /** 山头试炼已结束\n今日无人参与 */
    static readonly GuildCard_119 = 119

    /** 山头试炼已结束\n今日无人参与 */
    static readonly GuildCard_121 = 121

    /** 爬塔助战成功 */
    static readonly TowerHelpSuccess_122 = 122

    /** 爬塔助战成功 */
    static readonly TowerHelpFailure_123 = 123

    /** 爬塔助战日志 */
    static readonly TowerHelpFightSuccessLog_124 = 124

    /** 爬塔助战日志 */
    static readonly TowerHelpFightFailureLog_125 = 125

    /** 爬塔挑战日志 */
    static readonly TowerFightSuccessLog_131 = 131

    /** 爬塔挑战日志 */
    static readonly TowerFightFailureLog_132 = 132

    /** 个人历练排名补发奖励 */
    static readonly MissionRankAwards_134 = 134

    /** 府库玩法中，本人采集本人场景中成功时的日志文本。{0}为资源等级+名称，{1}为资源数量+资源名称 */
    static readonly HomeCollectSuccess = 135

    /** 府库玩法中，他人采集本人场景中成功时的日志文本。{0}为资源等级+名称，{1}为资源数量+资源名称 */
    static readonly HomeRobSuccess = 136

    /** 渡劫协助成功 */
    static readonly REALM_HELP_SUCCESS_139 = 139

    /** 渡劫协助失败 */
    static readonly REALM_HELP_FAIL_140 = 140

    /** {0}玩家名 */
    static readonly LIKE_BARRAGE_141 = 141

    /** {0} 玩家信息 {1} 榜单名称 */
    static readonly LIKE_TIP_142 = 142

    /** 世界boss解锁时播放 */
    static readonly WORLD_LEVEL_BOSS_UNLOCK = 143

    /** 世界boss击杀时播放 众妖齐心协力，成功击败世界首领[color=#a4fd77]{0}[/color]！ */
    static readonly WORLD_LEVEL_BOSS_BE_KILLED = 144

    /**  您的月卡已到期，未领取的桃园体力将通过邮件补发，请查收*/
    static readonly TQ_EXPIRE_PLANT = 145

    /**  节日活动将通过邮件补发，请查收*/
    static readonly ACTIVITY_FESTIVAL_AWARDS_MAIL_151 = 151

    /**  节日活动抽奖跑马的*/
    static readonly ACTIVITY_FESTIVAL_DRAW_152 = 152
    // #endregion

    // #region 系统信息参数类型定义
    // 参数的基本结构为[paramType, value]
    /** 直接替换value */
    static readonly PARAM_DEFAULT = 0

    /** value是怪物ID，需要取怪物名字 */
    static readonly PARAM_MONSTER = 1

    /** value是json奖励列表 */
    static readonly PARAM_AWARDS = 2

    /** value是扣除的道具ID和数量 */
    static readonly PARAM_COST = 3

    /** value是境界等级 */
    static readonly PARAM_REALM = 4

    /** value是装备名称 */
    static readonly PARAM_EQUIP_CID = 5

    /** value是职位名称 */
    static readonly PARAM_ROLE_ID = 6

    /** value是活动名，需要去list表转换 */
    static readonly PARAM_ACTIVITY_NAME = 7

    /** value是道具名，需要读item表转换 */
    static readonly PARAM_ITEM_NAME = 8

    /** value是奖励，需要展示道具icon */
    static readonly PARAM_ITEM_AWARD_ICON = 9

    /** value是穿戴装备信息 */
    static readonly PARAM_WEAR_EQUIPS = 10

    /** value是装备唯一ID */
    static readonly PARAM_EQUIP_ID = 11

    /** value是装备显示效果值 */
    static readonly PARAM_EQUIP_SHOW_VALUE = 12

    /** value是uId列表，需要转成玩家@名称 */
    static readonly PARAM_AT_NAMES = 13

    /** value是领取红包的玩家昵称 */
    static readonly PARAM_RED_OPEN_NAME = 14

    /** value是排行榜名称（rankName|rankCloseTime），需要读activity_rank */
    static readonly PARAM_RANK_NAME = 15

    /** value是tow_box的配表id */
    static readonly PARAM_HOME_CID = 16

    /** value是玩家信息 */
    static readonly PARAM_HOME_UINFO = 17

    /** value是玩家id */
    static readonly PARAM_USER_ID = 18

    // eg. 1,'您以[0]修为击败了[1]，搜获秘宝：[2]'
    // 存储参数的逻辑为[[4, 10], [1, 100101], [2, "奖励的json结构"]]
    // #endregion
}
