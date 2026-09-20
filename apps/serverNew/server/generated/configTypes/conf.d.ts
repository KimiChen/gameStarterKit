// #region achievement.json
interface IConfAchievementAwards {
    /** 序号 */
    readonly sort: int
    /** 道具id */
    readonly propId: int
    /** 奖励 */
    readonly num: int
}
interface IConfAchievementMore {
    /** 序号 */
    readonly sort: int
    /** id */
    readonly id: int
    /** 阶段图标(1铜牌2银牌3金牌) */
    readonly stageIcon: int
    /** 组id */
    readonly groupId: int
    /** 标题 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 调用任务类型表的id */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
    /** 资历点 */
    readonly point: int
    /** 奖励 */
    readonly awards: IConfAchievementAwards[]
}
interface IConfAchievement {
    /** id */
    readonly id: int
    /** 类型名称 */
    readonly typeName: string
    /** 成就图标 */
    readonly icon: int
    /** 更多内容 */
    readonly more: ConfigReadonlyMap<int, IConfAchievementMore>
}
declare type ConfKeyAchievement = int
// #endregion achievement.json

// #region achievement_award.json
interface IConfAchievement_awardAwards {
    /** id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 奖励 */
    readonly num: int
}
interface IConfAchievement_award {
    /** id */
    readonly id: int
    /** 成就奖励描述 */
    readonly desc: string
    /** 需要资历点数 */
    readonly need: int
    /** 奖励 */
    readonly awards: IConfAchievement_awardAwards[]
}
declare type ConfKeyAchievement_award = int
// #endregion achievement_award.json

// #region achievement_label.json
interface IConfAchievement_labelNeed {
    /** id */
    readonly id: int
    /** 达成对于成就表的sort的id */
    readonly achievementSortId: int
}
interface IConfAchievement_label {
    /** id */
    readonly id: int
    /** 资源图标底色 */
    readonly icon: int
    /** 标签文字 */
    readonly name: string
    /** 标签文字占据的格子数 */
    readonly value: int
    /** 完成成就标签需要的成就id */
    readonly need: IConfAchievement_labelNeed[]
}
declare type ConfKeyAchievement_label = int
// #endregion achievement_label.json

// #region achievement_label_open.json
interface IConfAchievement_label_open {
    /** 成就标签栏目数 */
    readonly id: int
    /** 需要资历点数 */
    readonly need: int
}
declare type ConfKeyAchievement_label_open = int
// #endregion achievement_label_open.json

// #region achievement_medal.json
interface IConfAchievement_medal {
    /** id */
    readonly id: int
    /** 品质 */
    readonly quality: int
    /** 资源图标 */
    readonly icon: int
    /** 勋章星数 */
    readonly star: int
    /** 勋章名称 */
    readonly name: string
    /** 勋章描述 */
    readonly desc: string
    /** 需要资历点数 */
    readonly need: int
}
declare type ConfKeyAchievement_medal = int
// #endregion achievement_medal.json

