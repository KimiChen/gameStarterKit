import { Service } from '../../runtime/protocol/ServiceType'
import { AwardResponse } from '../../runtime/protocol/C2S/commom'
import { PropBean } from '../../../generated/protocol/server/C2S/mod/props/PropBean'
import { FashionWearBean } from '../../../generated/protocol/server/C2S/mod/equip/FashionWearBean'
import { TimesBean } from '../../../generated/protocol/server/C2S/mod/user/TimesBean'
import { UserInfoOnlyNetBean } from '../../../generated/protocol/server/C2S/mod/user/UserInfoOnlyNetBean'

//#region 枚举定义
export enum PbAttrField {
    /** 无效位 */
    invalid = 0,
    /** 唯一标识 */
    id = 1,
    /** // 0玩家 2怪 */
    type = 2,
    /** 野怪配置Id */
    cId = 3,
    /** 剩余血量 */
    leftHp = 4,
    /** 最大血量 */
    maxHp = 5,
    /** 等级 */
    lv = 6,
    /** 名字 */
    name = 7,
    /** 选择的目标 */
    targetId = 8,
    /** 下一次复活轮次 */
    nextReviveRound = 9,
    /** 联盟Id */
    guild = 10,
    /** 主动技能开始轮次 */
    activeStartRound = 11,
    /** 普攻次数 */
    attackCount = 12,
    /** 被动技能2，当前进度 */
    passiveSkill = 13,
    /** effect列表 */
    effects = 14,
    /** 大招最大释放次数 */
    skillMaxTimes = 15,
    /** 大招释放次数 */
    skillTimes = 16,
    /** 累计恢复多少怒气 */
    skillRecoveryNum = 17,
    /** 恢复一次大招次数需要多少怒气 */
    skillRecoveryLimit = 18,
    /** 主动技能结束轮次 */
    activeEndRound = 19,
    /** 自动战斗 */
    autoFight = 20,
    /** 神通大招cd结束轮次 */
    activeCdRound = 21,
    /** 称号 */
    titleId = 22,
    /** 脸 */
    face = 23,
    /** 脸饰品 */
    faceDecorate = 24,
    /** 发饰 */
    hairDecorate = 25,
    /** 发型 */
    hair = 26,
    /** 境界 */
    realm = 27,
    /** 种族 */
    race = 28,
    /** 法宝强度 */
    weaponMaster = 29,
    /** 功法强度 */
    gongMaster = 30,
    /** 神通id */
    magicId = 31,
    /** 至宝id */
    rareId = 32,
    /** 时装id */
    fashionId = 33,
    /** 时装id */
    sex = 34,
    /** 主动大招技能Id */
    activeSkillId = 35,
    /** 被动技能结束轮次 */
    passiveEndRound = 36,
    /** 玩家区服 */
    sId = 37,
    /** 穿戴列表 */
    fashionWear = 38,
    /** 法宝等级 */
    weaponLv = 39,
    /** 装备穿戴表现 */
    equipWearShow = 40,
    /** 功法等级 */
    gongLv = 41,
    /** 红名值 */
    evil = 42,
    /** 下一次回满血轮次 */
    reLifeRound = 43,
    /** 离开轮次 */
    leaveRound = 44,
    /** 站位 */
    pos = 45,
    /** 境界皮肤 */
    realmImageId = 46,
    /** 主动大招技能等级 */
    activeSkillLv = 47,
    /** buff列表 */
    clientBuffs = 48,
    /** 结束位 */
    endIdx = 49,
}

/** 战斗状态枚举 */
export enum PbFightStatusBits {
    /** 无效位 */
    invalid = 0,
    /** 暴击 */
    crit = 1,
    /** 闪避 */
    dodge = 2,
    /** 审判 */
    judge = 3,
    /** aoe */
    aoe = 4,
    /** 额外伤害 */
    addHurt = 5,
    /** 连击 */
    combo = 6,
    /** 结束位 */
    endIdx = 7,
}

/** 装备穿戴表现枚举 */
export enum PbEquipWearShowBits {
    /** 无效位 */
    equipShowInvalid = 0,
    /** 穿戴六件红色装备 */
    allRed = 1,
    /** 当穿戴六件红色装备且每一件装备都存在三个特效 */
    effectMore = 2,
    /** 当穿戴六件红色装备且每一件装备都存在【彩色变异】特效 */
    effect21 = 3,
    /** 结束位 */
    equipShowEndIdx = 4,
}

//#endregion

