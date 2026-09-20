import { AwardResponse } from '../../runtime/protocol/C2S/commom'
import { Service } from '../../runtime/protocol/ServiceType'
import { Guild } from '../../../generated/protocol/server/C2S/mod/guild/Guild'

/**
 * 申请加入妖盟
 */
export interface ReqGuildApply extends Service<'Guild'> {
    /** 妖盟ID */
    guildId: int
}

/**
 * 创建妖盟
 */
export interface ReqGuildCreate extends Service<'Guild'> {
    /** 妖盟名称 */
    guildName: string
    /** 旗帜 */
    head: int
    /** 公告 */
    notice: string
    /** 联系方式 */
    contact: string
    /** 开放条件 */
    open: int
}

/**
 * 获取妖盟信息
 */
export interface ReqGuildGetInfo extends Service<'Guild'> {
    /** 妖盟ID */
    guildId: int
}

export interface ResGuildGetInfo {
    guildInfo?: Guild
}

/**
 * 妖盟职位任命
 */
export interface ReqGuildMemberAssign extends Service<'Guild'> {
    /** 目标成员id */
    targetId: int
    /** 职位id */
    role: int
}

/**
 * 加入联盟审核
 */
export interface ReqGuildMemberAudit extends Service<'Guild'> {
    /** 操作 1 同意 2 拒绝 3 拒绝所有 4通过所有 */
    action: int
    /** 被操作对象的用户id */
    targetId: int
}

/**
 * 解散妖盟
 */
export interface ReqGuildMemberDissolution extends Service<'Guild'> {}

/**
 * 成员捐献
 */
export interface ReqGuildMemberDonate extends Service<'Guild'> {
    /** 次数 */
    num: int
}

export interface ResGuildMemberDonate {
    awards: AwardResponse
}

/**
 * 捐献妖丹
 */
export interface ReqGuildMemberDonatePill extends Service<'Guild'> {
    /** 妖丹数量 */
    num: int
}

/**
 * 踢出联盟成员
 */
export interface ReqGuildMemberKick extends Service<'Guild'> {
    /** 目标成员id */
    targetId: int
}

/**
 * 法阵激活
 */
export interface ReqGuildMemberMagicActivate extends Service<'Guild'> {
    /** 法阵id */
    id: int
}

/**
 * 法阵升级
 */
export interface ReqGuildMemberMagicUpgrade extends Service<'Guild'> {
    /** 法阵id */
    id: int
}

/**
 * 秘法升级
 */
export interface ReqGuildMemberMfUp extends Service<'Guild'> {
    /** 秘法id */
    id: int
}

/**
 * 快速加入开放妖盟
 */
export interface ReqGuildMemberQuickJoin extends Service<'Guild'> {}

/**
 * 退出妖盟
 */
export interface ReqGuildMemberQuit extends Service<'Guild'> {}

/**
 * 修改联盟信息
 */
export interface ReqGuildMemberSet extends Service<'Guild'> {
    /** 公告 */
    notice: string
    /** 开放方式 */
    open: int
    /** 图标 */
    head: int
    /** 盟主联系方式 */
    contract: string
    /** 妖盟名称 */
    name: string
}

/**
 * 打开红包
 */
export interface ReqGuildOpenRed extends Service<'Guild'> {
    /**
     * 红包id
     */
    id: int
}

export interface ResGuildOpenRed {
    awards: AwardResponse
}

/**
 * 提醒
 */
export interface ReqGuildNotice extends Service<'Guild'> {
    /**
     * 1 功绩红包 2试炼 3 砍价提醒
     */
    type: int
}

/**
 * 邀请玩家入盟的推送
 */
export interface PushInviteToGuild {
    /** 邀请人的ID */
    uId: int
    /** 邀请人的名称 */
    name: string
    /** 邀请加入的妖盟ID */
    guildId: int
    /** 邀请加入的妖盟名称 */
    guildName: string
    /** 联盟旗帜 */
    guildHead: int
    /** 联盟等级 */
    guildLv: int
    /** 邀请加入的联盟大王名称 */
    leaderName: string
}

/**
 * 邀请加入联盟
 */
export interface ReqGuildInvite extends Service<'Guild'> {
    /**
     * 邀请玩家的ID
     */
    uId: int
}

/**
 * 获取妖盟历练详情
 */
export interface ReqGuildMission extends Service<'Guild'> {}

export interface ResGuildMission {
    /** 历练id */
    missionId: int
    /** boss剩余血量 */
    bossHp: int
    /** 场内人数 */
    playerNum: int
}

/**
 * 获取山头boss信息
 */
export interface ReqGuildBoss extends Service<'Guild'> {}

export interface ResGuildBoss {
    score: int
    rank: int
}

/**
 * 砍价
 */
export interface ReqGuildBargain extends Service<'Guild'> {}

/**
 * 补差
 */
export interface ReqGuildCompensate extends Service<'Guild'> {}

export interface ResGuildCompensate {
    awards: AwardResponse
}

/**
 * 购买
 */
export interface ReqGuildBuy extends Service<'Guild'> {}

export interface ResGuildBuy {
    awards: AwardResponse
}