// #region activity_cross_mission.json
interface IConfActivity_cross_missionAward1 {
    /** rankId */
    readonly rankId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfActivity_cross_missionAward2 {
    /** rankId */
    readonly rankId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfActivity_cross_missionCrossRank {
    /** crossRankId */
    readonly id: int
    /** 活动名 */
    readonly activityName: string
    /** 名次 */
    readonly rank: any
    /** 奖励 */
    readonly crossRankAward: IConfActivity_cross_missionCrossRankAward[]
}
interface IConfActivity_cross_missionCrossRankAward {
    /** crossRankId */
    readonly crossRankId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfActivity_cross_mission {
    /** 活动名 */
    readonly activityName: string
    /** 活动中文名 */
    readonly name: string
    /** 类型1装备历练2元神历练3法宝历练 */
    readonly type: int
    /** 排名阶段 */
    readonly rank: ConfigReadonlyMap<int, IConfActivity_cross_missionRank>
    /** 礼包 */
    readonly gifts: ConfigReadonlyMap<int, IConfActivity_cross_missionGifts>
    /** 区服排名 */
    readonly crossRank: ConfigReadonlyMap<int, IConfActivity_cross_missionCrossRank>
}
interface IConfActivity_cross_missionGifts {
    /** giftId */
    readonly giftId: int
    /** 活动名 */
    readonly activityName: string
    /** 礼包图标 */
    readonly icon: int
    /** 排序 */
    readonly sort: int
    /** 礼包详情 */
    readonly detail?: string
    /** 限购类型(0不限购1总计2每日) */
    readonly limitType: int
}
interface IConfActivity_cross_missionRank {
    /** rankId */
    readonly rankId: int
    /** 活动名 */
    readonly activityName: string
    /** 名次 */
    readonly rank: any
    /** 个人榜=个人奖励
（联盟榜=成员奖励） */
    readonly award1: IConfActivity_cross_missionAward1[]
    /** 个人榜=留空
（联盟榜=盟主奖励） */
    readonly award2: IConfActivity_cross_missionAward2[]
}
declare type ConfKeyActivity_cross_mission = string
// #endregion activity_cross_mission.json

// #region activity_gift.json
interface IConfActivity_gift {
    /** 活动名 */
    readonly activityName: string
    /** 活动中文名 */
    readonly name: string
    /** 礼包 */
    readonly gifts: ConfigReadonlyMap<int, IConfActivity_giftGifts>
}
interface IConfActivity_giftGifts {
    /** giftId */
    readonly giftId: int
    /** 活动名 */
    readonly activityName: string
    /** 图标 */
    readonly icon: int
    /** 排序 */
    readonly sort: int
    /** 开始时间 */
    readonly startTime: int
    /** 结束时间 */
    readonly endTime: int
    /** 限购类型(0不限购，1活动期间总限购，2活动期间每日限购) */
    readonly limitType: int
    /** 礼包详情 */
    readonly detail?: string
}
declare type ConfKeyActivity_gift = string
// #endregion activity_gift.json

// #region activity_rank.json
interface IConfActivity_rankAward1 {
    /** rankId */
    readonly rankId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfActivity_rankAward2 {
    /** rankId */
    readonly rankId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfActivity_rank {
    /** 活动名 */
    readonly activityName: string
    /** 活动中文名 */
    readonly name: string
    /** 填写双倍掉落卡id，不填或填-1则不生效 */
    readonly doubleDrop: int
    /** 限时任务 */
    readonly task: ConfigReadonlyMap<int, IConfActivity_rankTask>
    /** 排名阶段 */
    readonly rank: ConfigReadonlyMap<int, IConfActivity_rankRank>
    /** 礼包 */
    readonly gifts: ConfigReadonlyMap<int, IConfActivity_rankGifts>
}
interface IConfActivity_rankGifts {
    /** giftId */
    readonly giftId: int
    /** 活动名 */
    readonly activityName: string
    /** 礼包图标 */
    readonly icon: int
    /** 排序 */
    readonly sort: int
    /** 限购类型(0不限购，1活动期间总计，2每日) */
    readonly limitType: int
    /** 礼包详情 */
    readonly detail?: string
}
interface IConfActivity_rankRank {
    /** rankId */
    readonly rankId: int
    /** 活动名 */
    readonly activityName: string
    /** 名次 */
    readonly rank: any
    /** 个人榜=个人奖励
（联盟榜=成员奖励） */
    readonly award1: IConfActivity_rankAward1[]
    /** 个人榜=留空
（联盟榜=盟主奖励） */
    readonly award2: IConfActivity_rankAward2[]
}
interface IConfActivity_rankTask {
    /** taskId */
    readonly taskId: int
    /** 活动名 */
    readonly activityName: string
    /** 记录类型：1活动期间，2每日 */
    readonly recordType: int
    /** 任务类型 */
    readonly taskType: int
    /** 条件1 */
    readonly param1: int
    /** 条件2 */
    readonly param2: int
    /** 任务目标值 */
    readonly value: int
    /** 任务奖励 */
    readonly taskAward: IConfActivity_rankTaskAward[]
    /** 任务奖励 */
    readonly taskDesc: ConfigReadonlyMap<int, IConfActivity_rankTaskDesc>
}
interface IConfActivity_rankTaskAward {
    /** taskId */
    readonly taskId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfActivity_rankTaskDesc {
    /** taskId */
    readonly taskId: int
    /** 语言 */
    readonly lang: string
    /** 任务名称 */
    readonly name: string
    /** 任务描述 */
    readonly desc: string
}
declare type ConfKeyActivity_rank = string
// #endregion activity_rank.json

// #region ads_awards.json
interface IConfAds_awards {
    /** 广告id */
    readonly id: int
    /** 备注 */
    readonly desc: string
    /** 每日次数 */
    readonly times: int
    /** 观看冷却时间 */
    readonly cd: int
    /** 获得挂机收益（秒） */
    readonly practiceTime: int
    /** 奖励 */
    readonly awards: IConfAds_awardsAwards[]
    /** 解锁条件 */
    readonly required: IConfAds_awardsRequired[]
}
interface IConfAds_awardsAwards {
    /** 广告id */
    readonly id: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfAds_awardsRequired {
    /** id */
    readonly id: int
    /** 调用任务类型表的id */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
}
declare type ConfKeyAds_awards = int
// #endregion ads_awards.json

// #region arena_prestige.json
interface IConfArena_prestigeDefeatRewards {
    /** id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfArena_prestigeWinRewards {
    /** id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfArena_prestige {
    /** 序号 */
    readonly id: int
    /** 区间 */
    readonly range: any
    /** 进攻方胜利声望 */
    readonly atkPrestigewin: int
    /** 防守方胜利声望 */
    readonly defPrestigewin: int
    /** 进攻方失败声望 */
    readonly atkPrestigedefeat: int
    /** 防守方失败声望 */
    readonly defPrestigedefeat: int
    /** 单次获得积分 */
    readonly score: int
    /** 怪物表取属性 */
    readonly npcId: int
    /** 奖励 */
    readonly winRewards: IConfArena_prestigeWinRewards[]
    /** 失败奖励 */
    readonly defeatRewards: IConfArena_prestigeDefeatRewards[]
    /** 声望赛季结束衰减值 */
    readonly seasonReduce: int
    /** 高分机器人属性（万分比） */
    readonly greatRobot: int
    /** 普通分机器人属性 */
    readonly Robot: int
    /** 普通分机器人属性 */
    readonly lowRobot: int
}
declare type ConfKeyArena_prestige = int
// #endregion arena_prestige.json

// #region arena_rank_daily.json
interface IConfArena_rank_dailyAwards {
    /** 排名id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfArena_rank_daily {
    /** 序号 */
    readonly id: int
    /** 名次区间 */
    readonly rank: any
    /** 奖励 */
    readonly awards: IConfArena_rank_dailyAwards[]
}
declare type ConfKeyArena_rank_daily = int
// #endregion arena_rank_daily.json

// #region arena_rank_season.json
interface IConfArena_rank_seasonAwards {
    /** 排名id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfArena_rank_season {
    /** 序号 */
    readonly id: int
    /** 名次区间 */
    readonly rank: any
    /** 奖励 */
    readonly awards: IConfArena_rank_seasonAwards[]
}
declare type ConfKeyArena_rank_season = int
// #endregion arena_rank_season.json

// #region arena_ratio.json
interface IConfArena_ratio {
    /** 1.声望连胜系数
2.天梯分连胜系数
3.天梯分战力逆差系数(对手/自身)
4.天梯分境界逆差系数 (对手-自身) */
    readonly type: int
    /** 更多内容 */
    readonly more: IConfArena_ratioMore[]
}
interface IConfArena_ratioMore {
    /** 序号 */
    readonly id: int
    /** 区间最小值 */
    readonly min: int
    /** 区间最大值 */
    readonly max: int
    /** 类型 */
    readonly type: int
    /** 系数万分比 */
    readonly ratio: int
}
declare type ConfKeyArena_ratio = int
// #endregion arena_ratio.json

// #region attr.json
interface IConfAttr {
    /** 序号 */
    readonly id: int
    /** 字段名 */
    readonly fieldName: string
    /** 0固定值
1比率 */
    readonly isRate: int
    /** 属性名称 */
    readonly name: string
    /** 属性描述 */
    readonly attrTips: string
    /** 属性值描述 */
    readonly valueTip?: string
    /** 属性值占位符 */
    readonly valueFormat?: string
}
declare type ConfKeyAttr = int
// #endregion attr.json

// #region audio.json
interface IConfAudio {
    /** id */
    readonly id: string
    /** 说明(可以不用读) */
    readonly explain?: string
    /** 路径名 */
    readonly audios: IConfAudioRoute[]
}
interface IConfAudioRoute {
    /** 音频id */
    readonly id: string
    /** 路径名 */
    readonly route: string
    /** 权重（0-1000） */
    readonly weight: number
    /** 最大播放数量 */
    readonly maxCnt: number
}
declare type ConfKeyAudio = string
// #endregion audio.json

// #region audio_skill.json
interface IConfAudio_skill {
    /** 特效命名 */
    readonly name: string
    /** 不同类型播放不同音效 */
    readonly data: IConfAudio_skillData[]
}
interface IConfAudio_skillData {
    /** id */
    readonly name: string
    /** 音频播放类型
0生成立刻播放
1只有我攻击或者我受击播放
2只有非玩家(怪物、boss等)播放 */
    readonly type: int
    /** audio表的id */
    readonly id: string
}
declare type ConfKeyAudio_skill = string
// #endregion audio_skill.json

// #region congratulation.json
interface IConfCongratulation {
    /** id */
    readonly id: int
    /** 祝福文本 */
    readonly tips: string
}
declare type ConfKeyCongratulation = int
// #endregion congratulation.json

// #region cross_kui_cow.json
interface IConfCross_kui_cowAwards1 {
    /** 怪物等级 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfCross_kui_cowAwards2 {
    /** 怪物等级 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfCross_kui_cowAwards3 {
    /** 怪物等级 */
    readonly id: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfCross_kui_cowAwards4 {
    /** 怪物等级 */
    readonly id: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfCross_kui_cowShowAwards {
    /** 怪物等级 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
    /** 1=非归属数量(排序排第4),2=非归属概率(排序排第2),3=归属数量(排序排第3),4=归属概率(排序排第1) */
    readonly special: int
}
interface IConfCross_kui_cow {
    /** 怪物等级 */
    readonly id: int
    /** 怪物id */
    readonly monsterId: int
    /** 场景重进cd */
    readonly cd: int
    /** 弃用（怪物技能ID） */
    readonly skillId: any
    /** 固定掉落，获得者：非归属玩家和归属玩家 */
    readonly awards1: IConfCross_kui_cowAwards1[]
    /** 归属额外掉落，获得者：归属玩家 */
    readonly awards2: IConfCross_kui_cowAwards2[]
    /** 非归属概率掉落，获得者：非归属玩家 */
    readonly awards3: IConfCross_kui_cowAwards3[]
    /** 归属概率掉落，获得者：归属玩家 */
    readonly awards4: IConfCross_kui_cowAwards4[]
    /** 展示掉落 */
    readonly showAwards: IConfCross_kui_cowShowAwards[]
}
declare type ConfKeyCross_kui_cow = int
// #endregion cross_kui_cow.json

// #region cross_mission.json
interface IConfCross_missionAwards1 {
    /** 序号 */
    readonly sort: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfCross_missionAwards2 {
    /** 序号 */
    readonly sort: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfCross_missionAwards3 {
    /** 序号 */
    readonly sort: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfCross_missionExAwards {
    /** 序号 */
    readonly sort: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfCross_missionMore {
    /** 序号 */
    readonly sort: int
    /** 进入等级 */
    readonly lv: int
    /** 类型1装备历练2功法历练3法宝历练 */
    readonly id: int
    /** 怪物id */
    readonly monsterId: int
    /** 场景重进cd */
    readonly cd: int
    /** 固定掉落 */
    readonly awards1: IConfCross_missionAwards1[]
    /** 概率掉落道具 */
    readonly awards2: IConfCross_missionAwards2[]
    /** 随机装备 */
    readonly awards3: IConfCross_missionAwards3[]
    /** 归属者额外随机装备 */
    readonly exAwards: IConfCross_missionExAwards[]
    /** 展示掉落 */
    readonly showAwards: IConfCross_missionShowAwards[]
    /** 气泡文本 */
    readonly talk: ConfigReadonlyMap<int, IConfCross_missionTalk>
    /** 重置时间(HH:MM:SS,HH:MM:SS,) */
    readonly resetTime: string
}
interface IConfCross_missionShowAwards {
    /** 序号 */
    readonly sort: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
    /** 1=非归属数量(排序排第4),2=非归属概率(排序排第2),3=归属数量(排序排第3),4=归属概率(排序排第1) */
    readonly special: int
}
interface IConfCross_missionTalk {
    /** 序号 */
    readonly sort: int
    /** 怪物id */
    readonly monsterId: int
    /** 语言文本1 */
    readonly desc1: string
    /** 语言文本2 */
    readonly desc2: string
}
interface IConfCross_missionTask {
    /** taskId */
    readonly taskId: int
    /** 类型1装备历练2功法历练3法宝历练 */
    readonly id: int
    /** 记录类型：1活动期间，2每日 */
    readonly recordType: int
    /** 任务类型 */
    readonly taskType: int
    /** 条件1 */
    readonly param1: int
    /** 条件2 */
    readonly param2: int
    /** 任务目标值 */
    readonly value: int
    /** 任务奖励 */
    readonly taskAward: ConfigReadonlyMap<int, IConfCross_missionTaskAward>
    /** 任务奖励 */
    readonly taskDesc: ConfigReadonlyMap<int, IConfCross_missionTaskDesc>
}
interface IConfCross_missionTaskAward {
    /** taskId */
    readonly taskId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfCross_missionTaskDesc {
    /** taskId */
    readonly taskId: int
    /** 语言 */
    readonly lang: string
    /** 任务名称 */
    readonly name: string
    /** 任务描述 */
    readonly desc: string
}
interface IConfCross_mission {
    /** 类型1装备历练2元神历练3法宝历练 */
    readonly id: int
    /** 地图ID */
    readonly mapId: int
    /** 地图资源 */
    readonly mapRes: int
    /** 活动名称 */
    readonly name: string
    /** 活动描述 */
    readonly desc: string
    /** 详细内容 */
    readonly more: ConfigReadonlyMap<int, IConfCross_missionMore>
    /** 限时任务 */
    readonly task: ConfigReadonlyMap<int, IConfCross_missionTask>
}
declare type ConfKeyCross_mission = int
// #endregion cross_mission.json

// #region day_gift.json
interface IConfDay_giftAwards {
    /** 礼包id */
    readonly giftId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfDay_giftAwards2 {
    /** 序号 */
    readonly sort: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfDay_giftChoose {
    /** 序号 */
    readonly sort: int
    /** 礼包id */
    readonly giftId: int
    /** 自选第X格 */
    readonly optional: int
    /** 自选奖励内容 */
    readonly awards2: ConfigReadonlyMap<int, IConfDay_giftAwards2>
}
interface IConfDay_giftContent {
    /** 礼包id */
    readonly giftId: int
    /** 第X天 */
    readonly id: int
    /** 礼包名称 */
    readonly desc: string
    /** 礼包icon图片资源id(每日40X，限时仙玉50X，限时现金60X，终身礼包70X) */
    readonly giftIcon: int
    /** 计费点ID */
    readonly rechargeId: int
    /** 礼包类型(1现金礼包4免费礼包3广告礼包2仙玉礼包) */
    readonly type: int
    /** 消耗道具id */
    readonly costId: int
    /** 消耗道具数量 */
    readonly costNum: int
    /** 限购种类(1每日限购，2每周限购，3每月限购，4终身限购。-1则不限购) */
    readonly buyLimitType: int
    /** 限购次数(-1无限次) */
    readonly buyLimitNum: int
    /** 固定奖励内容 */
    readonly awards: IConfDay_giftAwards[]
    /** 自选格奖励详细 */
    readonly choose: ConfigReadonlyMap<int, IConfDay_giftChoose>
}
interface IConfDay_gift {
    /** 第X天 */
    readonly id: int
    /** 标题 */
    readonly name: string
    /** 图片资源 */
    readonly icon?: string
    /** 礼包内容 */
    readonly content: ConfigReadonlyMap<int, IConfDay_giftContent>
}
declare type ConfKeyDay_gift = int
// #endregion day_gift.json

// #region desc_tips.json
interface IConfDesc_tips {
    /** 文本id */
    readonly id: int
    /** 文本内容 */
    readonly tip: string
}
declare type ConfKeyDesc_tips = int
// #endregion desc_tips.json

// #region drug.json
interface IConfDrug {
    /** 药物id=物品id */
    readonly id: int
    /** 使用等级限制，默认0级可使用 */
    readonly lvLimit: int
    /** 名称 */
    readonly name: string
    /** 类型1.解除当前控制(眩晕等)，参数填技能表对应id，免疫持续时间≥当前技能免疫时间将会覆盖；类型2回复固定血量，参数填回复数值；类型3回复固定法力，参数填回复数值；类型4复活，参数填复活后血量比例（万分比） */
    readonly type: int
    /** 类型参数 */
    readonly value: int
    /** 冷却时间，单位秒 */
    readonly time: int
}
declare type ConfKeyDrug = int
// #endregion drug.json

// #region emoji_pack.json
interface IConfEmoji_packEmojis {
    /** 表情id */
    readonly emojiId: int
    /** 表情包id */
    readonly id: int
    /** 表情标签 */
    readonly tag: string
    /** 显示的图片id */
    readonly icon: int
}
interface IConfEmoji_pack {
    /** 表情包id(1默认，解锁道具对应id) */
    readonly id: int
    /** 表情 */
    readonly emojis: IConfEmoji_packEmojis[]
    /** 是否需要道具解锁(0不需要，1需要) */
    readonly needUnlock: int
    /** tab页签的图标 */
    readonly tabIcon: int
}
declare type ConfKeyEmoji_pack = int
// #endregion emoji_pack.json

// #region equip.json
interface IConfEquipAward {
    /** id */
    readonly id: int
    /** 分解后给与道具id */
    readonly propId: int
    /** 分解后数量 */
    readonly num: int
}
interface IConfEquip {
    /** id */
    readonly id: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 装备描述 */
    readonly desc: string
    /** 装备位置：1头盔2衣服3裤子4护腕5腰带6鞋子 */
    readonly position: int
    /** 装备等级 */
    readonly level: int
    /** 角色等级要求 */
    readonly lvLimit: int
    /** 基础属性范围区间 */
    readonly attr: any
    /** 词条随机表id,equip_entry_call的id */
    readonly entryRankId: int
    /** 词条特效随机表id,equip_effect_call的id */
    readonly effectRankId: int
    /** 分解奖励 */
    readonly award: IConfEquipAward[]
    /** 未获得的装备，icon是否显示简易词条标签(1是0否，不填默认为否) */
    readonly easyIsShow: int
    /** 初始耐久值，也是重复获得的耐久值 */
    readonly durable: int
    /** 修复消耗,一点耐久所需精铁 */
    readonly recoverCost: any
}
declare type ConfKeyEquip = int
// #endregion equip.json

// #region equip_attr_rank.json
interface IConfEquip_attr_rank {
    /** 装备品质 */
    readonly id: int
    /** 基础属性范围随机 */
    readonly rankAttr: IConfEquip_attr_rankRankAttr[]
}
interface IConfEquip_attr_rankRankAttr {
    /** 装备品质 */
    readonly id: int
    /** 属性比例，万分比值 */
    readonly attr: int
    /** 权重，总权重代表100% */
    readonly pro: int
}
declare type ConfKeyEquip_attr_rank = int
// #endregion equip_attr_rank.json

// #region equip_award.json
interface IConfEquip_awardAttrs {
    /** 境界id */
    readonly id: int
    /** 属性类型 */
    readonly attrType: int
    /** 值，万分比 */
    readonly value: int
}
interface IConfEquip_awardNeed {
    /** 序号 */
    readonly sort: int
    /** id */
    readonly id: int
    /** 调用任务类型表的id */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
}
interface IConfEquip_award {
    /** 序列号 */
    readonly id: int
    /** 描述 */
    readonly name: string
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 当前重的装备文字描述 */
    readonly desc1: string
    /** 当前重的等级文字描述 */
    readonly desc2: string
    /** 资源图标 */
    readonly icon?: string
    /** 升到下一重数的奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 升级到下一强度要求 */
    readonly need: IConfEquip_awardNeed[]
    /** 该强度的属性加成 */
    readonly attrs: IConfEquip_awardAttrs[]
    /** 等级 */
    readonly lvLimit: int
    /** 头 */
    readonly pos1: any
    /** 衣服 */
    readonly pos2: any
    /** 裤子 */
    readonly pos3: any
    /** 护腕 */
    readonly pos4: any
    /** 腰带 */
    readonly pos5: any
    /** 鞋 */
    readonly pos6: any
}
declare type ConfKeyEquip_award = int
// #endregion equip_award.json

// #region equip_draw.json
interface IConfEquip_drawBaseQuality10 {
    /** 装备id */
    readonly equipId: int
    /** 等级阶段id */
    readonly lvRangeId: int
    /** 特效id（0表示无初始特效） */
    readonly effectId: int
    /** 权重 */
    readonly pro: int
}
interface IConfEquip_drawBaseQuality6 {
    /** 装备id */
    readonly equipId: int
    /** 等级阶段id */
    readonly lvRangeId: int
    /** 特效id（0表示无初始特效） */
    readonly effectId: int
    /** 权重 */
    readonly pro: int
}
interface IConfEquip_drawBaseQuality8 {
    /** 装备id */
    readonly equipId: int
    /** 等级阶段id */
    readonly lvRangeId: int
    /** 特效id（0表示无初始特效） */
    readonly effectId: int
    /** 权重 */
    readonly pro: int
}
interface IConfEquip_drawEquip {
    /** 装备id */
    readonly equipId: int
    /** 子池唯一id */
    readonly subPoolId: int
    /** 特效id（0表示无初始特效） */
    readonly effectId: int
    /** 权重 */
    readonly pro: int
}
interface IConfEquip_drawLvRange {
    /** 等级阶段id */
    readonly lvRangeId: int
    /** 池Id */
    readonly id: int
    /** 消耗道具Id，单价，多连价 */
    readonly cost: any
    /** 每日首次仙玉抽取的道具id，数量 */
    readonly firstCostProp: any
    /** 次级道具id，数量 */
    readonly costProp: any
    /** 玩家等级 */
    readonly lv: int
    /** 等级下限 */
    readonly minLv: int
    /** 等级上限 */
    readonly maxLv: int
    /** 六件展示 */
    readonly showItem: any
    /** 品质随机库 */
    readonly qualityPool: IConfEquip_drawQualityPool[]
    /** 保底装备品质金色池 */
    readonly baseQuality6: IConfEquip_drawBaseQuality6[]
    /** 保底装备品质橙色池 */
    readonly baseQuality8: IConfEquip_drawBaseQuality8[]
    /** 保底装备品质红色池 */
    readonly baseQuality10: IConfEquip_drawBaseQuality10[]
}
interface IConfEquip_drawQualityInfo {
    /** 池id */
    readonly id: int
    /** 品质类型，品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly type: int
    /** 权重 */
    readonly pro: int
    /** 进入随机的抽取次数要求 */
    readonly needTimes: int
}
interface IConfEquip_drawQualityPool {
    /** 子池唯一id */
    readonly subPoolId: int
    /** 等级阶段id */
    readonly lvRangeId: int
    /** 品质类型，品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly type: int
    /** 装备详细配置 */
    readonly equip: IConfEquip_drawEquip[]
}
interface IConfEquip_drawSpecialCost {
    /** 池id */
    readonly id: int
    /** 使用Id */
    readonly useId: int
    /** 使用类型(1:炼器可保证必定获得大于自身30级的装备,2:炼器可保证必定获得红色品质的装备) */
    readonly useType: int
    /** 特殊炼器界面条目排序 */
    readonly sort: int
    /** 消耗特殊道具，单价，多连价 */
    readonly costNum: any
    /** 特殊炼器选择界面显示的文本 */
    readonly itemDesc: string
    /** 选中后炼器界面显示的描述文本 */
    readonly useDesc: string
}
interface IConfEquip_draw {
    /** 池Id */
    readonly id: int
    /** 卡包类型1普通装备池 */
    readonly poolType: int
    /** 消耗道具Id，单价，多连价（废弃） */
    readonly cost: any
    /** 消耗特殊道具：单价，多连价 */
    readonly specialCost: ConfigReadonlyMap<int, IConfEquip_drawSpecialCost>
    /** 是否开启次级道具消耗 */
    readonly isCostProp: int
    /** 每日首次仙玉抽取的道具id，数量 */
    readonly firstCostProp: any
    /** 次级道具id，数量 */
    readonly costProp: any
    /** 保底品质金色
（是否开启，次数，,三词条次数） */
    readonly baseQuality6: any
    /** 保底品质橙色
（是否开启，次数，,三词条次数） */
    readonly baseQuality8: any
    /** 保底品质红色
（是否开启，次数,三词条次数） */
    readonly baseQuality10: any
    /** 界面展示保底品质（6金8橙10红） */
    readonly showBase: int
    /** 是否仙玉半价 */
    readonly halfDailyTimes: int
    /** 是否免费 */
    readonly freeDailyTimes: int
    /** 单抽免费cd (s) */
    readonly freeCd: int
    /** 排序
(降序) */
    readonly sort: int
    /** 玩家等级池 */
    readonly lvRange: ConfigReadonlyMap<int, IConfEquip_drawLvRange>
    /** 装备品质信息 */
    readonly qualityInfo: IConfEquip_drawQualityInfo[]
    /** 半价按钮名字 */
    readonly buttonName: string
}
declare type ConfKeyEquip_draw = int
// #endregion equip_draw.json

// #region equip_effect.json
interface IConfEquip_effectMore {
    /** 序号 */
    readonly sort: int
    /** 特效词条id */
    readonly id: int
    /** 装备等级 */
    readonly level: int
    /** 评分类型1读表，2按计算 */
    readonly fpType: int
    /** 评分 */
    readonly fp: int
}
interface IConfEquip_effect {
    /** 特效词条id */
    readonly id: int
    /** 特效类型1专属2唯一3通用 */
    readonly effectType: int
    /** 词条特效名称 */
    readonly name: string
    /** 类型1.属性变化，参数1填属性类型值参数2填属性值；类型2.佩戴等级变化，参数1填减少的等级(填0代表无级别)；类型3.新增X个词条，参数1填新增的词条数量；类型4.装备基础属性额外增加比例，参数1填增加的比例，万分比值；类型5.宝石基础属性额外增加比例，参数1填增加的比例，万分比值，类型6.调用技能id，参数1填技能id，类型7：（1不会掉耐久） */
    readonly type: int
    /** 类型参数1 */
    readonly value1: int
    /** 类型参数2 */
    readonly value2: int
    /** 词条特效描述 */
    readonly desc: string
    /** 评分详细 */
    readonly more: ConfigReadonlyMap<int, IConfEquip_effectMore>
}
declare type ConfKeyEquip_effect = int
// #endregion equip_effect.json

// #region equip_effect_call.json
interface IConfEquip_effect_callMore {
    /** 词条特效调用组id */
    readonly id: int
    /** 调用次数 */
    readonly times: int
    /** 权重，总权重代表100% */
    readonly pro: int
    /** 词条特效组id,equip_effect_rank表的id */
    readonly cId: int
}
interface IConfEquip_effect_call {
    /** 词条特效调用组id */
    readonly id: int
    /** 随机调用信息 */
    readonly more: IConfEquip_effect_callMore[]
}
declare type ConfKeyEquip_effect_call = int
// #endregion equip_effect_call.json

// #region equip_effect_rank.json
interface IConfEquip_effect_rankRank {
    /** 词条特效组id */
    readonly id: int
    /** 归属类型，当归属类型相同时，最多产出1种词条 */
    readonly type: int
    /** equip_effect表的id */
    readonly effectId: int
    /** 权重，总权重代表100% */
    readonly pro: int
}
interface IConfEquip_effect_rank {
    /** 词条特效组id */
    readonly id: int
    /**  */
    readonly rank: ConfigReadonlyMap<int, IConfEquip_effect_rankRank>
}
declare type ConfKeyEquip_effect_rank = int
// #endregion equip_effect_rank.json

// #region equip_entry.json
interface IConfEquip_entryMAttr {
    /** 词条id */
    readonly id: int
    /** 属性类型值 */
    readonly attrType: int
    /** 权重，总权重代表100% */
    readonly pro: int
}
interface IConfEquip_entry {
    /** 词条id */
    readonly id: int
    /** 最小基础属性值 */
    readonly minAttr: int
    /** 最大基础属性值 */
    readonly maxAttr: int
    /** 基础属性类型随机 */
    readonly mAttr: IConfEquip_entryMAttr[]
}
declare type ConfKeyEquip_entry = int
// #endregion equip_entry.json

// #region equip_entry_call.json
interface IConfEquip_entry_callMore {
    /** 词条调用组id */
    readonly id: int
    /** 调用次数 */
    readonly times: int
    /** 权重，总权重代表100% */
    readonly pro: int
    /** 词条id,equip_entry表的id */
    readonly cId: int
}
interface IConfEquip_entry_call {
    /** 词条调用组id */
    readonly id: int
    /** 词条id，单次调用时的id(特效词条出现属性词条时调用) */
    readonly entryId: int
    /** 随机调用信息 */
    readonly more: IConfEquip_entry_callMore[]
}
declare type ConfKeyEquip_entry_call = int
// #endregion equip_entry_call.json

// #region equip_fashion.json
interface IConfEquip_fashionBaseAttr {
    /** 时装id，跟物品id一样 */
    readonly id: int
    /** 属性类型 */
    readonly attrType: int
    /** 值 */
    readonly value: int
}
interface IConfEquip_fashionMore {
    /** 时装id，跟物品id一样 */
    readonly id: int
    /** 回复耐久道具，物品id */
    readonly reply: int
}
interface IConfEquip_fashionWearAttr {
    /** 时装id，跟物品id一样 */
    readonly id: int
    /** 属性类型 */
    readonly attrType: int
    /** 值 */
    readonly value: int
}
interface IConfEquip_fashion {
    /** 时装id，跟物品id一样 */
    readonly id: int
    /** 时装类型1代表衣服2代表发饰3代表发型4代表五官5代表脸饰6代表头部全套 */
    readonly fashionType: int
    /** 时装品质 */
    readonly quality: int
    /** 是否分种族(通用-1分种族1~3) */
    readonly race: int
    /** 套装是否分性别（通用1分男女2） */
    readonly gender: int
    /** 类型（隐藏0化形1时装2） */
    readonly type: int
    /** 名字 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 标签资源 */
    readonly tagIcon: int
    /** 排序字段 */
    readonly sort: int
    /** 初始耐久值，也是重复获得的耐久值 */
    readonly durable: int
    /** 每次生效消耗耐久度 */
    readonly cost: int
    /** 每次生效的类型（1攻击扣除，2受击扣除，3都扣除） */
    readonly costType: int
    /** 套装id（代表套装子件）(分性别和不分性别的分开走套装id) */
    readonly suit: int
    /** 头部对应的部位id组 */
    readonly partGroup: any
    /** 回复耐久消耗道具 */
    readonly more: IConfEquip_fashionMore[]
    /** 时装的固定属性 */
    readonly baseAttr: IConfEquip_fashionBaseAttr[]
    /** 时装穿戴效果（固定评分，填属性不会受到境界加成，需要额外加） */
    readonly wearAttr: IConfEquip_fashionWearAttr[]
    /** 评分 */
    readonly fp: int
    /** 颜值 */
    readonly showValue: int
    /** 神装描述 */
    readonly showDesc?: string
    /** 每小时恢复耐久度 */
    readonly durableRecovery: int
}
declare type ConfKeyEquip_fashion = int
// #endregion equip_fashion.json

// #region equip_gem.json
interface IConfEquip_gemMore {
    /** 装备位置：1头盔2衣服3裤子4护腕5腰带6鞋子 */
    readonly id: int
    /** 符石id也是物品id */
    readonly gemId: int
    /** 符石等级 */
    readonly gemLv: int
    /** 装备等级要求 */
    readonly equipLevel: int
    /** 属性类型值
1生命
2攻击
3防御 */
    readonly attrType: int
    /** 属性值 */
    readonly value: int
    /** 所在装备基础属性提升万分比 */
    readonly equipRatio: int
    /** 升级消耗道具 */
    readonly propId: int
    /** 消耗数量(不含本体) */
    readonly num: int
    /** 升级后的符石id */
    readonly newId: int
    /** 镶嵌消耗id */
    readonly insetId: int
    /** 镶嵌消耗数量 */
    readonly insetNum: int
}
interface IConfEquip_gem {
    /** 装备位置：1头盔2衣服3裤子4护腕5腰带6鞋子 */
    readonly id: int
    /** 详细内容 */
    readonly more: ConfigReadonlyMap<int, IConfEquip_gemMore>
}
declare type ConfKeyEquip_gem = int
// #endregion equip_gem.json

// #region equip_suit.json
interface IConfEquip_suit {
    /** id */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 套装效果描述 */
    readonly desc: string
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 套装属性 */
    readonly attr: IConfEquip_suitAttr[]
}
interface IConfEquip_suitAttr {
    /** id */
    readonly id: int
    /** 属性类型 */
    readonly attrType: int
    /** 属性值 */
    readonly value: int
}
declare type ConfKeyEquip_suit = int
// #endregion equip_suit.json

// #region event_tracking.json
interface IConfEvent_tracking {
    /** 事件id */
    readonly id: int
    /** 事件类型
（0-客户端登录流程/
1-系统入口/
2-引导流程） */
    readonly type: int
    /** 事件描述 */
    readonly desc: string
    /** 事件名 */
    readonly name: string
}
declare type ConfKeyEvent_tracking = int
// #endregion event_tracking.json

// #region evil.json
interface IConfEvil {
    /** 阶段 */
    readonly id: int
    /** 红名值范围 */
    readonly minValue: int
    /** 红名值范围（-1，不判断） */
    readonly maxValue: int
    /** 称号 */
    readonly title?: string
    /** 额外减少耐久 */
    readonly exReDurable: int
}
declare type ConfKeyEvil = int
// #endregion evil.json

// #region fast_practice.json
interface IConfFast_practice {
    /** 第X次 */
    readonly id: int
    /** 消耗道具，优先这个道具 */
    readonly costPropId: int
    /** 消耗数量 */
    readonly costNum: int
    /** 消耗道具 */
    readonly costPropId2: int
    /** 消耗数量 */
    readonly costNum2: int
}
declare type ConfKeyFast_practice = int
// #endregion fast_practice.json

// #region festival_activity.json
interface IConfFestival_activity {
    /** 活动名 */
    readonly activityName: string
    /** 活动中文名 */
    readonly name: string
    /** 入口启动时间 */
    readonly openTs: string
    /** 入口关闭时间 */
    readonly closeTs: string
    /** 活动开始时间 */
    readonly starTs: string
    /** 活动结束时间 */
    readonly endTs: string
    /** 商店唯一 id */
    readonly shopId: int
    /** 活动限定道具回收[货币id，转化id，转化数量】 */
    readonly itemRecoup: any
    /** 编号 */
    readonly fundId: string
    /** 节日奖池id */
    readonly drawId: int
    /** 礼包 */
    readonly gifts: ConfigReadonlyMap<int, IConfFestival_activityGifts>
}
interface IConfFestival_activityAwards {
    /** 礼包id */
    readonly giftId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfFestival_activityGifts {
    /** giftId */
    readonly giftId: int
    /** 活动名 */
    readonly activityName: string
    /** 礼包图标 */
    readonly icon: int
    /** 礼包名称 */
    readonly desc: string
    /** 排序 */
    readonly sort: int
    /** 限购类型(0不限购，1活动期间总计，2每日) */
    readonly limitType: int
    /** 限购次数 */
    readonly totalLimit: int
    /** 充值ID */
    readonly rechargeId: int
    /** 礼包类型(1现金礼包，2仙玉礼包，3广告礼包-跳，4免费礼包，5广告礼包-必) */
    readonly payType: int
    /** 价格 */
    readonly price: int
    /** 折扣 */
    readonly discount: int
    /** 礼包内容 */
    readonly awards: IConfFestival_activityAwards[]
}
declare type ConfKeyFestival_activity = string
// #endregion festival_activity.json

// #region festival_draw.json
interface IConfFestival_draw {
    /** 奖池id */
    readonly id: int
    /** 单抽品id */
    readonly costPropId: int
    /** 单抽消耗数量 */
    readonly costNum: any
    /** N抽消耗数量 */
    readonly costMoreNum: any
    /** 描述 */
    readonly desc: string
    /** 累计次数奖励 */
    readonly times: ConfigReadonlyMap<int, IConfFestival_drawTimes>
    /** 抽取池 */
    readonly detail: ConfigReadonlyMap<int, IConfFestival_drawDetail>
    /** 奖励展示 */
    readonly show: ConfigReadonlyMap<int, IConfFestival_drawShow>
}
interface IConfFestival_drawDetail {
    /** 奖品id唯一 */
    readonly aId: int
    /** id */
    readonly id: int
    /** 物品id */
    readonly propId: int
    /** 物品数量 */
    readonly num: int
    /** 是否大奖 */
    readonly grandPrize: int
    /** 权重，总权重代表100% */
    readonly pro: int
    /** 物品id */
    readonly propId2: int
    /** 物品数量 */
    readonly num2: int
}
interface IConfFestival_drawShow {
    /** 展示奖励 */
    readonly aId: int
    /** id */
    readonly id: int
    /** 物品id */
    readonly propId: int
    /** 物品数量 */
    readonly num: int
    /** 是否大奖 */
    readonly grandPrize: int
}
interface IConfFestival_drawTimes {
    /** id */
    readonly id: int
    /** 次数 */
    readonly times: int
    /** 物品id */
    readonly propId: int
    /** 物品数量 */
    readonly num: int
    /** 是否大奖 */
    readonly grandPrize: int
}
declare type ConfKeyFestival_draw = int
// #endregion festival_draw.json

// #region first_recharge.json
interface IConfFirst_rechargeAwards {
    /** 为了对应奖励列表 */
    readonly actId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfFirst_rechargeList {
    /** 为了对应奖励列表 */
    readonly actId: int
    /** id */
    readonly id: int
    /** 第X天奖励 */
    readonly day: int
    /** 奖励 */
    readonly awards: IConfFirst_rechargeAwards[]
}
interface IConfFirst_recharge {
    /** id */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 标头 */
    readonly iconType: int
    /** 文本描述 */
    readonly iconDesc: int
    /** 展示图片 */
    readonly iconProp: int
    /** 折扣 */
    readonly discount: int
    /** 充值 */
    readonly recharge: int
    /** 列表 */
    readonly list: ConfigReadonlyMap<int, IConfFirst_rechargeList>
}
declare type ConfKeyFirst_recharge = int
// #endregion first_recharge.json

// #region first_recharge_gift.json
interface IConfFirst_recharge_giftAwards {
    /** 触发礼包id */
    readonly id: number
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfFirst_recharge_gift {
    /** 触发礼包id */
    readonly id: int
    /** 前置购买条件 */
    readonly need: int
    /** 充值id */
    readonly rechargeId: int
    /** 标题美术字资源 */
    readonly titie: int
    /** 描述美术字资源 */
    readonly desc: int
    /** 大资源图 */
    readonly icon: int
    /** 礼包标题底图 */
    readonly giftIcon: int
    /** 大奖周围火焰资源图 */
    readonly fireIcon: int
    /** 返利倍率 */
    readonly discount: int
    /** 触发弹出的方式(1每日首次满足条件时弹出1次，2功能开启后终身仅弹1次) */
    readonly openShow: int
    /** 奖励 */
    readonly awards: IConfFirst_recharge_giftAwards[]
}
declare type ConfKeyFirst_recharge_gift = int
// #endregion first_recharge_gift.json

// #region force_target.json
interface IConfForce_target {
    /** id */
    readonly id: int
    /** 模块名称 */
    readonly name: string
    /** 模块图标 */
    readonly icon: int
    /** 系统id */
    readonly systemId: int
    /** 包含子途径 */
    readonly way: IConfForce_targetWay[]
}
interface IConfForce_targetBasis {
    /** 途径依据id */
    readonly basisId: int
    /** 玩家等级 */
    readonly playerLv: int
    /** 途径id */
    readonly wayId: int
    /** 目标值 */
    readonly targetValue: int
}
interface IConfForce_targetWay {
    /** 途径id */
    readonly wayId: int
    /** 模块id */
    readonly id: int
    /** 途径名称 */
    readonly name: string
    /** 系统id */
    readonly systemId: int
    /** 是否设置目标战力(1是0否) */
    readonly manual: int
    /** 是否可跳转到对应功能(1是0否) */
    readonly jump: int
    /** 说明文本(模糊目标不跳转时配置) */
    readonly tips?: string
    /** 0独立1汇总到模块 */
    readonly targetType: int
    /** 途径依据 */
    readonly basis: IConfForce_targetBasis[]
}
declare type ConfKeyForce_target = int
// #endregion force_target.json

// #region fund.json
interface IConfFundBuyAwards {
    /** 序号 */
    readonly sort: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfFundFreeAwards {
    /** 序号 */
    readonly sort: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfFundMore {
    /** 序号 */
    readonly sort: int
    /** 编号 */
    readonly id: string
    /** 定义类型 */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
    /** 免费奖励 */
    readonly freeAwards: IConfFundFreeAwards[]
    /** 付费奖励 */
    readonly buyAwards: IConfFundBuyAwards[]
}
interface IConfFundPreview {
    /** 基金id */
    readonly id: string
    /** 基金预览界面展示的道具icon(可填写多个) */
    readonly propId: int
    /** 基金预览界面展示的道具描述 */
    readonly name: string
}
interface IConfFund {
    /** 编号 */
    readonly id: string
    /** 描述 */
    readonly desc: string
    /** 免费奖励标题 */
    readonly freeRewardTitle: string
    /** 付费奖励标题 */
    readonly buyRewardTitle: string
    /** 充值id */
    readonly rechargeId: int
    /** 图片资源(程序根据基金的id名字取值，id名字固定格式XXXXfund) */
    readonly icon?: string
    /** 礼包标题底图(程序根据基金的id名字取值，id名字固定格式XXXXfund) */
    readonly giftIcon?: string
    /** 奖励详细内容 */
    readonly more: ConfigReadonlyMap<int, IConfFundMore>
    /** 基金预览界面文本 */
    readonly previewDesc: string
    /** 基金预览界面icon配置 */
    readonly preview: IConfFundPreview[]
}
declare type ConfKeyFund = string
// #endregion fund.json

// #region getway.json
interface IConfGetway {
    /** 途径id(每新增一个id，都需要同步到对应的程序让其加跳转逻辑) */
    readonly id: int
    /** 途径图标(后续版本开发) */
    readonly icon: int
    /** 途径名称 */
    readonly title: string
    /** 跳转的systemId */
    readonly systemId?: number
    /** 跳转参数，systemId不足以指定的情况下加参数，用_分隔 */
    readonly jumpTo?: string
    /** 是否为推荐getway(1是0否)；不填默认为否 */
    readonly isRecommend: int
    /** 跳转逻辑备注(供策划程序备忘，不会显示在游戏中) */
    readonly desc?: string
}
declare type ConfKeyGetway = int
// #endregion getway.json

// #region ghost_city.json
interface IConfGhost_cityRank {
    /** id */
    readonly id: int
    /** 物品id */
    readonly propId: int
    /** 物品数量 */
    readonly num: int
    /** 权重，总权重代表100% */
    readonly pro: int
}
interface IConfGhost_cityShow {
    /** 展示类型 */
    readonly type: int
    /** id */
    readonly id: int
    /** 类型文字 */
    readonly showName: string
    /** 展示概率万分比 */
    readonly showPro: number
    /** 展示道具 */
    readonly showItem: IConfGhost_cityShowItem[]
}
interface IConfGhost_cityShowItem {
    /** 展示类型 */
    readonly type: int
    /** 物品id */
    readonly propId: int
    /** 物品数量 */
    readonly num: int
}
interface IConfGhost_city {
    /** id */
    readonly id: int
    /** 单抽品id */
    readonly costPropId: int
    /** 单抽消耗数量 */
    readonly costNum: int
    /** 5抽消耗数量 */
    readonly costFiveNum: int
    /** 描述 */
    readonly desc: string
    /** 抽取池 */
    readonly rank: IConfGhost_cityRank[]
    /** 展示 */
    readonly show: IConfGhost_cityShow[]
}
declare type ConfKeyGhost_city = int
// #endregion ghost_city.json

// #region gift.json
interface IConfGiftAwards {
    /** 礼包id */
    readonly giftId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfGiftContent {
    /** 礼包id */
    readonly giftId: int
    /** 商店唯一id */
    readonly id: int
    /** 礼包名称 */
    readonly desc: string
    /** 礼包icon图片资源id */
    readonly giftIcon: int
    /** 计费点ID */
    readonly rechargeId: int
    /** 礼包类型(1现金礼包4免费礼包3广告礼包2仙玉礼包) */
    readonly type: int
    /** 消耗道具id */
    readonly costId: int
    /** 消耗道具数量 */
    readonly costNum: int
    /** 限购种类(1每日限购，2每周限购，3每月限购，4终身限购。-1则不限购) */
    readonly buyLimitType: int
    /** 限购次数(-1无限次) */
    readonly buyLimitNum: int
    /** 奖励内容 */
    readonly awards: IConfGiftAwards[]
}
interface IConfGift {
    /** 商店唯一 id */
    readonly id: int
    /** 商店标题 */
    readonly name: string
    /** 商店英文名,程序使用 */
    readonly enName: string
    /** 商店NPC图片资源 */
    readonly npcIcon?: string
    /** 商店解锁方式(1解锁对应功能后解锁,value为功能id；-1默认解锁) */
    readonly unlockType: int
    /** 商店中可展示最大礼包数量(-1则无限制) */
    readonly showNum: int
    /** 商店内容 */
    readonly content: ConfigReadonlyMap<int, IConfGiftContent>
}
declare type ConfKeyGift = int
// #endregion gift.json

// #region gong.json
interface IConfGong {
    /** 序列号 */
    readonly id: int
    /** 等级 */
    readonly showLv: int
    /** 星级 */
    readonly star: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 名字 */
    readonly name: string
    /** 描述1 */
    readonly desc: string
    /** 元神形象资源 */
    readonly icon: int
    /** 元神强度限制 */
    readonly lvLimit: int
    /** 消耗道具 */
    readonly costPropId: int
    /** 消耗数量 */
    readonly costNum: int
    /** 攻击力 */
    readonly atk: int
    /** 防御力 */
    readonly def: int
    /** 血量 */
    readonly hp: int
    /** 奖励道具1 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
declare type ConfKeyGong = int
// #endregion gong.json

// #region gong_award.json
interface IConfGong_awardAttrs {
    /** 境界id */
    readonly id: int
    /** 属性类型 */
    readonly attrType: int
    /** 值，万分比 */
    readonly value: int
}
interface IConfGong_awardNeed {
    /** 序号 */
    readonly sort: int
    /** id */
    readonly id: int
    /** 调用任务类型表的id */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
}
interface IConfGong_award {
    /** 序列号 */
    readonly id: int
    /** 品质 */
    readonly quality: int
    /** 描述 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 升到下一重数的奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 升级到下一强度要求 */
    readonly need: IConfGong_awardNeed[]
    /** 该强度的属性加成 */
    readonly attrs: IConfGong_awardAttrs[]
}
declare type ConfKeyGong_award = int
// #endregion gong_award.json

// #region gong_booty.json
interface IConfGong_bootyLv {
    /** 奇珍id，跟物品id一样 */
    readonly id: int
    /** 等级 */
    readonly level: int
    /** 等级限制 */
    readonly lvLimit: int
    /** 消耗数量，同品质奇珍 */
    readonly costNum: int
    /** 攻击力 */
    readonly atk: int
    /** 防御力 */
    readonly def: int
    /** 血量 */
    readonly hp: int
    /** 特殊类型1属性类型，参数1填属性类型的值，参数2填增加值；5资源增加比例，参数1填资源的物品id，参数2填万分比的比例值 */
    readonly type: int
    /** 类型参数 */
    readonly typeValue1: int
    /** 类型参数 */
    readonly typeValue2: int
}
interface IConfGong_booty {
    /** 奇珍id，跟物品id一样 */
    readonly id: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 神像icon */
    readonly icon: int
    /** 神像名称 */
    readonly name: string
    /** 奇珍升级 */
    readonly lv: ConfigReadonlyMap<int, IConfGong_bootyLv>
}
declare type ConfKeyGong_booty = int
// #endregion gong_booty.json

// #region gong_booty_combination.json
interface IConfGong_booty_combinationMore {
    /** 组合ID */
    readonly id: int
    /** 神像id */
    readonly bootyId: int
}
interface IConfGong_booty_combination {
    /** 组合ID */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 消耗名词 */
    readonly costName: string
    /** 组合需要的奇珍 */
    readonly more: IConfGong_booty_combinationMore[]
}
declare type ConfKeyGong_booty_combination = int
// #endregion gong_booty_combination.json

// #region gong_magical.json
interface IConfGong_magicalBaseAttr {
    /** 神符id，跟物品id一样 */
    readonly id: int
    /** 属性类型 */
    readonly attrType: int
    /** 值 */
    readonly value: int
}
interface IConfGong_magicalMore {
    /** 神符id，跟物品id一样 */
    readonly id: int
    /** 回复耐久道具，物品id */
    readonly reply: int
}
interface IConfGong_magical {
    /** 神符id，跟物品id一样 */
    readonly id: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 技能角标，用于展示资源图标1狂暴2治疗3控制 */
    readonly tag: int
    /** 排序字段 */
    readonly sort: int
    /** 耐久值，也是重复获得的耐久值 */
    readonly durable: int
    /** 每次释放消耗耐久度 */
    readonly cost: int
    /** 效果类型1代表替换大招技能，2替换被动技能，3替换触发技能 */
    readonly type: int
    /** 技能ID */
    readonly skillId: int
    /** 描述 */
    readonly desc: string
    /** 简略描述 */
    readonly desc2: string
    /** 回复耐久消耗道具 */
    readonly more: IConfGong_magicalMore[]
    /** 神符固定属性详细 */
    readonly baseAttr: IConfGong_magicalBaseAttr[]
    /** 评分 */
    readonly fp: int
    /** 颜值 */
    readonly showValue: int
    /** 每小时恢复耐久度 */
    readonly durableRecovery: int
}
declare type ConfKeyGong_magical = int
// #endregion gong_magical.json

// #region gong_sorcery.json
interface IConfGong_sorcery {
    /** 唯一id */
    readonly id: int
    /** 种族1蟒天蛟2青鸾鸟3九尾狐 */
    readonly race: int
    /** 妖术图标 */
    readonly icon: int
    /** 技能角标，用于展示资源图标1狂暴2治疗3控制 */
    readonly tag: int
    /** 技能类型，1主动2触发3被动 */
    readonly released: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 技能等级 */
    readonly level: int
    /** 元神等级限制，元神的序列号id */
    readonly gongLevel: int
    /** 消耗道具，升到下一等级的消耗 */
    readonly costPropId: number
    /** 消耗数量，升到下一等级的消耗 */
    readonly costNum: number
    /** 返还数量，从当前等级重置返还的消耗 */
    readonly returnNum: int
    /** 技能id */
    readonly skillId: int
    /** 新的id */
    readonly newId: number
    /** 评分 */
    readonly fp: int
    /** 效果描述文字 */
    readonly desc1: any
}
declare type ConfKeyGong_sorcery = int
// #endregion gong_sorcery.json

// #region goto.json
interface IConfGoto {
    /** 引导id */
    readonly id: int
    /** 必须等待打开或者显示的widget */
    readonly waitShowWidget?: string
    /** 步骤数组 */
    readonly steps: IConfGotoStep[]
}
interface IConfGotoStep {
    /** 步骤id */
    readonly stepId: int
    /** gotoId */
    readonly id: int
    /** 操作类型：click(点击)、tab(页签)、toggle（选择框）、delay(延迟毫秒)、plot(播放剧情)、on(监听事件)、custom（自定义逻辑） */
    readonly key: string
    /** 操作值 */
    readonly value: string
    /** 跳转类型(具有特殊含义)：1地图、2打怪、3修炼波次boss、4自动战斗、5掉落装备 */
    readonly gotoType: int
}
declare type ConfKeyGoto = int
// #endregion goto.json

// #region guide.json
interface IConfGuideAwards {
    /** id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfGuideSteps {
    /** 步骤id */
    readonly stepId: int
    /** 引导Id */
    readonly id: int
    /** 操作类型：trigger(触发)、click(点击)、delay(延迟毫秒)、save(保存）、 plot(播放剧情)、on(监听事件)、custom（自定义逻辑）、background(全屏引导图,0：透明图) */
    readonly key: string
    /** 操作值 */
    readonly value: string
    /** 手指提示文本 */
    readonly fingerTip?: string
    /** 提示文本相对位置（默认0）：0（屏幕居中）1（相对引导组件上方）2（相对引导组件下方） */
    readonly tipPos?: number
    /** 提示形象位置（默认0）：0（左边）1（右边） */
    readonly tipRolePos?: number
    /** 提示形象(填写npc表里面的id,默认使用当前等级素萝形象) */
    readonly tipRole?: number
    /** 提示文本 */
    readonly tip?: string
    /** 音效类型 */
    readonly soundType?: number
    /** 音效Id */
    readonly sound?: string
    /** 重复本操作次数：默认(不重复） */
    readonly repeatCount?: number
    /** 隐藏手指:(默认不隐藏、1:隐藏) */
    readonly hideFinger?: number
    /** 隐藏遮罩(默认不隐藏、1:隐藏) */
    readonly hideMask?: number
    /** 选择框GuideName */
    readonly select?: string
    /** 选择框样式:(默认：0、0:矩形、1:椭圆形) */
    readonly selectStyle?: number
    /** 弱引导：默认(强制引导) */
    readonly weakGuide?: number
    /** 埋点id:有配置就会埋点，用于数数统计 */
    readonly trackId?: number
}
interface IConfGuide {
    /** 引导id */
    readonly id: int
    /** 排序值 */
    readonly sort: int
    /** 引导名 */
    readonly guideName: string
    /** 暂停个人修炼战斗（1:暂停） */
    readonly pauseFight?: number
    /** 步骤数组 */
    readonly steps: IConfGuideSteps[]
    /** 禁用:空是默认启用，1是禁用 */
    readonly disable?: number
    /** 奖励 */
    readonly awards: IConfGuideAwards[]
}
declare type ConfKeyGuide = int
// #endregion guide.json

// #region guild.json
interface IConfGuild {
    /** 山头等级 */
    readonly id: int
    /** 升到下级所需威望 */
    readonly exp: int
    /** 总人数限制 */
    readonly count: int
    /** 二大王人数 */
    readonly deputyGuildLeader: int
    /** 三大王人数 */
    readonly elders: int
    /** 每日捐纳值上限 */
    readonly donateLimit: int
}
declare type ConfKeyGuild = int
// #endregion guild.json

// #region guild_apply.json
interface IConfGuild_apply {
    /** 唯一id */
    readonly id: int
    /** 类型，1代表无条件，2代表审核加入，3代表需要等级大于等级X */
    readonly type: int
    /** 条件参数 */
    readonly value: int
    /** 描述 */
    readonly desc: string
}
declare type ConfKeyGuild_apply = int
// #endregion guild_apply.json

// #region guild_boss.json
interface IConfGuild_bossAwards1 {
    /** 阶段id */
    readonly stage: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfGuild_bossAwards2 {
    /** 阶段id */
    readonly stage: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfGuild_bossGuild {
    /** 阶段id */
    readonly stage: int
    /** 需求等级 */
    readonly guildLv: int
    /** id */
    readonly id: int
    /** 评分 */
    readonly score: int
    /** 红包id */
    readonly redId: int
    /** 山头威望 */
    readonly guildExp: int
    /**  达成最高档次奖励预览（奖励红包内领取） */
    readonly awards2: IConfGuild_bossAwards2[]
}
interface IConfGuild_bossPerson {
    /** 阶段id */
    readonly stage: int
    /** id */
    readonly id: int
    /** 评分 */
    readonly score: int
    /** 奖励（累计积分奖励，每档每日1次） */
    readonly awards1: IConfGuild_bossAwards1[]
}
interface IConfGuild_boss {
    /** id */
    readonly id: int
    /** 怪物id */
    readonly monsterId: int
    /** 挑战时间（秒） */
    readonly time: int
    /** 进入冷却 */
    readonly cd: int
    /** 积分系数[伤害，回血，控制] */
    readonly scoreRate: any
    /** 个人阶段 */
    readonly person: ConfigReadonlyMap<int, IConfGuild_bossPerson>
    /** 帮会阶段 */
    readonly guild: ConfigReadonlyMap<int, IConfGuild_bossGuild>
}
declare type ConfKeyGuild_boss = int
// #endregion guild_boss.json

// #region guild_build.json
interface IConfGuild_buildAward {
    /** id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfGuild_build {
    /** id */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 消耗道具 */
    readonly costId: int
    /** 获得奖励 */
    readonly costNum: int
    /** 获得的捐献值 */
    readonly donate: int
    /** 奖励 */
    readonly award: IConfGuild_buildAward[]
}
declare type ConfKeyGuild_build = int
// #endregion guild_build.json

// #region guild_flag.json
interface IConfGuild_flag {
    /** 旗帜id，和旗帜的物品id一致 */
    readonly id: int
    /** 旗帜名称 */
    readonly flag: string
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 是否初始赠送1代表初始赠送，0代表不是 */
    readonly start: int
    /** 旗帜来源 */
    readonly desc: string
}
declare type ConfKeyGuild_flag = int
// #endregion guild_flag.json

// #region guild_gift.json
interface IConfGuild_giftAwards {
    /** 礼包id */
    readonly giftId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfGuild_giftCutRule {
    /** id */
    readonly id: int
    /** 活动名 */
    readonly activityName: string
    /** 价格段百分比(百分比1，百分比2] 左开右闭 */
    readonly priceStage: any
    /** 砍价万分比[整数随机]向上取整 */
    readonly cutPer: any
    /** 砍价数值[整数随机] */
    readonly cutNum: any
}
interface IConfGuild_gift {
    /** 活动名 */
    readonly activityName: string
    /** 定点重置时间(HH:MM:SS) */
    readonly resetTime: string
    /** 砍价时间(s) */
    readonly cutTime: int
    /** 领取差价时间(s) */
    readonly rebateTime: int
    /** 礼包 */
    readonly gifts: ConfigReadonlyMap<int, IConfGuild_giftGifts>
    /** 砍价规则 */
    readonly cutRule: IConfGuild_giftCutRule[]
}
interface IConfGuild_giftGifts {
    /** 礼包id */
    readonly giftId: int
    /** 活动名 */
    readonly activityName: string
    /** 礼包名称 */
    readonly name: string
    /** 抽取权重 */
    readonly pro: int
    /** 山头等级 */
    readonly guildLv: int
    /** 消耗道具id */
    readonly costId: int
    /** 消耗道具数量 */
    readonly costNum: int
    /** 固定奖励内容 */
    readonly awards: IConfGuild_giftAwards[]
}
declare type ConfKeyGuild_gift = string
// #endregion guild_gift.json

// #region guild_magic.json
interface IConfGuild_magicLv {
    /** 契印id */
    readonly id: int
    /** 等级 */
    readonly level: int
    /** 升到下一级需要山头等级 */
    readonly need: int
    /** 升下一级消耗 */
    readonly costId: int
    /** 升下一级数量 */
    readonly costNum: int
    /** 属性类型 */
    readonly attrType: int
    /** 2人的属性值 */
    readonly num2: int
    /** 3人的属性值 */
    readonly num3: int
    /** 4人的属性值 */
    readonly num4: int
    /** 5人的属性值 */
    readonly num5: int
    /** 6人的属性值 */
    readonly num6: int
    /** 7人的属性值 */
    readonly num7: int
    /** 8人的属性值 */
    readonly num8: int
    /** 9人的属性值 */
    readonly num9: int
    /** 10人的属性值 */
    readonly num10: int
}
interface IConfGuild_magic {
    /** 契印id */
    readonly id: int
    /** 契印名称 */
    readonly name: string
    /** 契印特效 */
    readonly icon?: string
    /** 升级 */
    readonly lv: ConfigReadonlyMap<int, IConfGuild_magicLv>
}
declare type ConfKeyGuild_magic = int
// #endregion guild_magic.json

// #region guild_mf.json
interface IConfGuild_mfLv {
    /** 秘术id */
    readonly id: int
    /** 等级 */
    readonly level: int
    /** 升到下一级需要妖盟等级 */
    readonly need: int
    /** 法阵特效 */
    readonly icon?: string
    /** 升下一级消耗 */
    readonly costId: int
    /** 升下一级数量 */
    readonly costNum: int
    /** 属性类型 */
    readonly attrType: int
    /** 属性值 */
    readonly value: int
    /** 评分 */
    readonly fp: int
}
interface IConfGuild_mf {
    /** 秘术id */
    readonly id: int
    /** 秘术名称 */
    readonly name: string
    /** 升级 */
    readonly lv: ConfigReadonlyMap<int, IConfGuild_mfLv>
}
declare type ConfKeyGuild_mf = int
// #endregion guild_mf.json

// #region guild_mission.json
interface IConfGuild_missionAwards1 {
    /** 山头等级限制 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfGuild_missionAwards2 {
    /** 山头等级限制 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfGuild_missionShowAwards {
    /** 山头等级限制 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfGuild_mission {
    /** 山头等级限制 */
    readonly id: int
    /** 怪物id */
    readonly monsterId: int
    /** 历练等级 */
    readonly lv: int
    /** 背景图 */
    readonly bgRes: int
    /** 场景重进cd */
    readonly cd: int
    /** 固定掉落 */
    readonly awards1: IConfGuild_missionAwards1[]
    /** 帮会掉落 */
    readonly awards2: IConfGuild_missionAwards2[]
    /** 展示掉落 */
    readonly showAwards: IConfGuild_missionShowAwards[]
}
declare type ConfKeyGuild_mission = int
// #endregion guild_mission.json

// #region guild_red_envelope.json
interface IConfGuild_red_envelope {
    /** id */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 红包祝福语 */
    readonly desc: string
    /** 1捐献红包2试炼boss红包 */
    readonly type: int
    /** 红包可领取次数（N人数上限，-1根据当前山头人数上限） */
    readonly times: int
    /** 红包总功绩 */
    readonly awards: IConfGuild_red_envelopeAwards[]
}
interface IConfGuild_red_envelopeAwards {
    /** id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 1均分2拼手气3每份固定 */
    readonly type: int
    /** 拼手气最低数量 */
    readonly minNum: int
}
declare type ConfKeyGuild_red_envelope = int
// #endregion guild_red_envelope.json

// #region heart_demon.json
interface IConfHeart_demonAwards {
    /** 序号 */
    readonly sort: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfHeart_demonBattleBubble {
    /** 章节id */
    readonly id: int
    /** 文本序号 */
    readonly sort: int
    /** 文本内容 */
    readonly text: string
}
interface IConfHeart_demonEntranceBubble {
    /** 章节id */
    readonly id: int
    /** 文本序号 */
    readonly sort: int
    /** 文本内容 */
    readonly text: string
}
interface IConfHeart_demonMore {
    /** 序号 */
    readonly sort: int
    /** 章节ID */
    readonly id: int
    /** 战场背景图 */
    readonly bgRes: int
    /** 怪物id */
    readonly monsterId: any
    /** 消耗道具 */
    readonly costPropId: int
    /** 消耗数量 */
    readonly costNum: int
    /** 击杀掉落 */
    readonly awards: IConfHeart_demonAwards[]
}
interface IConfHeart_demon {
    /** 章节ID */
    readonly id: int
    /** 地图名称 */
    readonly name: string
    /** 需要玩家等级 */
    readonly level: int
    /** 地图资源 */
    readonly mapRes: int
    /** 章节详细 */
    readonly more: ConfigReadonlyMap<int, IConfHeart_demonMore>
    /** 入口怪物形象 */
    readonly entranceShow: int
    /** 入口形象的气泡文字随机库 */
    readonly entranceBubble: IConfHeart_demonEntranceBubble[]
    /** 战斗场景中的摆设形象 */
    readonly battleShow: int
    /** 战斗场景摆设的气泡文字随机库 */
    readonly battleBubble: IConfHeart_demonBattleBubble[]
}
declare type ConfKeyHeart_demon = int
// #endregion heart_demon.json

// #region help.json
interface IConfHelp {
    /** id */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 描述 */
    readonly desc: string
}
declare type ConfKeyHelp = int
// #endregion help.json

// #region hero.json
interface IConfHero {
    /** 唯一ID */
    readonly id: int
    /** 门客名字 */
    readonly name: string
}
declare type ConfKeyHero = int
// #endregion hero.json

// #region hero_lv.json
interface IConfHero_lv {
    /** 唯一ID */
    readonly lv: int
    /** 升级到下一级所需要铜币数量 */
    readonly cost: int
}
declare type ConfKeyHero_lv = int
// #endregion hero_lv.json

// #region home_talk.json
interface IConfHome_talk {
    /** 序号 */
    readonly sort: int
    /** 动作类型1代表走动2代表待机（其他等动作出来加新类型） */
    readonly action: int
    /** 1主角2素罗 */
    readonly type: int
    /** 语言包，空值就是不说话的 */
    readonly desc?: string
    /** 权重 */
    readonly pro: int
}
declare type ConfKeyHome_talk = int
// #endregion home_talk.json

// #region item.json
interface IConfItem {
    /** 唯一ID */
    readonly id: int
    /** 道具名字 */
    readonly name: string
    /** 后台名字 */
    readonly itemName: string
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 装备位置：1头盔2衣服3裤子4护腕5腰带6鞋子 */
    readonly position: int
    /** 默认数量1，其他为单次使用上限数量 */
    readonly useMax: int
    /** 道具类型（1消耗品2材料3装备4战场药品10展示用道具11奇珍12神通13神器14时装15称号16符石17素萝皮肤18特权卡20宝箱21请神道具22青蛙23灵蝠24时装头部25月卡100货币 */
    readonly type: int
    /** 通用领奖界面中的道具icon排序(1神通2神器3时装4奇珍5货币6称号7消耗品8战场药品9材料10符石11装备) */
    readonly awardSort: int
    /** 展示弹窗，填1特殊展示，不填或者放空则不特殊展示 */
    readonly showItemAward: int
    /** 使用等级限制 */
    readonly lv: int
    /** 1是0否提示 */
    readonly tip: int
    /** 使用效果，类型1获得自由属性点，参数1填属性点值；类型2为物品宝箱，参数1填物品宝箱表的id；类型3为补充耐久度，参数1填增加耐久值；类型4为双倍资源卡，参数1填增加资源物品id，参数2填额外增加的万分比比例，新产出=产出+（1+万分比/10000），参数3填单次使用双倍卡后双倍效果生效的次数，参数4填使用双倍卡后获得的次数道具id；类型5为物品自选宝箱，参数1填物品自选宝箱表的id；类型6为素螺皮肤，参数1填增加素螺每日额外的攻击次数（可累加）；类型7为使用后解锁表情 */
    readonly effectType: int
    /** 效果值 */
    readonly value1?: any
    /** 效果值 */
    readonly value2?: any
    /** 效果值 */
    readonly value3?: any
    /** 效果值 */
    readonly value4?: any
    /** 图标id */
    readonly icon: int
    /** 物品效果描述 */
    readonly desc?: string
    /** 物品包装描述 */
    readonly storyDesc?: string
    /** 获取途径(关联getway表)这个最后处理 */
    readonly getway: any
    /** 跳转至商店，是否自动弹购买弹窗并选好数量(填写物品id)(备注:1仙晶坊2斗胜坊3山头坊4馈礼坊) */
    readonly autoBuy: any
    /** 回收补偿 */
    readonly recoup: any
}
declare type ConfKeyItem = int
// #endregion item.json

// #region item_box.json
interface IConfItem_boxAwards {
    /** id */
    readonly groupId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfItem_boxDetail {
    /** 掉落组id */
    readonly groupId: int
    /** id */
    readonly id: int
    /** 权重 */
    readonly pro: int
    /** 奖励 */
    readonly awards: IConfItem_boxAwards[]
}
interface IConfItem_box {
    /** id */
    readonly id: int
    /** 自动打开（0：否 1:是） */
    readonly autoOpen: int
    /** 1填是装备宝箱，0代表不是 */
    readonly boxType: int
    /** 属于装备宝箱时填等级，其他填01 */
    readonly lv: int
    /** 掉落id */
    readonly detail: IConfItem_boxDetail[]
}
declare type ConfKeyItem_box = int
// #endregion item_box.json

// #region item_call.json
interface IConfItem_call {
    /** 唯一ID */
    readonly id: int
    /** 道具名字 */
    readonly name: string
    /** 后台名字 */
    readonly itemName: string
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 装备位置：1头盔2衣服3裤子4护腕5腰带6鞋子 */
    readonly position: int
    /** 默认数量1，其他为单次使用上限数量 */
    readonly useMax: int
    /** 道具类型（1消耗品2材料3装备4战场药品10展示用道具11奇珍12神通13神器14时装15称号16符石17素萝皮肤18特权卡20宝箱100货币 */
    readonly type: int
    /** 法宝不同种族的资源调用 */
    readonly mores: ConfigReadonlyMap<int, IConfItem_callMore>
}
interface IConfItem_callGem {
    /** 序列号 */
    readonly id: int
    /** 种族id */
    readonly race: int
    /** 名字 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 资源图片 */
    readonly icon: int
}
interface IConfItem_callMore {
    /** 序列号 */
    readonly id: int
    /** id */
    readonly moreId: int
    /** 名字 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 资源图片 */
    readonly icon: int
    /** 法宝对应的宝石 */
    readonly gem: ConfigReadonlyMap<int, IConfItem_callGem>
}
declare type ConfKeyItem_call = int
// #endregion item_call.json

// #region item_draw.json
interface IConfItem_draw {
    /** 唯一ID */
    readonly id: int
    /** 道具名字 */
    readonly name: string
    /** 后台名字 */
    readonly itemName: string
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 装备位置：1头盔2衣服3裤子4护腕5腰带6鞋子 */
    readonly position: int
    /** 默认数量1，其他为单次使用上限数量 */
    readonly useMax: int
    /** 道具类型（1消耗品2材料3装备4战场药品10展示用道具11奇珍12神通13神器14时装15称号16符石17素萝皮肤18特权卡20宝箱100货币 */
    readonly type: int
    /** 法宝不同种族的资源调用 */
    readonly more: IConfItem_drawMore[]
}
interface IConfItem_drawGem {
    /** 序列号 */
    readonly id: int
    /** 种族id */
    readonly race: int
    /** 名字 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 资源图片 */
    readonly icon: int
}
interface IConfItem_drawMore {
    /** 序列号 */
    readonly id: int
    /** 名字 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 资源图片 */
    readonly icon: int
    /** 法宝对应的宝石 */
    readonly gem: ConfigReadonlyMap<int, IConfItem_drawGem>
}
declare type ConfKeyItem_draw = int
// #endregion item_draw.json

// #region item_optional_box.json
interface IConfItem_optional_boxDetail {
    /** id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfItem_optional_box {
    /** id */
    readonly id: int
    /** 自选箱类型（1材料包2奇珍箱） */
    readonly type: int
    /** 宝箱内详细内容 */
    readonly detail: ConfigReadonlyMap<int, IConfItem_optional_boxDetail>
}
declare type ConfKeyItem_optional_box = int
// #endregion item_optional_box.json

// #region kui_cow.json
interface IConfKui_cowAwards1 {
    /** 怪物等级 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfKui_cowAwards2 {
    /** 怪物等级 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfKui_cowAwards3 {
    /** 怪物等级 */
    readonly id: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfKui_cowAwards4 {
    /** 怪物等级 */
    readonly id: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfKui_cowShowAwards {
    /** 怪物等级 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
    /** 1=非归属数量(排序排第4),2=非归属概率(排序排第2),3=归属数量(排序排第3),4=归属概率(排序排第1) */
    readonly special: int
}
interface IConfKui_cow {
    /** 怪物等级 */
    readonly id: int
    /** 怪物id */
    readonly monsterId: int
    /** 场景重进cd */
    readonly cd: int
    /** 复活CD */
    readonly resurrection: int
    /** 固定掉落，获得者：非归属玩家和归属玩家 */
    readonly awards1: IConfKui_cowAwards1[]
    /** 归属额外掉落，获得者：归属玩家 */
    readonly awards2: IConfKui_cowAwards2[]
    /** 非归属概率掉落，获得者：非归属玩家 */
    readonly awards3: IConfKui_cowAwards3[]
    /** 归属概率掉落，获得者：归属玩家 */
    readonly awards4: IConfKui_cowAwards4[]
    /** 展示掉落 */
    readonly showAwards: IConfKui_cowShowAwards[]
}
declare type ConfKeyKui_cow = int
// #endregion kui_cow.json

// #region kui_cow_open.json
interface IConfKui_cow_open {
    /** 序号 */
    readonly id: int
    /** 怪物等级 */
    readonly monsterLv: int
    /** 需要达到的玩家数量 */
    readonly needNum: int
    /** 玩家境界 */
    readonly realmId: int
}
declare type ConfKeyKui_cow_open = int
// #endregion kui_cow_open.json

// #region level.json
interface IConfLevelAwards {
    /** id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfLevel {
    /** 等级 */
    readonly id: int
    /** 需要修为，升到下一级的需要 */
    readonly exp: int
    /** 累计修为 */
    readonly expAdd: int
    /** 精力上限 */
    readonly powerLimit: int
    /** 力量 */
    readonly strength: int
    /** 耐力 */
    readonly endurance: int
    /** 体质 */
    readonly constitution: int
    /** 属性果使用上限 */
    readonly pillLimit: number
    /** 种族额外属性(根据推荐加点给) */
    readonly additionAttr: int
    /** 升级奖励 */
    readonly awards: IConfLevelAwards[]
}
declare type ConfKeyLevel = int
// #endregion level.json

// #region list.json
interface IConfList {
    /** 活动名称 */
    readonly activityName: string
    /** 活动类型 */
    readonly typeActivityName: string
    /** 备注 */
    readonly name: string
    /** 活动描述 */
    readonly desc?: string
    /** 活动入口icon配置(填写资源名) */
    readonly icon?: string
    /** 活动入口显示标签(不填则不显示) */
    readonly tag?: string
    /** 1需要跨服 */
    readonly crossType: int
    /** 数据来源 （0表示走固定配置表，1表示走活动导刷导刷单个配置对象，2表示走活动导刷导刷整个配置表） */
    readonly fromDB: int
    /** 表名 */
    readonly fromName: string
    /** 平台类型: */
    readonly platform?: string
    /** 平台id(渠道不开） */
    readonly spid?: string
    /** 需要额外信息 */
    readonly toList: string
    /** 类型，initTime和openTime和set和normal */
    readonly openBy: string
    /** 开服第几天 */
    readonly openDay: int
    /** 持续天数 */
    readonly lastDays?: number
}
declare type ConfKeyList = string
// #endregion list.json

// #region lode.json
interface IConfLode {
    /** 地图id */
    readonly id: int
    /** 地图名称 */
    readonly name: string
    /** 境界 */
    readonly realm: int
    /** 位置总数 */
    readonly placeNum: int
    /** 怪物id */
    readonly monster: int
    /** 每分钟产量 */
    readonly awards: IConfLodeAwards[]
}
interface IConfLodeAwards {
    /** 地图id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
declare type ConfKeyLode = int
// #endregion lode.json

// #region love.json
interface IConfLove {
    /** 行为类型 */
    readonly id: int
    /** 获取奖励需要进行该行为的次数 */
    readonly target: int
    /** 单次奖励爱心值数量 */
    readonly awardNum: int
    /** 当天能够获取奖励的次数 */
    readonly dailyTimes: int
}
declare type ConfKeyLove = int
// #endregion love.json

// #region mail.json
interface IConfMail {
    /** 邮件id */
    readonly id: int
    /** 邮件标题 */
    readonly title: string
    /** 重要0普通1重要 */
    readonly important: number
    /** 邮件内容 */
    readonly desc: string
}
declare type ConfKeyMail = int
// #endregion mail.json

// #region main_task.json
interface IConfMain_taskAwards {
    /** id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfMain_taskPlot {
    /** id */
    readonly id: int
    /** 任务id的pid */
    readonly pid: int
    /** 0直接结束对话 */
    readonly nextPid: any
    /** 1剧情2选项 */
    readonly type: int
    /** 0旁白1玩家2NPC */
    readonly role: int
    /** 展示左边npc的id */
    readonly leftNpc: int
    /** npc名字 */
    readonly leftNpcName: string
    /** 展示右边npc的id */
    readonly rightNpc: int
    /** npc名字 */
    readonly rightNpcName: string
    /** 说话的npc（0:表示其他 1：左边 2：右边） */
    readonly talkNpc: int
    /** 对话文本 */
    readonly talkText: string
    /** 配音 */
    readonly res: string
    /** 特殊类型，1为在地图创建npc，2为在地图创建怪物，3为在地图创建被采集的npc */
    readonly specialType: int
    /** 地图id */
    readonly mapId: int
    /** 创建的npc的id */
    readonly createNpc: any
    /** 怪物id */
    readonly monsterId: int
    /** 采集时间 */
    readonly collection: int
    /** 采集获得的文本提示 */
    readonly tipText: string
}
interface IConfMain_task {
    /** id */
    readonly id: int
    /** 下一个ID的值，0代表最后一个任务 */
    readonly nextId: int
    /** 任务奖励绑定的id */
    readonly awardID: int
    /** 1自动下个任务 */
    readonly auto: int
    /** 主线序号 */
    readonly order: int
    /** 名称 */
    readonly name: string
    /** 简要描述 */
    readonly text: string
    /** 调用任务类型表的id */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
    /** 配置1接收到任务后再开始统计进度 */
    readonly dataStart: int
    /** 资源 */
    readonly res?: string
    /** 获取途径，配道具id */
    readonly getWay: int
    /** 剧情对话id（读polt表） */
    readonly plotID: int
    /** 跳转 */
    readonly goto: any
    /** 剧情 */
    readonly plot: IConfMain_taskPlot[]
    /** 奖励 */
    readonly awards: IConfMain_taskAwards[]
    /** 跳过按钮（配置1不出现，0默认出现） */
    readonly skip: int
}
declare type ConfKeyMain_task = int
// #endregion main_task.json

// #region map_buff.json
interface IConfMap_buff {
    /** buffid */
    readonly id: int
    /** buff名称 */
    readonly name: string
    /** buff效果类型 */
    readonly effectType: int
    /** 数值 */
    readonly value: int
    /** 最少生效人数 */
    readonly playerMinNum: int
    /** 最高生效人数 */
    readonly playerMaxNum: int
    /** 图标 */
    readonly icon: int
    /** 描述 */
    readonly desc: string
    /** buff提示文本 */
    readonly valueTip: string
    /** 箭头方向1提升2降低 */
    readonly arrow: int
}
declare type ConfKeyMap_buff = int
// #endregion map_buff.json

// #region mission.json
interface IConfMissionAwards1 {
    /** 地图ID */
    readonly mapId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfMissionAwards2 {
    /** 地图ID */
    readonly mapId: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfMissionAwards3 {
    /** 地图ID */
    readonly mapId: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfMissionExAwards {
    /** 地图ID */
    readonly mapId: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfMissionMore {
    /** 地图ID */
    readonly mapId: int
    /** 类型1装备历练2元神历练3法宝历练 */
    readonly id: int
    /** 怪物id */
    readonly monsterId: int
    /** 进入等级 */
    readonly lv: int
    /** 不可进入等级 */
    readonly lvLimit: int
    /** 是否有排名奖励 */
    readonly isRankAwards: int
    /** 1.非归属是否有补偿奖励 */
    readonly isOffset: int
    /** 地图资源 */
    readonly mapRes: int
    /** 场景重进cd */
    readonly cd: int
    /** bossBuff相关 */
    readonly bossBuff: any
    /** 玩家buff */
    readonly playerBuff: any
    /** 固定掉落 */
    readonly awards1: IConfMissionAwards1[]
    /** 概率掉落 */
    readonly awards2: IConfMissionAwards2[]
    /** 随机掉落 */
    readonly awards3: IConfMissionAwards3[]
    /** 归属者额外概率掉落 */
    readonly exAwards: IConfMissionExAwards[]
    /** 非归属者补偿概率掉落 */
    readonly offsetAwards: IConfMissionOffsetAwards[]
    /** 展示掉落 */
    readonly showAwards: IConfMissionShowAwards[]
    /** 死亡后重生时间（秒）（-1则，按固定时间刷新） */
    readonly resetCd: int
    /** 定点重置时间(HH:MM:SS,HH:MM:SS,) */
    readonly resetTime: string
}
interface IConfMissionOffsetAwards {
    /** 地图ID */
    readonly mapId: int
    /** 奖励道具，填0代表不获得道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfMissionShowAwards {
    /** 地图ID */
    readonly mapId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
    /** 1=非归属数量(排序排第4),2=非归属概率(排序排第2),3=归属数量(排序排第3),4=归属概率(排序排第1) */
    readonly special: int
}
interface IConfMission {
    /** 类型1装备历练2元神历练3法宝历练 */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 掉落描述 */
    readonly desc: string
    /** 每日免费次数 */
    readonly times: int
    /** 详细内容 */
    readonly more: ConfigReadonlyMap<int, IConfMissionMore>
}
declare type ConfKeyMission = int
// #endregion mission.json

// #region mission_buy.json
interface IConfMission_buyMore {
    /** 类型1装备历练2元神历练3法宝历练 */
    readonly id: int
    /** 第X次购买 */
    readonly times: int
    /** 消耗道具1；2个消耗选择一种 */
    readonly costPropId1: int
    /** 消耗数量1 */
    readonly costNum1: int
    /** 消耗道具2；2个消耗选择一种 */
    readonly costPropId2: int
    /** 消耗数量2 */
    readonly costNum2: int
}
interface IConfMission_buy {
    /** 类型1装备历练2元神历练3法宝历练 */
    readonly id: int
    /** 可购买次数 */
    readonly times: int
    /** 购买消耗 */
    readonly more: ConfigReadonlyMap<int, IConfMission_buyMore>
}
declare type ConfKeyMission_buy = int
// #endregion mission_buy.json

// #region monster.json
interface IConfMonster {
    /** 怪物id */
    readonly id: int
    /** 怪物名称 */
    readonly name: string
    /** 怪物动画 */
    readonly spine: int
    /** 怪物动画脚下是否有云(1是0否)，不填默认不展示 */
    readonly showCloud: int
    /** 怪物资源 */
    readonly icon: int
    /** 头像框 */
    readonly cShow?: string
    /** 闲暇状态
空:无
1:有闲暇状态 */
    readonly leisure: int
    /** 血条框 */
    readonly equipMaster?: string
    /** 境界 */
    readonly realm: int
    /** 攻速 */
    readonly speed: int
    /** 境界名称类型(1读妖怪境界，2读人形怪境界) */
    readonly realmType: int
    /** 等级 */
    readonly level: int
    /** 1boss2小怪3任务怪4竞技场假人5保护罩 */
    readonly type: int
    /** 评分 */
    readonly fp: int
    /** 攻击值 */
    readonly atk: int
    /** 防御值 */
    readonly def: int
    /** 生命值 */
    readonly hp: int
    /** 额外命中 */
    readonly hit: int
    /** 闪避 */
    readonly dodge: int
    /** 额外高级属性 */
    readonly exAttr: any
    /** 基础法力 */
    readonly baseMana: int
    /** 法力上限 */
    readonly maxMana: int
    /** 法力条数上限 */
    readonly skillMaxTimes: int
    /** 怪物技能ID，没填代表这个怪物不是攻击怪 */
    readonly skillIds: any
    /** 种族-除竞技场机器人怪，其他为怪物弹道使用 */
    readonly race: int
    /** 性别 */
    readonly sex: int
}
declare type ConfKeyMonster = int
// #endregion monster.json

// #region name.json
interface IConfName {
    /** id */
    readonly id: number
    /** 名字A */
    readonly name1: string
    /** 男 */
    readonly name_m: string
    /** 女 */
    readonly name_f: string
}
declare type ConfKeyName = any
// #endregion name.json

// #region npc.json
interface IConfNpc {
    /** npcId */
    readonly id: int
    /** npc名称
类型1取玩家昵称
类型3取玩家昵称 */
    readonly name: string
    /** 0、不展示形象1、主角（读取主角名字和形象）2、素萝（取素萝形象）3、妖盟盟主（取盟主形象和名字）4、npc;5、拍卖师 */
    readonly type: int
    /** npc形象
类型4npc需填写具体值 */
    readonly spine: int
}
declare type ConfKeyNpc = int
// #endregion npc.json

// #region param.json
interface IConfParam {
    /** 类型 */
    readonly type: string
    /** 值 */
    readonly value: any
}
declare type ConfKeyParam = string
// #endregion param.json

// #region peach_orchard.json
interface IConfPeach_orchard {
    /** id */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 摸鱼概率（按万分比各自随机，都不睡眠时，按权重保底随1只） */
    readonly sleepProb: int
    /** 等级详情 */
    readonly detail: ConfigReadonlyMap<int, IConfPeach_orchardDetail>
    /** 状态相关 */
    readonly mode: IConfPeach_orchardMode[]
    /**  */
    readonly privilegeId: int
}
interface IConfPeach_orchardDetail {
    /** 等级 */
    readonly lv: int
    /** id */
    readonly id: int
    /** 蛤蟆形象资源 */
    readonly res: int
    /** 升级消耗 */
    readonly costPropId: int
    /** 消耗数量 */
    readonly costNum: int
    /** 收获道具id */
    readonly cropsPropId: int
    /** 收获桃子数量 */
    readonly cropsNum: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
}
interface IConfPeach_orchardMode {
    /** id */
    readonly id: int
    /** 1成熟2摸鱼3工作状态 */
    readonly type: int
    /** 权重 */
    readonly prob: int
    /** 对应状态资源 */
    readonly modeRes: int
    /** 备注 */
    readonly desc: string
    /** 气泡框概率 */
    readonly boxPro: int
    /** 出现气泡框后，概率出表情、配音，剩余显示对话 */
    readonly emojiPro: int
    /** 出现气泡框后，概率出表情、配音，剩余显示对话 */
    readonly audioPro: int
    /** 随机表情 */
    readonly emoji: any
    /** 随机配音 */
    readonly audio: any
    /** 对话文本 */
    readonly tips: string
    /** 点击触发文本 */
    readonly clickTip: string
    /** 各动作持续时间（毫秒） */
    readonly time: int
    /** 各动作对应音效 */
    readonly audioId?: string
}
declare type ConfKeyPeach_orchard = int
// #endregion peach_orchard.json

// #region peach_orchard_audio.json
interface IConfPeach_orchard_audio {
    /** id */
    readonly id: int
    /** 音效类型
1:进场配音
2:场景内停留配音 */
    readonly audioType: int
    /** 到音效表寻找对应文件 */
    readonly audioId: string
}
declare type ConfKeyPeach_orchard_audio = int
// #endregion peach_orchard_audio.json

// #region phy_buy.json
interface IConfPhy_buy {
    /** 当前购买次数 */
    readonly id: int
    /** 购买获得的道具id */
    readonly propId: int
    /** 购买获得的数量 */
    readonly num: int
    /** 消耗的道具id */
    readonly costId: int
    /** 售卖的道具数量 */
    readonly costNum: int
    /** 限购种类(1每日限购，2每周限购，3每月限购，4终生限购。-1则不限购) */
    readonly buyLimitType: int
}
declare type ConfKeyPhy_buy = int
// #endregion phy_buy.json

// #region plot.json
interface IConfPlot {
    /** id */
    readonly id: int
    /** 步骤id */
    readonly pid: int
    /** 0直接结束对话 */
    readonly nextPid: any
    /** 链接剧情，一个剧情的最后一句允许填剧情大ID,播完继续播 */
    readonly linkPlot: int
    /** 1剧情/2选项/3黑幕转场（通用类型）/4开场演出互动/5创角后的剧情/6起名/7马灵官中/8王大壮出场/9天兵全被打倒/12纯黑幕转场 */
    readonly type: int
    /** 额外参数，演出的时候配合动效使用 */
    readonly extParam: any
    /** 展示左边npc的id */
    readonly leftNpc: int
    /** 展示右边npc的id */
    readonly rightNpc: int
    /** 说话的npc（0:表示其他 1：左边 2：右边） */
    readonly talkNpc: int
    /** 说话者的表情插槽（angry生气） */
    readonly emoji?: string
    /** 是否隐藏遮罩 */
    readonly hideMask: int
    /** 播放bgm */
    readonly bgm?: string
    /** 播放音效 */
    readonly sound?: string
    /** 对话文本 */
    readonly talkText?: string
}
declare type ConfKeyPlot = int
// #endregion plot.json

// #region practice.json
interface IConfPracticeBossAwards1 {
    /** BOSS */
    readonly bossId: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfPracticeBossAwards2 {
    /** BOSS */
    readonly bossId: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfPracticeBossAwards3 {
    /** BOSS */
    readonly bossId: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfPracticeLittleMonster {
    /** 地图id */
    readonly id: int
    /** 小怪的怪物id */
    readonly monsterId: int
    /** 顺序 */
    readonly order: int
}
interface IConfPracticeLittleMonsterAward1 {
    /** 地图id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfPracticeLittleMonsterAward2 {
    /** 地图id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfPracticeMore {
    /** BOSS的怪物id */
    readonly bossId: int
    /** 地图id */
    readonly id: int
    /** 顺序 */
    readonly order: int
    /** 波次 */
    readonly waveOrder: int
    /** 小怪数量 */
    readonly monsterNum: int
    /** 单批次数量 */
    readonly batchNum: int
    /** BOSS挑战时间 */
    readonly bossTime: int
    /** BOSS固定击杀掉落1 */
    readonly bossAwards1: IConfPracticeBossAwards1[]
    /** BOSS权重随机击杀掉落2 */
    readonly bossAwards2: IConfPracticeBossAwards2[]
    /** BOSS固定击杀掉落3，直接掉落进背包 */
    readonly bossAwards3: IConfPracticeBossAwards3[]
}
interface IConfPracticeNpcAwards {
    /** 地图id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfPracticeWait {
    /** 地图id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfPractice {
    /** 地图id */
    readonly id: int
    /** 地图名称 */
    readonly name: string
    /** 地图等级 */
    readonly mapLv: int
    /** 背景音效，跳转到audio表 */
    readonly audio: string
    /** 标签资源，功或者灵 */
    readonly res?: string
    /** 地图资源 */
    readonly mapRes: int
    /** 地图标签 */
    readonly mapTag: int
    /** 玩家进入需要等级 */
    readonly entLv: int
    /** 玩家X级展示出来 */
    readonly showLv: int
    /** 地图怪物波次详细数据 */
    readonly more: ConfigReadonlyMap<int, IConfPracticeMore>
    /** 地图小怪随机库信息 */
    readonly littleMonster: IConfPracticeLittleMonster[]
    /** 小怪固定击杀掉落1 */
    readonly littleMonsterAward1: IConfPracticeLittleMonsterAward1[]
    /** 小怪权重随机击杀掉落2 */
    readonly littleMonsterAward2: IConfPracticeLittleMonsterAward2[]
    /** NPC的单次点击的奖励 */
    readonly npcAwards: IConfPracticeNpcAwards[]
    /** 挂机奖励 */
    readonly wait: IConfPracticeWait[]
    /** 多人地图id */
    readonly newId: int
}
declare type ConfKeyPractice = int
// #endregion practice.json

// #region practice_multi.json
interface IConfPractice_multiAwards1 {
    /** 怪物组 */
    readonly sort: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfPractice_multiAwards2 {
    /** 怪物组 */
    readonly sort: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 随机权重，总权重代表100% */
    readonly pro: int
}
interface IConfPractice_multiMore {
    /** 怪物组 */
    readonly sort: int
    /** 地图id */
    readonly id: int
    /** 怪物id */
    readonly monsterId: int
    /** 1boss2小怪 */
    readonly type: int
    /** 刷怪数量 */
    readonly monsterNum: int
    /** 复活时间，秒 */
    readonly time: int
    /** 消耗道具 */
    readonly costPropId: int
    /** 消耗数量 */
    readonly costNum: int
    /** 怪击杀掉落 */
    readonly awards1: IConfPractice_multiAwards1[]
    /** 怪击杀概率掉落 */
    readonly awards2: IConfPractice_multiAwards2[]
    /** 展示掉落 */
    readonly showAwards: IConfPractice_multiShowAwards[]
}
interface IConfPractice_multiShowAwards {
    /** 怪物组 */
    readonly sort: int
    /** 奖励道具 */
    readonly propId: int
    /** 数量 */
    readonly num: int
    /** 1=非归属数量(排序排第4),2=非归属概率(排序排第2),3=归属数量(排序排第3),4=归属概率(排序排第1) */
    readonly special: int
}
interface IConfPractice_multi {
    /** 地图id */
    readonly id: int
    /** 地图名称 */
    readonly name: string
    /** 地图等级 */
    readonly mapLv: int
    /** 背景音效，跳转到audio表 */
    readonly audio: string
    /** 标签资源，功或者灵 */
    readonly res?: string
    /** 地图资源 */
    readonly mapRes: int
    /** 地图标签 */
    readonly mapTag: int
    /** 场景重进cd */
    readonly cd: int
    /** 玩家进入需要等级 */
    readonly entLv: int
    /** 玩家X级展示出来 */
    readonly showLv: int
    /** 怪物详细数据 */
    readonly more: ConfigReadonlyMap<int, IConfPractice_multiMore>
    /** 战场背景图 */
    readonly bgRes: int
    /** 个人地图id */
    readonly newId: int
}
declare type ConfKeyPractice_multi = int
// #endregion practice_multi.json

// #region preload_prefab.json
interface IConfPreload_prefab {
    /** 预制名字 */
    readonly prefab: string
    /** widget显示后开始预处理（默认只要满足条件就处理） */
    readonly widgetVisible?: string
    /** 对应系统id(默认不配置则不需要判断系统是否解锁) */
    readonly systemId?: number
    /** 是否预加载处理（默认只预下载，1:预加载注意：非常驻预制需要自己维护卸载逻辑） */
    readonly load?: number
    /** 在登录界面处理 */
    readonly inLogin?: number
}
declare type ConfKeyPreload_prefab = string
// #endregion preload_prefab.json

// #region privilege_card.json
interface IConfPrivilege_card {
    /** id */
    readonly id: int
    /** 物品表对应id */
    readonly itemId: int
    /** 充值id */
    readonly rechargeId: int
    /** 特权卡 */
    readonly name: string
    /** 特殊增益，1代表素罗自动攻击，2代表去除广告 */
    readonly specialGain: int
    /** 特权卡描述 */
    readonly desc: string
    /** 特权卡描述富文本icon资源 */
    readonly descIcon: any
    /** 特权卡权益描述 */
    readonly equityDesc: string
    /** 权益描述富文本icon资源 */
    readonly equityDescIcon: any
    /** 倍率 */
    readonly discount: int
    /** 额外精力值 */
    readonly exEnergy: int
    /** 每日可额外在素罗处领取的攻击次数 */
    readonly npcAtkTimes: int
    /** 有效时间/天 */
    readonly days: int
    /** 额外购买不超过有效时间/天 */
    readonly moreDays: int
    /** 每日奖励 */
    readonly dailyAwards: IConfPrivilege_cardDailyAwards[]
    /** 一次性奖励 */
    readonly awards: IConfPrivilege_cardAwards[]
    /** 填写额外掉落的道具id */
    readonly dropPropId: int
    /** 填写额外掉落的比例(万分比) */
    readonly dropPropDiscount: int
}
interface IConfPrivilege_cardAwards {
    /** id */
    readonly id: int
    /** 道具 */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfPrivilege_cardDailyAwards {
    /** id */
    readonly id: int
    /** 道具 */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
declare type ConfKeyPrivilege_card = int
// #endregion privilege_card.json

// #region product_id.json
interface IConfProduct_id {
    /** 渠道产品id */
    readonly productId: int
    /** 产品名称 */
    readonly productName: string
    /** RMB人民币 */
    readonly recharge: int
}
declare type ConfKeyProduct_id = int
// #endregion product_id.json

// #region question_condition.json
interface IConfQuestion_condition {
    /** 调用任务类型表的id */
    readonly id: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly target1: int
    /** 参数值 */
    readonly target2: int
}
declare type ConfKeyQuestion_condition = int
// #endregion question_condition.json

// #region race.json
interface IConfRace {
    /** 种族1蟒天蛟2青鸾鸟3九尾狐 */
    readonly id: int
    /** 种族名字 */
    readonly name: string
    /** 种族名字 */
    readonly nickname: string
    /** 普攻技能id */
    readonly skillId: int
    /** 妖术id */
    readonly gongSorceryId: any
    /** 推荐属性类型id */
    readonly recommendAttrId: int
}
declare type ConfKeyRace = int
// #endregion race.json

// #region rank.json
interface IConfRankAttribute {
    /** 冲榜名称 */
    readonly name: string
    /** 数据key(格式化类型:null不需要格式化) */
    readonly formatValue: string
    /** 排行榜的中文表头 */
    readonly columnTitle?: string
    /** 宽度预设1 */
    readonly weight: int
    /** 关联字段 */
    readonly prefabName: string
    /** 字体颜色 */
    readonly color?: string
    /** 高度 */
    readonly height: int
}
interface IConfRank {
    /** 榜单名称 */
    readonly name: string
    /** 榜单名字 */
    readonly desc: string
    /** 活动名称 */
    readonly activityName?: string
    /** 榜单成员类型（玩家:User,联盟:Guild,区服:Server） */
    readonly memberType?: string
    /** 排行榜属于哪个banner(1个人榜，2装备榜，3山头榜，4副本榜)，活动榜单不填 */
    readonly bannerType: int
    /** 排行子榜在banner中的排序 */
    readonly sort: int
    /** 是否是跨服榜单(0:本服，1：跨服) */
    readonly isCross: int
    /** 榜单类型（个人：l，山头：guild） */
    readonly rankType: string
    /** 排行榜前N名组件类型 */
    readonly rankTop?: string
    /** 自己排行数据组件类型（默认组件default，不填则不显示自己排行数据） */
    readonly rankSelf: string
    /** 排行数据统计类型(1当前值，2活动期间的涨幅值)(仅活动榜单使用) */
    readonly dataType: int
    /** 排行榜类型(目前仅冲榜活动使用，用于充值礼包背景展示)(1角色/装备类冲榜，2元神类冲榜，3法宝类冲榜) */
    readonly systemType: int
    /** 属性 */
    readonly attribute: IConfRankAttribute[]
    /** 是否可点赞(1是0否) */
    readonly isRankLike: int
    /** 排行榜最多可显示多少条信息(-1则无上限) */
    readonly maxNum: int
    /** 排行依据描述 */
    readonly base: string
}
declare type ConfKeyRank = string
// #endregion rank.json

// #region rank_awards.json
interface IConfRank_awards {
    /** 天数范围 */
    readonly minDay: int
    /** 天数范围 */
    readonly maxDay: int
    /** 参照等级 */
    readonly lv: int
    /** 灵气或妖气基础数量(每份=1/24) */
    readonly num: int
}
declare type ConfKeyRank_awards = int
// #endregion rank_awards.json

// #region rank_boss.json
interface IConfRank_boss {
    /** 系统id */
    readonly id: int
    /** 备注 */
    readonly systemName: string
    /** 伤害榜 */
    readonly rank1: ConfigReadonlyMap<int, IConfRank_bossRank1>
    /** 治疗榜 */
    readonly rank2: ConfigReadonlyMap<int, IConfRank_bossRank2>
    /** 控制榜 */
    readonly rank3: ConfigReadonlyMap<int, IConfRank_bossRank3>
}
interface IConfRank_bossAwards1 {
    /** 名次 */
    readonly rank: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfRank_bossAwards2 {
    /** 名次 */
    readonly rank: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfRank_bossAwards3 {
    /** 名次 */
    readonly rank: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfRank_bossRank1 {
    /** 名次 */
    readonly rank: int
    /** 系统id */
    readonly id: int
    /** 奖励 */
    readonly awards1: IConfRank_bossAwards1[]
}
interface IConfRank_bossRank2 {
    /** 名次 */
    readonly rank: int
    /** 系统id */
    readonly id: int
    /** 奖励 */
    readonly awards2: IConfRank_bossAwards2[]
}
interface IConfRank_bossRank3 {
    /** 名次 */
    readonly rank: int
    /** 系统id */
    readonly id: int
    /** 奖励 */
    readonly awards3: IConfRank_bossAwards3[]
}
declare type ConfKeyRank_boss = int
// #endregion rank_boss.json

// #region realm.json
interface IConfRealmAttrs {
    /** 境界id */
    readonly id: int
    /** 属性类型 */
    readonly attrType: int
    /** 值，万分比 */
    readonly value: int
}
interface IConfRealmAwards {
    /** id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfRealmMore {
    /** 序号 */
    readonly sort: int
    /** id */
    readonly id: int
    /** 种族1蟒天蛟2青鸾鸟3九尾狐 */
    readonly race: int
    /** 资源 */
    readonly icon?: string
}
interface IConfRealmNeed {
    /** 序号 */
    readonly sort: int
    /** id */
    readonly id: int
    /** 调用任务类型表的id */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
}
interface IConfRealm {
    /** 序号 */
    readonly id: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 妖怪境界名称 */
    readonly name: string
    /** 人形怪境界名称 */
    readonly name1: string
    /** 该境界的角色等级上限 */
    readonly levelLimit: int
    /** 攻速（毫秒） */
    readonly atkSpeed: int
    /** 文字描述 */
    readonly desc?: string
    /** 加成描述，百分比值 */
    readonly desc1: int
    /** 减免描述 */
    readonly desc2: int
    /** 形象资源，根据种族走 */
    readonly more: IConfRealmMore[]
    /** 升到当前境界的条件 */
    readonly need: IConfRealmNeed[]
    /** 好友数量 */
    readonly friendNum: number
    /** 该强度的属性加成 */
    readonly attrs: IConfRealmAttrs[]
    /** 提升到当前境界的奖励 */
    readonly awards: IConfRealmAwards[]
    /** 境界boss */
    readonly monsterId: int
    /** 地图资源 */
    readonly mapRes: int
    /** 战斗时间 */
    readonly battleTime: int
    /** cd（再次渡劫cd，邀请无cd） */
    readonly cd: int
    /** 协助者属性（界面固定5个） */
    readonly helperNum: int
    /** 护罩血量（主角血量万分比） */
    readonly shieldHp: int
    /** 护罩（每个助战增加万分比） */
    readonly shieldHelperAdd: int
    /** 护盾id（读怪物表） */
    readonly shieldId: int
    /** 境界形象妖力 */
    readonly fp: int
    /** 境界形象颜值 */
    readonly showValue: int
    /** 境界形象穿戴描述 */
    readonly shwoDesc: string
    /** 境界形象初始耐久 */
    readonly durable: int
}
declare type ConfKeyRealm = int
// #endregion realm.json

// #region recharge.json
interface IConfRecharge {
    /** 充值ID */
    readonly id: int
    /** 英文版本计费点 */
    readonly rechargeEng: int
    /** 产品名称 */
    readonly productName: string
    /** 1充值档，2特权，3触发，5日礼包，6终生礼包，7基金，8首充礼包，9日循环礼包101角色等级冲榜 礼包，102法宝等级冲榜礼包，103元神等级冲榜礼包，104元神点掉落冲榜礼包，105灵气掉落冲榜礼包，106限时礼包，107鏖战天庸礼包，108装备评分冲榜礼包，109元神评分冲榜礼包，110法宝评分冲榜礼包 */
    readonly type: int
    /** 名字1 */
    readonly name: string
    /** 图标 */
    readonly icon?: string
    /** 描述 */
    readonly desc: string
    /** vip经验 */
    readonly vipExp: int
    /** 获得的物品id */
    readonly propId: int
    /** 国内奖励 */
    readonly num: int
    /** 国内额外元宝 */
    readonly exNum?: number
    /** 充值 */
    readonly recharge: int
    /** 首次翻倍 */
    readonly firstChargeDouble: int
    /** 限购次数 */
    readonly dayLimit: int
    /** 总次数 */
    readonly totalLimit: int
    /** 代币支付数量 */
    readonly scrip_cn: int
    /** 渠道产品id */
    readonly productId: int
}
declare type ConfKeyRecharge = int
// #endregion recharge.json

// #region server_error_code.json
interface IConfServer_error_code {
    /** 错误码 */
    readonly id: int
    /** 错误描述 */
    readonly msg: string
    /** 服务端错误key */
    readonly key: string
}
declare type ConfKeyServer_error_code = int
// #endregion server_error_code.json

// #region seven_day_sign.json
interface IConfSeven_day_signAwards {
    /** 天数 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfSeven_day_sign {
    /** id */
    readonly id: number
    /** 奖励 */
    readonly awards: IConfSeven_day_signAwards[]
}
declare type ConfKeySeven_day_sign = any
// #endregion seven_day_sign.json

// #region shop.json
interface IConfShopContent {
    /** 商店唯一id */
    readonly id: int
    /** 商品唯一id */
    readonly goodsId: int
    /** 商品排序 */
    readonly sort: int
    /** 商品唯一批次id */
    readonly lotId: int
    /** 是否为限时商品(0否，1时间段类，2持续时间类) */
    readonly isTimeLimit: int
    /** 限时商品上架时间(若为限时商品则必填，不填报错)(时间段类填时间戳；持续时间类填持续时间，单位:秒) */
    readonly timeLimit: any
    /** 商品标签样式(配0或不配则不展示) */
    readonly tag: int
    /** 标签文字 */
    readonly zh_cn?: string
    /** 购买获得的道具id */
    readonly propId: int
    /** 购买获得的数量 */
    readonly num: int
    /** 售卖的道具id */
    readonly costId: int
    /** 售卖的道具数量 */
    readonly costNum: int
    /** 是否采用权重随机，1代表使用，0代表不适用 */
    readonly isWeight: int
    /** 权重 */
    readonly pro: int
    /** 物品解锁类型，类型1是等级解锁，参数填等级值；类型2是山头等级解锁，参数填山头等级值 */
    readonly unlockItemType: int
    /** 解锁参数值 */
    readonly unlockItemValue: int
    /** 限购种类(1每日限购，2每周限购，3每月限购，4终生限购。-1则不限购，100活动期间限购) */
    readonly buyLimitType: int
    /** 限购次数(-1无限次) */
    readonly buyLimitNum: int
    /** 每次购买涨价的幅度，计算为售卖价值*涨价幅度，取下整，涨价幅度为万分比 */
    readonly increase: int
    /** 客户端折扣比例,填写实际折扣倍数(如7折填70；不打折填100，-1默认不打折) */
    readonly discount: int
}
interface IConfShopManualRefresh {
    /** 商店唯一id */
    readonly id: int
    /** 刷新第X次 */
    readonly time: int
    /** 消耗道具(填物品id) */
    readonly costItem: int
    /** 消耗数量 */
    readonly costNum: int
}
interface IConfShop {
    /** 商店唯一 id */
    readonly id: int
    /** 1常驻商店2限时商店（活动时间） */
    readonly type: int
    /** 商店标题 */
    readonly name: string
    /** 商店英文名,程序使用 */
    readonly enName: string
    /** 关联系统id */
    readonly systemId: int
    /** 商店看板娘图片资源 */
    readonly icon: int
    /** 商店解锁方式(1解锁对应功能后解锁,value为功能id；-1默认解锁) */
    readonly unlockType: int
    /** 解锁参数 */
    readonly unlockValue: int
    /** 商店中可展示最大商品数量(-1则无限制) */
    readonly showNum: int
    /** 商店轮替时间类型(0不轮替1每日0点2每周一0点3每月1号0点，时间以现实时间为准) */
    readonly rotateTime: int
    /** 自动刷新商店展示物品(HH:MM:SS,HH:MM:SS,-1则不自动刷新) */
    readonly autoRefresh: any
    /** 手动刷新商店内容 */
    readonly manualRefresh: IConfShopManualRefresh[]
    /** 商店内容 */
    readonly content: ConfigReadonlyMap<int, IConfShopContent>
}
declare type ConfKeyShop = int
// #endregion shop.json

// #region skill.json
interface IConfSkillLv {
    /** 技能ID */
    readonly id: int
    /** 技能等级 */
    readonly lv: int
    /** 技能评分 */
    readonly fp: int
    /** 技能描述 */
    readonly desc: string
    /** 触发概率万分比 */
    readonly triggerPro: int
    /** 技能消耗类型
0.不消耗任何
1.消耗法力条数
2.消耗boss怒气值 */
    readonly costType: int
    /** 技能消耗数值对应数值，没有类型时填0 */
    readonly costNum: int
    /** 1冷却时间
2冷却回合 */
    readonly cdType: int
    /** 冷却时间，（毫秒或者回合） */
    readonly cd: int
    /** 技能效果，调用技能效果表的id */
    readonly effects: any
}
interface IConfSkill {
    /** 技能ID */
    readonly id: int
    /** 技能名称 */
    readonly name: string
    /** 技能描述 */
    readonly desc: string
    /** 技能类型
1、普攻技能（出手触发）
2、大招技能（主动触发）
3、触发技能（元神技能，触发条件）
4、功能性技能（装备特效，触发条件）
5、供奉技能（触发条件） */
    readonly type: int
    /** 触发时刻
1、普攻前触发
2、普攻后触发
3、受到普攻后触发
4、大招施放后触发
5、触发技能释放后(普攻之外的技能都算）
6、触发眩晕时触发
7、受到伤害时触发
8、治疗时触发
9、受治疗时触发
10死亡触发
11计算伤害时触发
12吃丹药执行
99默认生效 */
    readonly triggerType: int
    /** 大招身后特效 */
    readonly maxEffect: int
    /** 技能等级效果 */
    readonly lv: ConfigReadonlyMap<int, IConfSkillLv>
}
declare type ConfKeySkill = int
// #endregion skill.json

// #region skill_buff.json
interface IConfSkill_buff {
    /** buffID */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 战场部上的BUFF描述 */
    readonly arenaDesc?: string
    /** BUFF特效 */
    readonly buffFx?: string
    /** 效果icon */
    readonly effectIcon?: string
    /** 头顶文字 */
    readonly headText?: string
    /** 头顶文字展示类型
1：添加buff时显示
2：触发时显示，如免疫
3：都显示 */
    readonly headTextShowType: int
    /** 击中效果 */
    readonly hitFx?: string
    /** 飘字文本和数字的缩放比例（万分比） */
    readonly textScale: int
    /** 扣血前的文字图片id
（普通攻击） */
    readonly statusType: int
    /** 扣血前的文字图片id
（暴击） */
    readonly statusTypeCrit: int
    /** 1buff，2debuff */
    readonly buffCategory: int
    /** 类型1可驱散buff，0不可净化或驱散 */
    readonly removable: int
    /** 触发时刻
1、普攻前触发
2、普攻后触发
3、受到普攻后触发
4、大招施放后触发
5、触发技能释放后
6、触发眩晕时触发
7、受到伤害时触发
8、治疗时触发
9、受治疗时触发
10死亡触发
11计算伤害时触发
99默认生效 */
    readonly triggerType: int
    /** buff类：
【伤害类同id叠加计算，11中毒，12灼烧，13诅咒】
【大类回血：同bufftype只存1个，新替旧：21圣疗】
【叠加回血，独立生效，31治愈】
【属性可叠，独立生效：301增伤，302减伤，303普攻增强，304加攻，305减攻，306加防，307减防308命中，309闪避，310暴击，311穿透】
【属性同名不叠，生效绝对值大的：401撕裂（减防）402庇护（减伤）403减防B，404法减，405减伤B，406减防C，407加攻，408加防御】
【状态类（一般只存在一个，替换的规则根据类型需要）：100眩晕，101连击，102免疫，103反伤，104神佑，105审判，106禁疗，107沉默；】 */
    readonly buffType: int
    /** 效果类型，
类型1伤害buff:造成X%自身攻击的伤害，参数1填万分比值；造成X%自身防御，参数2填万分比
类型2治疗buff:参数1填效果（目标1+目标2）回复的X%攻击的血量(万分比值)，参数2填效果（目标1+目标2）回复的X%防御的血量(万分比值)；
类型3属性buff:.参数1填提升的属性类型值，参数2填提升的万分比值(正值为提升，负值为下降)大层数；
类型4特殊伤害buff：真实伤害，参数3[（伤害系数）,（1目标属性，2基于自身属性）,（属性类型（攻击力，生命值上限等）]
类型100：眩晕；
类型101：连击；
类型102：免疫（参数1（1正2负面）参数2指定id，参数3（多类buff，[buffType]）；
103：反伤
104、(神佑效果)
105、(审判效果)
106、(禁疗效果)
107、(沉默效果) */
    readonly effectType: int
    /** 效果参数1 */
    readonly effectValue1: int
    /** 效果参数2 */
    readonly effectValue2: int
    /** 效果参数3 */
    readonly effectValue3: any
    /** 
1同施加者，同id的buff间叠加次数上限且刷新时间，
2目标身上同buffType只存在一个，不加新的，保留旧的
3独立计算效果和时间（同type如果有上限会移除最老的）
4身上同buffType的buff只存在一个（属性生效绝对值最大的，非属性的buff替换成新的） */
    readonly layerType: int
    /** buff叠加层数：-1不限层数，N限制N层 */
    readonly maxLayers: int
    /** 类型1：持续时间，参数填持续时间（100毫秒的整数倍）；
类型2：：持续回合buff所在目标攻击次数，持续参数1填持续次数 */
    readonly sustainType: int
    /** 效果持续时间（毫秒，或者次数） */
    readonly sustainValue: int
    /** 生效间隔：
目标间隔回合数，
状态类填0 */
    readonly interval: int
}
declare type ConfKeySkill_buff = int
// #endregion skill_buff.json

// #region skill_buff_decs.json
interface IConfSkill_buff_decs {
    /** 效果icon */
    readonly effectIcon: string
    /** 名称 */
    readonly name: string
    /** 战场部上的BUFF描述 */
    readonly arenaDesc: string
    /** 类型1：直接提取描述
类型2：中毒类型，0填人数，1填层数
类型3：0填buff累加值（isRatio=1，显示百分比）
类型4：0填血脉契印表累加值（isRatio=1，显示百分比） */
    readonly type: int
    /** 是否万分比 */
    readonly isRatio: int
}
declare type ConfKeySkill_buff_decs = string
// #endregion skill_buff_decs.json

// #region skill_effect.json
interface IConfSkill_effectOwnBuff {
    /** 技能效果ID */
    readonly id: int
    /** buffid */
    readonly buffId: int
    /** 施加概率 */
    readonly prob: int
}
interface IConfSkill_effectTargetBuff {
    /** 技能效果ID */
    readonly id: int
    /** buffid */
    readonly buffId: int
    /** 施加概率 */
    readonly prob: int
}
interface IConfSkill_effect {
    /** 技能效果ID */
    readonly id: int
    /** 触发条件类型
1己方血量万分比范围
2目标方血量万分比范围
3每累计N次普攻后
4每累计受到N次普攻后
5释放XX技能后 */
    readonly conditionType: int
    /** 触发条件值 */
    readonly conditionValue?: any
    /** 效果类型，
类型1伤害:造成X%自身攻击的伤害，参数1填万分比值；造成X%自身防御，参数2填万分比
类型2治疗:参数1填效果（目标1+目标2）回复的X%攻击的血量(万分比值)，参数2填效果（目标1+目标2）回复的X%防御的血量(万分比值)；
类型3施加buff
类型4特殊伤害buff：真实伤害，参数1（伤害系数）参数2（1目标属性，2基于自身属性）参数3（属性类型（攻击力，生命值上限等）
类型5：根据目标上己方的指定buff层数造成伤害（参数1攻击万分比值；参数2防御万分比，参数3填buffType，伤害=参数1*buff层数的万分比攻击伤害+参数2*buff层数的万分比防御伤害）
类型6:随机驱散正面状态（参数1：正负面，参数2驱散个数）

 */
    readonly effectType: int
    /** 资源特效类型：1神符、大招弹道，2技能弹道，3供奉技能弹道，4神器弹道，5普攻弹道，6夔牛/特殊boss普攻，7治疗连线 */
    readonly resType: int
    /** 攻击起手 */
    readonly atkFirst?: string
    /** 攻击发射 */
    readonly atkEmit?: string
    /** 攻击弹道 */
    readonly atkBallistic?: string
    /** 攻击受击 */
    readonly atkHit?: string
    /** Emit播出后多久发出弹道(毫秒)
     */
    readonly atkEmitTime: int
    /** 反击盾 */
    readonly atkFb?: string
    /** 治疗弹道 */
    readonly treatBallistic?: string
    /** 治疗受击 */
    readonly treatHit?: string
    /** 播放路径，
1：直接播放
2：位移
3：按距离播放段数 */
    readonly playIme: int
    /** 客户端调用种族
普攻字段 */
    readonly need: int
    /** 是否是第5段攻击，1填是，不填代表不是 */
    readonly isFive: int
    /** 延时伤害(毫秒)
若playlme=3，则delayHit=一段的延迟时长 */
    readonly delayHit: int
    /** 技能释放时展示的文本图片id */
    readonly showNameId: int
    /** 效果参数1 */
    readonly effectValue1: int
    /** 效果参数2 */
    readonly effectValue2: int
    /** 效果参数3 */
    readonly effectValue3: any
    /** 效果目标1；
1.当前敌方(自身锁定目标），
2自身，
3场内其他最低血量的友军,
4全体敌方目标(boss的敌方是本场景所有玩家，玩家的敌方是boss+所有敌对玩家)
5伤害来源敌方，
6前技能效果的目标:伤害目标[6,1],治疗目标[6,2]
7敌方随机N名（当前目标+随机N-1其他敌方）
8当前同山头随机N名(不包括当前目标）
9己方同山头随机N名（不包括己方）
10  眩晕的目标 */
    readonly target1: any
    /** 效果目标1；
1.当前敌方(自身锁定目标），
2自身，
3场内其他最低血量的友军,
4全体敌方目标(boss的敌方是本场景所有玩家，玩家的敌方是boss+所有敌对玩家)
5伤害来源敌方，
6前技能效果的目标:伤害目标[6,1],治疗目标[6,2]
7敌方随机N名（当前目标+随机N-1其他敌方）
8当前同山头随机N名(不包括当前目标）
9己方同山头随机N名（不包括己方）
10  眩晕的目标 */
    readonly target2?: any
    /** （仅给自身加buff时，应填目标为2（自身），buff填在targetBuff）目标buff */
    readonly targetBuff: ConfigReadonlyMap<int, IConfSkill_effectTargetBuff>
    /** (只有前效果有目标，且有执行效果才会施加ownBuff)自己buff */
    readonly ownBuff: ConfigReadonlyMap<int, IConfSkill_effectOwnBuff>
}
declare type ConfKeySkill_effect = int
// #endregion skill_effect.json

// #region skill_fx_delay.json
interface IConfSkill_fx_delay {
    /** 技能特效名称 */
    readonly FxName: string
    /** 技能特效延迟时间（毫秒）
创建起手特效——delay——创建弹道——delay/计算——创建hit——delay——显示伤害 */
    readonly delay: int
}
declare type ConfKeySkill_fx_delay = string
// #endregion skill_fx_delay.json

// #region sterious_man.json
interface IConfSterious_man {
    /** 等级 */
    readonly id: int
    /** 名字 */
    readonly name: string
    /** 玩家等级限制 */
    readonly level: int
    /** 境界 */
    readonly realm: int
    /** 消耗道具，升到下一级 */
    readonly costPropId: int
    /** 消耗数量 */
    readonly costNum: int
    /** 攻击力 */
    readonly atk: int
    /** 突破 */
    readonly breakThrough: int
}
declare type ConfKeySterious_man = int
// #endregion sterious_man.json

// #region sterious_man_skin.json
interface IConfSterious_man_skinAward {
    /** 皮肤id，跟物品id一样 */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfSterious_man_skin {
    /** 皮肤id，跟物品id一样 */
    readonly id: int
    /** 皮肤类型
1:境界皮肤
2:活动皮肤 */
    readonly skinType: int
    /** 品质 */
    readonly quality: int
    /** 形象资源 */
    readonly spine: int
    /** 名字 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 拥有后每日赠送资源 */
    readonly award: IConfSterious_man_skinAward[]
}
declare type ConfKeySterious_man_skin = int
// #endregion sterious_man_skin.json

// #region sterious_man_through.json
interface IConfSterious_man_throughClick {
    /** 突破等级 */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfSterious_man_through {
    /** 突破等级(境界等级) */
    readonly id: int
    /** 限制等级客户端展示 */
    readonly level: int
    /** 消耗道具，升到下一级 */
    readonly costPropId: int
    /** 消耗数量 */
    readonly costNum: int
    /** 额外增加攻击力，突破的等级对应的攻击值加上神秘人等级的攻击值=最终攻击值 */
    readonly atk: int
    /** 特效 */
    readonly effect?: string
    /** 皮肤id */
    readonly skinId: int
    /** 单次点击收益 */
    readonly click: IConfSterious_man_throughClick[]
}
declare type ConfKeySterious_man_through = int
// #endregion sterious_man_through.json

// #region system_id.json
interface IConfSystem_idAward {
    /** 系统id */
    readonly id: int
    /** 升到下一重数的奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
interface IConfSystem_id {
    /** 系统id */
    readonly id: int
    /** 系统名称 */
    readonly systemName: string
    /** 中文名 */
    readonly name: string
    /** 系统在侧边导航栏中的名称，为空时默认读系统名称 */
    readonly sortName?: string
    /** 排序值 */
    readonly sort: int
    /** 图标 */
    readonly bigIcon: int
    /** 小图标资源id */
    readonly smallIcon: int
    /** 界面预制体名称 */
    readonly widgetName: string
    /** 偏好组2（填写地图id）
空：无双偏好
填具体id：＜此地图id前为偏好组2id */
    readonly preferenceId2MapId: int
    /** 偏好组2id */
    readonly preferenceId2: int
    /** 偏好组id */
    readonly preferenceId: int
    /** 解锁条件 */
    readonly required: IConfSystem_idRequired[]
    /** 红点 */
    readonly redDot?: string
    /** 是否开启1开始2关闭 */
    readonly open: int
    /** 解锁弹窗是否自动打开0-否/1-是 */
    readonly unlockAuto: int
    /** 是否活动 */
    readonly isActivity: int
    /** 是否可以复活 */
    readonly canRevive: int
    /** Boss是否可以逃跑 */
    readonly canBossRun: int
    /** Boss攻速特殊
个人修炼为波次boss */
    readonly bossAtkSpeed: int
    /** 隐藏右上角人数和地点 */
    readonly hidePosAndPlayer: int
    /** 是否显示0-否/1-是 */
    readonly isShow: int
    /** 是否可以抢夺归属0-否/1-是 */
    readonly canGrabOwner: int
    /** 顶部资源显示道具 */
    readonly topRes?: any
    /** 底部按钮(1自动2偏好3邀请) */
    readonly bottomBtn: any
    /** 底部全隐藏 */
    readonly hideBottomAll: int
    /** 自动战斗 */
    readonly autoFight: int
    /** 修炼界面功能快捷栏入口展示(不填或填0不展示，填1展示在上方，填2展示在下方) */
    readonly shortcut: int
    /** 引导名字 */
    readonly guideName?: string
    /** 引导奖励内容 */
    readonly award: IConfSystem_idAward[]
    /** 耐久度在系统中死亡是否扣除，空代表生效，1代表不生效 */
    readonly durableEffective: int
}
interface IConfSystem_idRequired {
    /** id */
    readonly id: int
    /** 调用任务类型表的id */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
}
declare type ConfKeySystem_id = int
// #endregion system_id.json

// #region system_info.json
interface IConfSystem_info {
    /** 唯一id */
    readonly id: int
    /** 1、世界频道
2、系统频道
3、山头频道
4、跑马灯
5、玩家日志（战斗流水）
6、怪物日志（战斗流水）
7、其他日志（战斗流水）
8、弹窗
9、TIP
10、邮件
11、山头日志
12、竞技场
13、历练
（可以填数组） */
    readonly type: any
    /** 邮件标题 */
    readonly title?: string
    /** 描述 */
    readonly desc: string
}
declare type ConfKeySystem_info = int
// #endregion system_info.json

// #region system_preference_id.json
interface IConfSystem_preference_id {
    /** 偏好组id */
    readonly id: number
    /** 偏好id
1友好 2帮会 3同区服友好 4全体混战 */
    readonly preferenceId: any
    /** 默认偏好id */
    readonly defaultId: int
}
declare type ConfKeySystem_preference_id = any
// #endregion system_preference_id.json

// #region system_preview.json
interface IConfSystem_preview {
    /** id */
    readonly id: int
    /** 系统名称 */
    readonly name: string
    /** 资源id */
    readonly resId: int
    /** 0不显示 1显示 */
    readonly isShow: int
    /** 修炼界面预览显示等级 */
    readonly viewLv: int
    /** 描述 */
    readonly desc: string
    /** 系统表id */
    readonly systemId: int
    /** 奖励 */
    readonly awards: IConfSystem_previewAwards[]
}
interface IConfSystem_previewAwards {
    /** id */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
declare type ConfKeySystem_preview = int
// #endregion system_preview.json

// #region system_rank.json
interface IConfSystem_rankAward1 {
    /** rankId */
    readonly rankId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
    /** 份数 */
    readonly parts: int
}
interface IConfSystem_rankAward2 {
    /** rankId */
    readonly rankId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfSystem_rankAwards {
    /** giftId */
    readonly giftId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfSystem_rank {
    /** 活动名 */
    readonly activityName: string
    /** 活动中文名 */
    readonly name: string
    /** 填写双倍掉落卡id，不填或填-1则不生效 */
    readonly doubleDrop: int
    /** 任务循环最大轮次 */
    readonly taskMaxStage: int
    /** 限时任务 */
    readonly task: ConfigReadonlyMap<int, IConfSystem_rankTask>
    /** 排名阶段 */
    readonly rank: ConfigReadonlyMap<int, IConfSystem_rankRank>
    /** 礼包 */
    readonly gifts: ConfigReadonlyMap<int, IConfSystem_rankGifts>
}
interface IConfSystem_rankGifts {
    /** giftId */
    readonly giftId: int
    /** 活动名 */
    readonly activityName: string
    /** 礼包图标 */
    readonly icon: int
    /** 礼包名称 */
    readonly desc: string
    /** 排序 */
    readonly sort: int
    /** 限购类型(0不限购，1活动期间总计，2每日) */
    readonly limitType: int
    /** 限购次数 */
    readonly totalLimit: int
    /** 充值ID */
    readonly rechargeId: int
    /** 礼包类型(1现金礼包，2仙玉礼包，3广告礼包-跳，4免费礼包，5广告礼包-必) */
    readonly payType: int
    /** 价格 */
    readonly price: int
    /** 折扣 */
    readonly discount: int
    /** 礼包内容 */
    readonly awards: IConfSystem_rankAwards[]
}
interface IConfSystem_rankRank {
    /** rankId */
    readonly rankId: int
    /** 活动名 */
    readonly activityName: string
    /** 名次 */
    readonly rank: any
    /** 个人榜=个人奖励
（联盟榜=成员奖励） */
    readonly award1: IConfSystem_rankAward1[]
    /** 个人榜=留空
（联盟榜=盟主奖励） */
    readonly award2: IConfSystem_rankAward2[]
}
interface IConfSystem_rankTask {
    /** taskId */
    readonly taskId: int
    /** 活动名 */
    readonly activityName: string
    /** 统计类型：0活动期间，1每日 */
    readonly recordType: int
    /** 任务类型 */
    readonly taskType: int
    /** 轮次 */
    readonly taskStage: int
    /** 条件1 */
    readonly param1: int
    /** 条件2 */
    readonly param2: int
    /** 任务目标值 */
    readonly value: int
    /** 进度显示扣除数量 */
    readonly showValue: int
    /** 任务奖励 */
    readonly taskAward: IConfSystem_rankTaskAward[]
    /** 任务描述 */
    readonly taskDesc: ConfigReadonlyMap<int, IConfSystem_rankTaskDesc>
}
interface IConfSystem_rankTaskAward {
    /** taskId */
    readonly taskId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfSystem_rankTaskDesc {
    /** taskId */
    readonly taskId: int
    /** 语言 */
    readonly lang: string
    /** 任务名称 */
    readonly name: string
    /** 任务描述 */
    readonly desc: string
}
declare type ConfKeySystem_rank = string
// #endregion system_rank.json

// #region task_daily.json
interface IConfTask_dailyAwards {
    /** 序号 */
    readonly sort: int
    /** 道具id */
    readonly propId: number
    /** 数量 */
    readonly num: number
}
interface IConfTask_dailyAwards2 {
    /** 序号 */
    readonly sort2: int
    /** 道具id */
    readonly propId: number
    /** 数量 */
    readonly num: number
}
interface IConfTask_dailyBox {
    /** 序号 */
    readonly sort2: int
    /** 类型，1每日2每周 */
    readonly id: int
    /** 需要的活跃度值 */
    readonly need: int
    /** 奖励内容 */
    readonly awards2: IConfTask_dailyAwards2[]
}
interface IConfTask_dailyMore {
    /** 序号 */
    readonly sort: int
    /** 类型，1每日2每周 */
    readonly id: int
    /** 组id */
    readonly groupId: int
    /** 资源 */
    readonly icon: int
    /** 标题 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 任务对应的功能id(不填则默认解锁) */
    readonly systemId: int
    /** 调用任务类型表的id */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
    /** 奖励内容 */
    readonly awards: IConfTask_dailyAwards[]
    /** 跳转 */
    readonly goto: any
}
interface IConfTask_daily {
    /** 类型，1每日2每周 */
    readonly id: int
    /** 更多任务内容 */
    readonly more: ConfigReadonlyMap<int, IConfTask_dailyMore>
    /** 活跃度宝箱内容 */
    readonly box: ConfigReadonlyMap<int, IConfTask_dailyBox>
}
declare type ConfKeyTask_daily = int
// #endregion task_daily.json

// #region task_type.json
interface IConfTask_type {
    /** ID */
    readonly id: int
    /** 统计类型；1玩家自身数据2统计自身总数据3记录历史最大值 */
    readonly type: int
    /** 条件数据类型，不填为=，填1为≥ */
    readonly paramType: int
    /** 类型标题 */
    readonly name: string
    /** 类型参数说明 */
    readonly desc: string
    /** 类型参数说明 */
    readonly desc1: string
}
declare type ConfKeyTask_type = int
// #endregion task_type.json

// #region title.json
interface IConfTitle {
    /** 序号 */
    readonly id: int
    /** 称号类型(同时影响称号有效期计算)(1冲榜类称号，有效期自榜单结算时开始计算；2日常类称号，有效期自领取称号奖励时开始计算) */
    readonly type: int
    /** 持续时间，秒 */
    readonly duration: int
    /** x坐标 */
    readonly x: int
    /** y坐标 */
    readonly y: int
    /** 描述 */
    readonly desc: string
}
declare type ConfKeyTitle = int
// #endregion title.json

// #region tow_box.json
interface IConfTow_box {
    /** 货物id */
    readonly id: int
    /** 名称 */
    readonly name: string
    /** 资源等级 */
    readonly level: int
    /** 资源品质(仅决定场景中资源底颜色) */
    readonly quality: int
    /** 图标 */
    readonly icon: int
    /** 刷新权重 */
    readonly prob: int
    /** 刷新区间 */
    readonly areaMin: int
    /** 刷新区间（己方1200，对手0） */
    readonly areaMax: int
    /** 货物重量 */
    readonly weight: int
    /** 是否显示奖励 */
    readonly isShow: int
    /** 需要工人数 */
    readonly workerLimitMin: int
    /** 至多工人数 */
    readonly workerLimitMax: int
    /** 每个工人给对方增加的重量 */
    readonly workerAdd: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
declare type ConfKeyTow_box = int
// #endregion tow_box.json

// #region tow_box_robot.json
interface IConfTow_box_robot {
    /** id */
    readonly id: int
    /** 机器人名称 */
    readonly name: string
    /** 机器人等级 */
    readonly lv: int
    /** 机器人种族 */
    readonly race: int
    /** 机器人境界(用于头像显示) */
    readonly realm: int
}
declare type ConfKeyTow_box_robot = int
// #endregion tow_box_robot.json

// #region tow_box_worker.json
interface IConfTow_box_worker {
    /** 阶段 */
    readonly id: int
    /** 阶段名称 */
    readonly name: string
    /** 精力范围[a,b],闭区间 */
    readonly energy: any
    /** 拖动效率（速度系数） */
    readonly ratio: int
    /** 状态描述 */
    readonly desc: string
}
declare type ConfKeyTow_box_worker = int
// #endregion tow_box_worker.json

// #region tower.json
interface IConfTower {
    /** id */
    readonly id: int
    /** BOSS的怪物id */
    readonly bossId: int
    /** 标签（desc_tips表） */
    readonly label: any
    /** 挑战boss消耗 */
    readonly costId: int
    /** 消耗数量 */
    readonly costNum: int
    /** 奖励 */
    readonly awards: IConfTowerAwards[]
}
interface IConfTowerAwards {
    /** id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
declare type ConfKeyTower = int
// #endregion tower.json

// #region tower_personal.json
interface IConfTower_personal {
    /** 层数 */
    readonly id: int
    /** 个人阶段奖励 */
    readonly awards: IConfTower_personalAwards[]
}
interface IConfTower_personalAwards {
    /** id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
declare type ConfKeyTower_personal = int
// #endregion tower_personal.json

// #region tower_server.json
interface IConfTower_server {
    /** id */
    readonly id: int
    /** 全服阶段奖励 */
    readonly awards: IConfTower_serverAwards[]
}
interface IConfTower_serverAwards {
    /** id */
    readonly id: int
    /** 奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
}
declare type ConfKeyTower_server = int
// #endregion tower_server.json

// #region trigger_gift.json
interface IConfTrigger_giftAwards {
    /** 触发礼包id */
    readonly giftId: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfTrigger_giftMore {
    /** 触发礼包id */
    readonly giftId: int
    /** 同组的编号 */
    readonly id: int
    /** 充值id */
    readonly rechargeId: int
    /** 限购次数 */
    readonly totalLimit: int
    /** 奖励 */
    readonly awards: IConfTrigger_giftAwards[]
}
interface IConfTrigger_gift {
    /** 同组的编号 */
    readonly id: int
    /** 定义类型，1等级达到XXX；2体力耗尽；101,升级元神，资源不足时；102升级法宝，资源不足时；103分解装备； */
    readonly type: int
    /** 玩家等级限制(填等级限制范围，-1则无限制) */
    readonly lvLimit: any
    /** 0终生触发1次；1每日首次 */
    readonly times: int
    /** 描述 */
    readonly desc: string
    /** 礼包对话 */
    readonly npcTalk: string
    /** 折扣 */
    readonly discount: int
    /** 礼包限时时间,秒 */
    readonly duration: int
    /** 触发弹出的方式(0触发时立刻弹出；1回到主界面时弹出；2关闭指定界面时弹出，需填写界面名称) */
    readonly openShow: any
    /** npc头像资源 */
    readonly npcIcon: int
    /** 礼包标题底图 */
    readonly giftIcon: int
    /** 奖励 */
    readonly more: ConfigReadonlyMap<int, IConfTrigger_giftMore>
}
declare type ConfKeyTrigger_gift = int
// #endregion trigger_gift.json

// #region version.json
interface IConfVersion {
    /** 类型 */
    readonly type: string
    /** 值 */
    readonly value: string
    /** 描述 */
    readonly desc: string
}
declare type ConfKeyVersion = string
// #endregion version.json

// #region weapon.json
interface IConfWeaponMore {
    /** 序列号 */
    readonly id: int
    /** 种族id */
    readonly race: int
    /** 名字 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 资源图片 */
    readonly icon: int
}
interface IConfWeapon {
    /** 序列号 */
    readonly id: int
    /** 等级 */
    readonly showLv: int
    /** 排序 */
    readonly sort: int
    /** 法宝强度限制 */
    readonly lvLimit: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 消耗道具 */
    readonly costPropId: int
    /** 消耗数量1 */
    readonly costNum: int
    /** 攻击力 */
    readonly atk: int
    /** 防御力 */
    readonly def: int
    /** 血量 */
    readonly hp: int
    /** 法宝不同种族的资源调用 */
    readonly more: ConfigReadonlyMap<int, IConfWeaponMore>
}
declare type ConfKeyWeapon = int
// #endregion weapon.json

// #region weapon_award.json
interface IConfWeapon_awardAttrs {
    /** 境界id */
    readonly id: int
    /** 属性类型 */
    readonly attrType: int
    /** 值，万分比 */
    readonly value: int
}
interface IConfWeapon_awardNeed {
    /** 序号 */
    readonly sort: int
    /** id */
    readonly id: int
    /** 调用任务类型表的id */
    readonly type: int
    /** 条件值 */
    readonly value: int
    /** 参数值 */
    readonly param1: int
    /** 参数值 */
    readonly param2: int
}
interface IConfWeapon_award {
    /** 序列号 */
    readonly id: int
    /** 描述 */
    readonly name: string
    /** 描述 */
    readonly desc: string
    /** 资源图标 */
    readonly icon?: string
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 升到下一重数的奖励道具 */
    readonly propId: int
    /** 奖励数量 */
    readonly num: int
    /** 升级到下一强度要求 */
    readonly need: IConfWeapon_awardNeed[]
    /** 该强度的属性加成 */
    readonly attrs: IConfWeapon_awardAttrs[]
}
declare type ConfKeyWeapon_award = int
// #endregion weapon_award.json

// #region weapon_soul_add.json
interface IConfWeapon_soul_add {
    /** 次数 */
    readonly id: int
    /** 高级属性加成万分比（替换） */
    readonly addRatio: int
}
declare type ConfKeyWeapon_soul_add = int
// #endregion weapon_soul_add.json

// #region weapon_soul_attribute.json
interface IConfWeapon_soul_attributeMAttr {
    /** 器灵品质 */
    readonly id: int
    /** 属性类型值 */
    readonly attrType: int
    /** 图标 */
    readonly icon?: string
    /** 权重，总权重代表100% */
    readonly pro: int
}
interface IConfWeapon_soul_attributeRankAttr {
    /** 器灵品质 */
    readonly id: int
    /** 属性比例，万分比值 */
    readonly attr: int
    /** 权重，总权重代表100% */
    readonly pro: int
}
interface IConfWeapon_soul_attributeSpecialAttr {
    /** 器灵品质 */
    readonly id: int
    /** 属性类型值 */
    readonly attrType: int
    /** 属性值 */
    readonly attrValue: int
    /** 图标 */
    readonly icon?: string
    /** 权重，总权重代表100% */
    readonly pro: int
    /** 评分 */
    readonly fp: int
}
interface IConfWeapon_soul_attribute {
    /** 炼化品质 */
    readonly id: int
    /** 最小基础属性值 */
    readonly minAttr: int
    /** 最大基础属性值 */
    readonly maxAtt: int
    /** 基础属性类型随机 */
    readonly mAttr: IConfWeapon_soul_attributeMAttr[]
    /** 基础属性范围随机 */
    readonly rankAttr: IConfWeapon_soul_attributeRankAttr[]
    /** 特殊属性随机 */
    readonly specialAttr: IConfWeapon_soul_attributeSpecialAttr[]
}
declare type ConfKeyWeapon_soul_attribute = int
// #endregion weapon_soul_attribute.json

// #region weapon_soul_extract.json
interface IConfWeapon_soul_extract {
    /** 炼化品质 */
    readonly id: int
    /** 权重，总权重代表100% */
    readonly pro: int
}
declare type ConfKeyWeapon_soul_extract = int
// #endregion weapon_soul_extract.json

// #region weapon_soul_open.json
interface IConfWeapon_soul_open {
    /** 第X个坑位 */
    readonly id: int
    /** 法宝等级限制，读取法宝表格的序列号id */
    readonly weaponLevel: int
    /** 消耗道具，单次器灵炼化消耗的道具 */
    readonly costPropId: int
    /** 消耗数量 */
    readonly costNum: int
}
declare type ConfKeyWeapon_soul_open = int
// #endregion weapon_soul_open.json

// #region weapon_valuable.json
interface IConfWeapon_valuableBaseAttr {
    /** 时装id，跟物品id一样 */
    readonly id: int
    /** 属性类型 */
    readonly attrType: int
    /** 值 */
    readonly value: int
}
interface IConfWeapon_valuableEffects {
    /** 至宝d，跟物品id一样 */
    readonly id: int
    /** 效果类型1代表属性变化，参数1填属性类型值，参数2属性值；类型2代表资源额外掉落(参数1和参数3是特定关系)，参数1填增益资源物品id1，参数2额外掉落数量 */
    readonly type: int
    /** 参数 */
    readonly value1: int
    /** 参数 */
    readonly value2: int
}
interface IConfWeapon_valuableMore {
    /** 至宝d，跟物品id一样 */
    readonly id: int
    /** 回复耐久道具，物品id */
    readonly reply: int
}
interface IConfWeapon_valuable {
    /** 神器d，跟物品id一样 */
    readonly id: int
    /** 名字 */
    readonly name: string
    /** 标签资源 */
    readonly icon?: string
    /** 弹道资源，1图片2特效 */
    readonly bullet: int
    /** 角标资源，1代表资源，2代表增伤 */
    readonly showTag: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 排序字段 */
    readonly sort: int
    /** 耐久值，也是重复获得的耐久值 */
    readonly durable: int
    /** 每次释放消耗耐久度 */
    readonly cost: int
    /** 每次生效的类型（1攻击扣除，2受击扣除，3都扣除） */
    readonly costType: int
    /** 描述 */
    readonly desc: string
    /** 回复耐久消耗道具 */
    readonly more: IConfWeapon_valuableMore[]
    /** 效果类型详细 */
    readonly effects: IConfWeapon_valuableEffects[]
    /** 神器固定属性详细 */
    readonly baseAttr: IConfWeapon_valuableBaseAttr[]
    /** 评分 */
    readonly fp: int
    /** 颜值 */
    readonly showValue: int
    /** 每小时恢复耐久度 */
    readonly durableRecovery: int
}
declare type ConfKeyWeapon_valuable = int
// #endregion weapon_valuable.json

// #region wechat_template.json
interface IConfWechat_template {
    /** 模板编号 */
    readonly id: int
    /** 标题 */
    readonly title: string
    /** 模板id */
    readonly template_id: string
    /** 备注 */
    readonly desc: string
    /** 参数 */
    readonly params: IConfWechat_templateParams[]
}
interface IConfWechat_templateParams {
    /** id */
    readonly id: int
    /** key值 */
    readonly key: string
    /** 文本 */
    readonly desc: string
    /** 微信变量 */
    readonly wxKey: string
}
declare type ConfKeyWechat_template = int
// #endregion wechat_template.json

// #region world_level.json
interface IConfWorld_level {
    /** id */
    readonly id: int
    /** 玩家等级 */
    readonly playerLv: int
    /** 开服天数（ */
    readonly openDays: int
    /** 世界bossid */
    readonly bossId: int
    /** 重置时间(0点开始，每间隔时间重置血量） */
    readonly resetTime: int
    /** 场景重进cd */
    readonly cd: int
    /** bossBuff相关 */
    readonly bossBuff: any
    /** 玩家buff */
    readonly playerBuff: any
    /** 全服奖励 */
    readonly awards: IConfWorld_levelAwards[]
    /** 参与奖励 */
    readonly fightAwards: IConfWorld_levelFightAwards[]
}
interface IConfWorld_levelAwards {
    /** 世界等级 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
interface IConfWorld_levelFightAwards {
    /** 世界等级 */
    readonly id: int
    /** 道具id */
    readonly propId: int
    /** 数量 */
    readonly num: int
}
declare type ConfKeyWorld_level = int
// #endregion world_level.json

// #region world_level_add.json
interface IConfWorld_level_add {
    /** id */
    readonly id: int
    /** 等级差值（玩家等级低于（<=世界等级-N））获得经验加成 */
    readonly lvDiff: int
    /** 获取经验系数 */
    readonly expRatio: int
}
declare type ConfKeyWorld_level_add = int
// #endregion world_level_add.json

// #region worship_god.json
interface IConfWorship_god {
    /** 神像id */
    readonly id: int
    /** 神像动画 */
    readonly spine: int
    /** 1地府2龙宫3保家仙 */
    readonly type: int
    /** 神像名称 */
    readonly name: string
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
    /** 显示概率万分比 */
    readonly showProb: int
}
declare type ConfKeyWorship_god = int
// #endregion worship_god.json

// #region worship_skill.json
interface IConfWorship_skill {
    /** 技能id */
    readonly skillId: int
    /** 图标 */
    readonly icon: int
    /** 技能评分 */
    readonly fp: int
    /** 所属神像 */
    readonly godId: int
    /** 抽取权重 */
    readonly pro: int
    /** 品质1白色2绿色3蓝色4紫色6金色8橙色10红色 */
    readonly quality: int
}
declare type ConfKeyWorship_skill = int
// #endregion worship_skill.json

declare interface IConfigMap {
    readonly achievement: IConfAchievement
    readonly achievement_award: IConfAchievement_award
    readonly achievement_label: IConfAchievement_label
    readonly achievement_label_open: IConfAchievement_label_open
    readonly achievement_medal: IConfAchievement_medal
    readonly activity_cross_mission: IConfActivity_cross_mission
    readonly activity_gift: IConfActivity_gift
    readonly activity_rank: IConfActivity_rank
    readonly ads_awards: IConfAds_awards
    readonly arena_prestige: IConfArena_prestige
    readonly arena_rank_daily: IConfArena_rank_daily
    readonly arena_rank_season: IConfArena_rank_season
    readonly arena_ratio: IConfArena_ratio
    readonly attr: IConfAttr
    readonly audio: IConfAudio
    readonly audio_skill: IConfAudio_skill
    readonly congratulation: IConfCongratulation
    readonly cross_kui_cow: IConfCross_kui_cow
    readonly cross_mission: IConfCross_mission
    readonly day_gift: IConfDay_gift
    readonly desc_tips: IConfDesc_tips
    readonly drug: IConfDrug
    readonly emoji_pack: IConfEmoji_pack
    readonly equip: IConfEquip
    readonly equip_attr_rank: IConfEquip_attr_rank
    readonly equip_award: IConfEquip_award
    readonly equip_draw: IConfEquip_draw
    readonly equip_effect: IConfEquip_effect
    readonly equip_effect_call: IConfEquip_effect_call
    readonly equip_effect_rank: IConfEquip_effect_rank
    readonly equip_entry: IConfEquip_entry
    readonly equip_entry_call: IConfEquip_entry_call
    readonly equip_fashion: IConfEquip_fashion
    readonly equip_gem: IConfEquip_gem
    readonly equip_suit: IConfEquip_suit
    readonly event_tracking: IConfEvent_tracking
    readonly evil: IConfEvil
    readonly fast_practice: IConfFast_practice
    readonly festival_activity: IConfFestival_activity
    readonly festival_draw: IConfFestival_draw
    readonly first_recharge: IConfFirst_recharge
    readonly first_recharge_gift: IConfFirst_recharge_gift
    readonly force_target: IConfForce_target
    readonly fund: IConfFund
    readonly getway: IConfGetway
    readonly ghost_city: IConfGhost_city
    readonly gift: IConfGift
    readonly gong: IConfGong
    readonly gong_award: IConfGong_award
    readonly gong_booty: IConfGong_booty
    readonly gong_booty_combination: IConfGong_booty_combination
    readonly gong_magical: IConfGong_magical
    readonly gong_sorcery: IConfGong_sorcery
    readonly goto: IConfGoto
    readonly guide: IConfGuide
    readonly guild: IConfGuild
    readonly guild_apply: IConfGuild_apply
    readonly guild_boss: IConfGuild_boss
    readonly guild_build: IConfGuild_build
    readonly guild_flag: IConfGuild_flag
    readonly guild_gift: IConfGuild_gift
    readonly guild_magic: IConfGuild_magic
    readonly guild_mf: IConfGuild_mf
    readonly guild_mission: IConfGuild_mission
    readonly guild_red_envelope: IConfGuild_red_envelope
    readonly heart_demon: IConfHeart_demon
    readonly help: IConfHelp
    readonly hero: IConfHero
    readonly hero_lv: IConfHero_lv
    readonly home_talk: IConfHome_talk
    readonly item: IConfItem
    readonly item_box: IConfItem_box
    readonly item_call: IConfItem_call
    readonly item_draw: IConfItem_draw[]
    readonly item_optional_box: IConfItem_optional_box
    readonly kui_cow: IConfKui_cow
    readonly kui_cow_open: IConfKui_cow_open
    readonly level: IConfLevel
    readonly list: IConfList
    readonly lode: IConfLode
    readonly love: IConfLove
    readonly mail: IConfMail
    readonly main_task: IConfMain_task
    readonly map_buff: IConfMap_buff
    readonly mission: IConfMission
    readonly mission_buy: IConfMission_buy
    readonly monster: IConfMonster
    readonly name: IConfName
    readonly npc: IConfNpc
    readonly param: IConfParam
    readonly peach_orchard: IConfPeach_orchard
    readonly peach_orchard_audio: IConfPeach_orchard_audio
    readonly phy_buy: IConfPhy_buy
    readonly plot: IConfPlot[]
    readonly practice: IConfPractice
    readonly practice_multi: IConfPractice_multi
    readonly preload_prefab: IConfPreload_prefab
    readonly privilege_card: IConfPrivilege_card
    readonly product_id: IConfProduct_id
    readonly question_condition: IConfQuestion_condition
    readonly race: IConfRace
    readonly rank: IConfRank
    readonly rank_awards: IConfRank_awards
    readonly rank_boss: IConfRank_boss
    readonly realm: IConfRealm
    readonly recharge: IConfRecharge
    readonly server_error_code: IConfServer_error_code
    readonly seven_day_sign: IConfSeven_day_sign
    readonly shop: IConfShop
    readonly skill: IConfSkill
    readonly skill_buff: IConfSkill_buff
    readonly skill_buff_decs: IConfSkill_buff_decs
    readonly skill_effect: IConfSkill_effect
    readonly skill_fx_delay: IConfSkill_fx_delay
    readonly sterious_man: IConfSterious_man
    readonly sterious_man_skin: IConfSterious_man_skin
    readonly sterious_man_through: IConfSterious_man_through
    readonly system_id: IConfSystem_id
    readonly system_info: IConfSystem_info
    readonly system_preference_id: IConfSystem_preference_id
    readonly system_preview: IConfSystem_preview
    readonly system_rank: IConfSystem_rank
    readonly task_daily: IConfTask_daily
    readonly task_type: IConfTask_type
    readonly title: IConfTitle
    readonly tow_box: IConfTow_box
    readonly tow_box_robot: IConfTow_box_robot
    readonly tow_box_worker: IConfTow_box_worker
    readonly tower: IConfTower
    readonly tower_personal: IConfTower_personal
    readonly tower_server: IConfTower_server
    readonly trigger_gift: IConfTrigger_gift
    readonly version: IConfVersion
    readonly weapon: IConfWeapon
    readonly weapon_award: IConfWeapon_award
    readonly weapon_soul_add: IConfWeapon_soul_add
    readonly weapon_soul_attribute: IConfWeapon_soul_attribute
    readonly weapon_soul_extract: IConfWeapon_soul_extract
    readonly weapon_soul_open: IConfWeapon_soul_open
    readonly weapon_valuable: IConfWeapon_valuable
    readonly wechat_template: IConfWechat_template
    readonly world_level: IConfWorld_level
    readonly world_level_add: IConfWorld_level_add
    readonly worship_god: IConfWorship_god
    readonly worship_skill: IConfWorship_skill
}
declare interface IConfigKey {
    readonly achievement: ConfKeyAchievement
    readonly achievement_award: ConfKeyAchievement_award
    readonly achievement_label: ConfKeyAchievement_label
    readonly achievement_label_open: ConfKeyAchievement_label_open
    readonly achievement_medal: ConfKeyAchievement_medal
    readonly activity_cross_mission: ConfKeyActivity_cross_mission
    readonly activity_gift: ConfKeyActivity_gift
    readonly activity_rank: ConfKeyActivity_rank
    readonly ads_awards: ConfKeyAds_awards
    readonly arena_prestige: ConfKeyArena_prestige
    readonly arena_rank_daily: ConfKeyArena_rank_daily
    readonly arena_rank_season: ConfKeyArena_rank_season
    readonly arena_ratio: ConfKeyArena_ratio
    readonly attr: ConfKeyAttr
    readonly audio: ConfKeyAudio
    readonly audio_skill: ConfKeyAudio_skill
    readonly congratulation: ConfKeyCongratulation
    readonly cross_kui_cow: ConfKeyCross_kui_cow
    readonly cross_mission: ConfKeyCross_mission
    readonly day_gift: ConfKeyDay_gift
    readonly desc_tips: ConfKeyDesc_tips
    readonly drug: ConfKeyDrug
    readonly emoji_pack: ConfKeyEmoji_pack
    readonly equip: ConfKeyEquip
    readonly equip_attr_rank: ConfKeyEquip_attr_rank
    readonly equip_award: ConfKeyEquip_award
    readonly equip_draw: ConfKeyEquip_draw
    readonly equip_effect: ConfKeyEquip_effect
    readonly equip_effect_call: ConfKeyEquip_effect_call
    readonly equip_effect_rank: ConfKeyEquip_effect_rank
    readonly equip_entry: ConfKeyEquip_entry
    readonly equip_entry_call: ConfKeyEquip_entry_call
    readonly equip_fashion: ConfKeyEquip_fashion
    readonly equip_gem: ConfKeyEquip_gem
    readonly equip_suit: ConfKeyEquip_suit
    readonly event_tracking: ConfKeyEvent_tracking
    readonly evil: ConfKeyEvil
    readonly fast_practice: ConfKeyFast_practice
    readonly festival_activity: ConfKeyFestival_activity
    readonly festival_draw: ConfKeyFestival_draw
    readonly first_recharge: ConfKeyFirst_recharge
    readonly first_recharge_gift: ConfKeyFirst_recharge_gift
    readonly force_target: ConfKeyForce_target
    readonly fund: ConfKeyFund
    readonly getway: ConfKeyGetway
    readonly ghost_city: ConfKeyGhost_city
    readonly gift: ConfKeyGift
    readonly gong: ConfKeyGong
    readonly gong_award: ConfKeyGong_award
    readonly gong_booty: ConfKeyGong_booty
    readonly gong_booty_combination: ConfKeyGong_booty_combination
    readonly gong_magical: ConfKeyGong_magical
    readonly gong_sorcery: ConfKeyGong_sorcery
    readonly goto: ConfKeyGoto
    readonly guide: ConfKeyGuide
    readonly guild: ConfKeyGuild
    readonly guild_apply: ConfKeyGuild_apply
    readonly guild_boss: ConfKeyGuild_boss
    readonly guild_build: ConfKeyGuild_build
    readonly guild_flag: ConfKeyGuild_flag
    readonly guild_gift: ConfKeyGuild_gift
    readonly guild_magic: ConfKeyGuild_magic
    readonly guild_mf: ConfKeyGuild_mf
    readonly guild_mission: ConfKeyGuild_mission
    readonly guild_red_envelope: ConfKeyGuild_red_envelope
    readonly heart_demon: ConfKeyHeart_demon
    readonly help: ConfKeyHelp
    readonly hero: ConfKeyHero
    readonly hero_lv: ConfKeyHero_lv
    readonly home_talk: ConfKeyHome_talk
    readonly item: ConfKeyItem
    readonly item_box: ConfKeyItem_box
    readonly item_call: ConfKeyItem_call
    readonly item_draw: ConfKeyItem_draw
    readonly item_optional_box: ConfKeyItem_optional_box
    readonly kui_cow: ConfKeyKui_cow
    readonly kui_cow_open: ConfKeyKui_cow_open
    readonly level: ConfKeyLevel
    readonly list: ConfKeyList
    readonly lode: ConfKeyLode
    readonly love: ConfKeyLove
    readonly mail: ConfKeyMail
    readonly main_task: ConfKeyMain_task
    readonly map_buff: ConfKeyMap_buff
    readonly mission: ConfKeyMission
    readonly mission_buy: ConfKeyMission_buy
    readonly monster: ConfKeyMonster
    readonly name: ConfKeyName
    readonly npc: ConfKeyNpc
    readonly param: ConfKeyParam
    readonly peach_orchard: ConfKeyPeach_orchard
    readonly peach_orchard_audio: ConfKeyPeach_orchard_audio
    readonly phy_buy: ConfKeyPhy_buy
    readonly plot: ConfKeyPlot
    readonly practice: ConfKeyPractice
    readonly practice_multi: ConfKeyPractice_multi
    readonly preload_prefab: ConfKeyPreload_prefab
    readonly privilege_card: ConfKeyPrivilege_card
    readonly product_id: ConfKeyProduct_id
    readonly question_condition: ConfKeyQuestion_condition
    readonly race: ConfKeyRace
    readonly rank: ConfKeyRank
    readonly rank_awards: ConfKeyRank_awards
    readonly rank_boss: ConfKeyRank_boss
    readonly realm: ConfKeyRealm
    readonly recharge: ConfKeyRecharge
    readonly server_error_code: ConfKeyServer_error_code
    readonly seven_day_sign: ConfKeySeven_day_sign
    readonly shop: ConfKeyShop
    readonly skill: ConfKeySkill
    readonly skill_buff: ConfKeySkill_buff
    readonly skill_buff_decs: ConfKeySkill_buff_decs
    readonly skill_effect: ConfKeySkill_effect
    readonly skill_fx_delay: ConfKeySkill_fx_delay
    readonly sterious_man: ConfKeySterious_man
    readonly sterious_man_skin: ConfKeySterious_man_skin
    readonly sterious_man_through: ConfKeySterious_man_through
    readonly system_id: ConfKeySystem_id
    readonly system_info: ConfKeySystem_info
    readonly system_preference_id: ConfKeySystem_preference_id
    readonly system_preview: ConfKeySystem_preview
    readonly system_rank: ConfKeySystem_rank
    readonly task_daily: ConfKeyTask_daily
    readonly task_type: ConfKeyTask_type
    readonly title: ConfKeyTitle
    readonly tow_box: ConfKeyTow_box
    readonly tow_box_robot: ConfKeyTow_box_robot
    readonly tow_box_worker: ConfKeyTow_box_worker
    readonly tower: ConfKeyTower
    readonly tower_personal: ConfKeyTower_personal
    readonly tower_server: ConfKeyTower_server
    readonly trigger_gift: ConfKeyTrigger_gift
    readonly version: ConfKeyVersion
    readonly weapon: ConfKeyWeapon
    readonly weapon_award: ConfKeyWeapon_award
    readonly weapon_soul_add: ConfKeyWeapon_soul_add
    readonly weapon_soul_attribute: ConfKeyWeapon_soul_attribute
    readonly weapon_soul_extract: ConfKeyWeapon_soul_extract
    readonly weapon_soul_open: ConfKeyWeapon_soul_open
    readonly weapon_valuable: ConfKeyWeapon_valuable
    readonly wechat_template: ConfKeyWechat_template
    readonly world_level: ConfKeyWorld_level
    readonly world_level_add: ConfKeyWorld_level_add
    readonly worship_god: ConfKeyWorship_god
    readonly worship_skill: ConfKeyWorship_skill
}