//#region 对象结构

/** 场景对象单位，野怪/玩家 */
export interface PbSceneObjectItem {
    /** 唯一标识 */
    id: int
    /** 0玩家 1boss 2怪 3任务怪 4假人 */
    type: int
    /** 野怪配置Id */
    cId: int
    /** 剩余血量 */
    leftHp: int
    /**  最大血量 */
    maxHp: int
    /** 等级 */
    lv: int
    /** 名字 */
    name: string
    /** 选择的目标 */
    targetId: int
    /** 下一次复活轮次 */
    nextReviveRound: int
    /**联盟Id */
    guild: int
    /**主动技能开始轮次 */
    activeStartRound: int
    /**  普攻次数 */
    attackCount: int
    /**  被动技能2，当前进度 */
    passiveSkill: int
    /**effect列表*/
    effects: PbEffectItem[]
    /**大招最大释放次数 */
    skillMaxTimes: int
    /**大招释放次数 */
    skillTimes: int
    /** 累计恢复多少怒气 */
    skillRecoveryNum: int
    /** 恢复一次大招次数需要多少怒气 */
    skillRecoveryLimit: int
    /** 主动技能结束轮次 */
    activeEndRound: int
    /**自动战斗 */
    autoFight: boolean
    /** 神通大招cd结束轮次 */
    activeCdRound: int
    /** 称号id */
    titleId: int
    /** 脸 */
    face: int
    /** 脸饰品 */
    faceDecorate: int
    /** 发饰 */
    hairDecorate: int
    /** 发型 */
    hair: int
    /** 境界 */
    realm: int
    /** 种族 */
    race: int
    /** 法宝强度 */
    weaponMaster: int
    /** 功法强度 */
    gongMaster: int
    /** 神通id */
    magicId: int
    /** 至宝id */
    rareId: int
    /** 时装id */
    fashionId: int
    /** 性别 */
    sex: int
    /** 主动大招技能Id */
    activeSkillId: int
    /** 被动技能结束轮次 */
    passiveEndRound: int
    /** 玩家区服 */
    sId: int
    /** 穿戴列表 */
    fashionWear: FashionWearBean[]
    /** 等级 */
    weaponLv: int
    /** */
    equipWearShow: int
    /** 功法等级 */
    gongLv: int
    /** 红名值 */
    evil: TimesBean
    /** 下一次回满血轮次 */
    reLifeRound: int
    /** 离开轮次 */
    leaveRound: int
    /** 站位 */
    pos: int
    /** 境界皮肤 */
    realmImageId: int
    /** 主动技能等级 */
    activeSkillLv: int
    /** buff列表 */
    clientBuffs: PbBuffItem
}

/** 效果对象 */
export interface PbEffectItem {
    /** 效果ID */
    id: int
    /** 效果结束轮次 */
    endRound: int
}

/** buff对象 */
export interface PbBuffItem {
    /** buff唯一Id */
    id: int
    /** buffId */
    buffId: int
    /** 施加者 */
    fromId: int
    /** 叠加层数 */
    buffCount: int
    /** 效果结束轮次 */
    endRound: int
}

/** 血量数据对象 */
export interface PbBloodChangeItem {
    /** 怪物、玩家Id */
    id: int
    /** 剩余血量 */
    leftBlood: int
}

/** 玩家属性bitSet */
export interface PbActorAttrChange {
    /** 玩家id */
    id: int
    /** 修改数据位 */
    bitSet: int
    ActorAttrs: PbSceneObjectItem
}

/** 战斗日志,伤害、血量、buff相关同步 */
export interface PbSceneFightEventItem {
    /** 出手方角色ID */
    fromRoleId: int
    /** 目标角色ID */
    targetRoleId: int
    /** 事件类型 0、伤害；1、回血；2、增加buff；3、移除buff; 4、特殊表现; */
    type: int
    /** 技能效果ID */
    effectId: int
    /** buff唯一ID */
    buffUId: int
    /** buffID */
    buffId: int
    /** buff叠加层数 */
    buffCount: int
    /** 参数值1 伤害量、回血量 */
    value1: int
    /** 参数值2 真伤量 */
    value2: int
    /** 效果持续时间 */
    effectEndRound: int
    /** 状态位标记 */
    statusBits: int
    /** 来源id-供奉技能为坑位id */
    fromId: int
    /** 技能id */
    skillId: int
    /** 额外参数 */
    eventOtherInfo: PbEventOtherInfo
}

/** 战斗日志额外信息 */
export interface PbEventOtherInfo {
    /** 伤害结算次数：如 中毒结算次数等 */
    hurtSettleTimes: int
    /** 连杀次数 */
    multiKillTimes: int
}

/** 效果事件 */
export interface PbEffectEventItem {
    /** 类型 1使用道具 */
    type: int
    /** 配置Id */
    cId: int
    /** 数量 */
    num: int
    /** 玩家编号 */
    uId: int
}

/** 战斗结果同步 */
export interface PbRoundResult {
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
    /** 轮次 */
    round: int
    /** 战斗记录 */
    fightList: PbSceneFightEventItem[]
    /** 血量变更列表 */
    bloodList: PbBloodChangeItem[]
    /** 新加入的玩家 */
    addPlayers: PbSceneObjectItem[]
    /** 退出的玩家id */
    leavePlayers: int[]
    /** 角色属性bitSet */
    playerAttrs: PbActorAttrChange[]
    /** 效果事件 */
    effectEvents: PbEffectEventItem[]
    /** pve伤害排行 */
    pveHurtRank: PbSceneRank[]
    /** pve治疗排行 */
    pveAddHpRank: PbSceneRank[]
    /** pve控制排行 */
    pveControlRank: PbSceneRank[]
    /** 清空榜单：1伤害ScenePveHurt 2治疗ScenePveAddHp 3控制ScenePveControl */
    clearRanks: int[]
}

/** 场景排行 */
export interface PbSceneRank {
    /** 玩家编号 */
    uId: int
    /** 玩家姓名 */
    name: string
    /** 分数 */
    score: int
}

/** 场景排行个人名次 */
export interface PbSceneSelfRank {
    /**  榜单类型 1:pve伤害排行 2pve治疗排行 3pve控制排行 */
    type: int
    /**  玩家编号 */
    uId: int
    /**  玩家姓名 */
    name: string
    /**  排名 */
    rank: int
    /**  分数 */
    score: int
}

/** 玩家个人数据同步 */
export interface PbRoundActor {
    /** 扣除道具 */
    costProps: PropBean[]
    /** 归属者id */
    ownerId: int
    /** 结算状态 0无 1参与 3爱心援助 */
    result: int
    /** 通用奖励 */
    awards: PbRoundAward[]
    /** 结果串，json结构 */
    resultJson: string
    /** 装备穿戴信息 */
    equipWears: PbEquipWear[]
    /** 个人排行信息 */
    selfRank: PbSceneSelfRank[]
}

export interface PbEquipWear {
    /** 装备配置id */
    cId: int
    /** 所属坑位 */
    pos: int
    /** 装备耐久 */
    durable: int
    /** 耐久扣除点数 */
    costNum: int
}

/** 通用奖励 */
export interface PbRoundAward {
    /** 1击杀小怪,2归属奖励,3参与奖励,4爱心值奖励,5归属额外奖励 */
    type: int
    /** 奖励 */
    awards: PropBean[]
}

//#endregion

//#region 推送协议

/** PUSH:加入场景同步数据 */
export interface PushSceneJoinMessage {
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
    /** 轮次 */
    round: int
    /** 玩家列表 */
    players: PbSceneObjectItem[]
    /** 野怪数据 */
    npcItems: PbSceneObjectItem[]
    /** 房间Id */
    roomId: int
}

/**
 * PUSH:场景推送每轮的结果
 * 执行顺序  1、同步属性变更 playerAttrs 2、执行效果事件同步 3、同步新加入的玩家、离开场景的玩家 4、同步战斗日志 5、同步场景内所有玩家的剩余血量
 */
export interface PushSceneResultMessage {
    /** 战斗结果同步 */
    roundResult: PbRoundResult
    /** 玩家个人数据同步 */
    roundActor: PbRoundActor
}

/**
 * PUSH:场景玩家击杀消息
 */
export interface PushSceneKillMessage {}

/** 战斗邀请推送 */
export interface PushSceneInviteMessage {
    /** 邀请者玩家信息 */
    userInfo: UserInfoOnlyNetBean
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
    /** 邀请所在场景Id */
    inviteId: string
}

//#endregion

//#region 场景交互

/** 加入场景 */
export interface ReqSceneActorJoin extends Service<'SceneLobby'> {
    /** 系统Id  */
    systemId: int
    /** 配置Id  */
    cId: int
    /** 被邀请的Id  */
    inviter: string
    /** 指定房间Id  */
    roomId: int
    /** 场景指定额外参数 */
    ext: PbJoinExtParams[]
}

export interface PbJoinExtParams {
    /** 参数类型 竞技场level */
    type: string
    /** 参数值 */
    value: string
}

/** 离开场景 */
export interface ReqSceneActorLeave extends Service<'SceneLobby'> {
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
}

/** 玩家返回场景(同步玩家数据) */
export interface ReqSceneActorBack extends Service<'SceneLobby'> {
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
}

//#endregion

//#region 战斗操作

/** 原地复活 */
export interface ReqSceneActorRevive extends Service<'SceneLobby'> {
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
}

/** 选择目标 */
export interface ReqSceneActorSelect extends Service<'SceneLobby'> {
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
    /** 攻击目标Id */
    targetId: int
}

/** 使用技能 */
export interface ReqSceneActorSkill extends Service<'SceneLobby'> {
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
    /** 技能Id */
    skillId: int
}

/** 战斗设置 */
export interface ReqSceneActorFightSet extends Service<'SceneLobby'> {
    /** 系统Id */
    sysId: int
    /**  地图Id */
    cId: int
    /** 类型 1自动战斗,2模式切换,3自动反击,4自动释放妖术/神通,5自动使用丹药,6至宝,7时装,8神通,9丹药 */
    type: int
    /**  模式(1友好,2帮会,3区服,4全体) 穿戴类型(0off,1pvp,2pve,3all) 丹药(药品道具Id) */
    value: int
}

/** 场景内使用道具 */
export interface ReqSceneActorUseProp extends Service<'SceneLobby'> {
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
    /** 道具Id */
    propId: int
}

/** 丹药使用设置 */
export interface ReqSceneActorDrugSet extends Service<'SceneLobby'> {
    /** 系统Id */
    sysId: int
    /** 道具Id */
    propId: int
    /** 阈值 */
    limit: int
    /** 是否选中 */
    checked: boolean
}

//#endregion

//#region 关联系统接口

/** 修炼小人主动攻击 */
export interface ReqScenePracticeClick extends Service<'SceneLobby'> {
    /** 出手次数 */
    attackTimes: int
}

/** 修炼小人主动攻击响应伤害推送 */
export interface PushPracticeClickMessage {
    /** 玩家Id */
    uId: int
    /** 目标Id */
    toId: int
    /** 伤害值 */
    damage: int
}

/** 玩家战斗邀请 */
export interface ReqSceneInvitePageInvite extends Service<'SceneLobby'> {
    /** 邀请玩家列表 */
    targetIds: int
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
}

/** 屏蔽||取消屏蔽邀请 */
export interface ReqSceneInvitePageShield extends Service<'SceneLobby'> {
    /** 类型(1:屏蔽，2:取消屏蔽) */
    type: int
    /** 玩家ID */
    targetId: int
}

/** 获取场景信息 */
export interface ReqSceneDebugInfo extends Service<'SceneLobby'> {
    sceneId: string
}

/** 返回场景信息 */
export interface ResSceneDebugInfo {
    res: string
}

/** 获取指定地图房间列表 */
export interface ReqSceneActorGetRoomInfos extends Service<'SceneLobby'> {
    /** 系统Id */
    systemId: int
    /** 配置Id */
    cId: int
}

export interface ResSceneActorGetRoomInfos {
    list: PbRoomInfo[]
}

export interface PbRoomInfo {
    /** 房间Id */
    roomId: int
    /** 场景人数 */
    playerNum: int
}

/** 获取玩家当前场景位置 */
export interface ReqSceneInvitePageGetPlayerScene extends Service<'SceneLobby'> {
    uIds: int[]
}

export interface ResSceneInvitePageGetPlayerScene {
    sceneUsers: PbSceneUser[]
}

export interface PbSceneUser {
    uId: int
    sysId: int
    cId: int
    roomId: int
}

/** 竞技场逃跑 */
export interface ReqSceneArenaEscape extends Service<'SceneLobby'> {}

/** 战场内排行榜奖励领取 */
export interface ReqSceneActorRankAward extends Service<'SceneLobby'> {
    /** 榜单类型：1伤害ScenePveHurt 2治疗ScenePveAddHp 3控制ScenePveControl */
    rankTypeId: int
}

export interface ResSceneActorRankAward {
    awards: AwardResponse
}

/** 渡劫召唤NPC */
export interface ReqSceneRealmCallNpc extends Service<'SceneLobby'> {}

//#endregion
