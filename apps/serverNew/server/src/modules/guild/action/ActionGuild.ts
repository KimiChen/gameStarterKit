import { IActionLogic, UserOnlineMgr, UtilTime, getServerIdByUid, timestamp } from '@arthropoda/game-engine'
import { UserTextValidation } from '../../../modules/user/rules/UserTextValidation'
import { LocalAction } from '../../../runtime/action/LocalAction'
import { GameRandom } from '../../../runtime/random/GameRandom'
import { RankAccess } from '../../rank/persistence/RankAccess'
import { RankDefine } from '../../rank/rules/RankDefine'
import { ActionUserFieldValUpdate } from '../../user/action/ActionUserFieldValUpdate'
import { ActionUserQuitGuild } from '../../user/action/ActionUserQuitGuild'
import { ActionUser } from '../../user/action/ActionUser'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { User } from '../../user/bean/User'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { GuildMemberBean } from '../bean/GuildMemberBean'
import { GuildTimerBean } from '../bean/GuildTimerBean'
import { UserGuildApply } from '../bean/UserGuildApply'
import { GuildMemberRef } from '../ref/GuildMemberRef'
import { GuildDefine } from '../rules/GuildDefine'
import { GuildRoleDefine } from '../rules/GuildRoleDefine'

interface GuildProfilePatch {
    name?: string
    notice?: string
    head?: int
    open?: int
    contact?: string
}

/**
 * 联盟模块
 */
export class ActionGuild extends ActionUser implements IActionLogic {
    setUser(user: User) {
        this._user = user
    }

    static GUILD_GIFT = 'guildGift'

    //#region  Mod构建
    /**
     * 下发申请加入联盟玩家列表
     */
    static modSetGuildApply() {}

    /**
     * 下发联盟信息
     */
    static async modSetGuild(guildId: int) {
        if (guildId == 0) {
            return
        }
        const guild = await Guild.load(guildId)
        if (!guild) {
            return
        }

        // 每日数据重置
        await this.dayInit(guild)

        // 山头礼包重置
        await this.checkGuildRestGift(guild, false)

        // 检验是否自动转让盟主
        await this.autoTransferLeader(guild)

        let guildFp = 0
        const memberList = await GuildMemberRef.loadAll(guild.members.keys())
        for (const [, memeber] of guild.members) {
            const user = memberList.get(memeber.uId)
            if (!user) {
                continue
            }
            memeber.isOnline = await UserOnlineMgr.isOnline(user.id, user.sId)
            memeber.userInfo = UserProfileFormatter.format(user)
            guildFp += user.fp
        }

        guild.power = guildFp

        return guild
    }

    /**
     * 下发联盟列表
     */
    static modSetGuildList() {}
    //#endregion

    //#region 校验
    /**
     * 每日数据重置
     * @param guild
     * @returns
     */
    static async dayInit(guild: Guild) {
        if (guild.guildTimer == null) {
            guild.guildTimer = new GuildTimerBean()
        }

        // 第一次不存在
        if (!guild.guildTimer.dailyInitTime) {
            guild.guildTimer.dailyInitTime = UtilTime.getCurrentResetTime()
            return
        }
        if (guild.guildTimer.dailyInitTime > timestamp()) {
            return
        }
        // 重置数据
        // 下次过期时间
        guild.guildTimer.dailyInitTime = UtilTime.getCurrentResetTime()
        // 重置妖盟今日经验
        guild.todayExp = 0

        // 重置妖盟每日捐献值
        guild.dayContribution = 0

        // 重置妖盟每日山头积分
        guild.guildBossScore = 0

        // 重置积分榜
        await RankAccess.getRedisRank(RankDefine.TYPE_GUILD_MEMBER_SCORE, guild.id).clear()

        // 重置每日桃园协助列表
        guild.plantAskHelpList.clear()

        // 重置每日灵脉协助列表
        guild.lodeAskHelpList.clear()

        // 每日贡献次数重置
        for (const [, member] of guild.members) {
            // 每日贡献次数重置
            member.dayBuildTimes = 0
            // 今日桃园被协助次数重置
            member.dayHelpedTimes = 0
            // 今日灵脉被协助次数重置
            member.dayLodeBeHelpedTimes = 0
        }
    }

    /**
     * 判断玩家是否提交了加入妖盟申请
     * @param guild
     * @param userId
     * @returns
     */
    static checkUserIsApplyGuild(guild: Guild, userId: int) {
        return guild.applyMembers.has(userId)
    }

    /**
     * 校验参数
     * @param head
     * @param open
     * @param name
     * @param notice
     * @param contact
     */
    static validate(head: int, open: int, name: string, notice: string, contact: string) {
        // 校验妖盟旗帜
        head && C.guild_flag(head)

        // 校验加入条件
        open && C.guild_apply(open)

        // 敏感词检测
        // GameFilter.sensitiveWord(name + ',' + notice + ',' + contact)

        // 校验妖盟名称长度
        UserTextValidation.checkStringLenValid(name, Param.GuildCreateChinseNameLimit, Param.GuildCreateOtherNameLimit)
        // 校验妖盟公告长度
        UserTextValidation.checkStringLenValid(
            notice,
            Param.GuildCreateNoticeLimit,
            0,
            0,
            GuildErrors.GuildNoticeToLong,
        )
        // 校验盟主联系方式
        UserTextValidation.checkStringLenValid(
            contact,
            Param.GuildCreateContactLimit,
            0,
            0,
            GuildErrors.GuildContactToLong,
        )
    }

    /**
     * 检查玩家能否能加入联盟
     * @param user
     */
    static checkJoin(user: User) {
        // 玩家已经加入妖盟，不能申请
        if (user.guild > 0) {
            throw GuildErrors.GuildAlreadyGuild
        }

        // 下次可以加入妖盟时间
        if (timestamp() < user.nextCanAddGuildTime) {
            // 加入妖盟冷却中
            throw GuildErrors.GuildLeaveCd
        }
    }

    /**
     * 获取联盟等级
     * @param id
     * @returns
     */
    static async getGuildLevel(id: int) {
        const guild = await this.load(id)
        return guild?.lv ?? 0
    }

    /**
     * 设置妖盟信息
     * @param guild
     * @param params
     */
    static setGuildInfo(guild: Guild, params: GuildProfilePatch) {
        // 修改妖盟名称
        if (params.name && params.name != guild.name) {
            const name = params.name
            // const name = GameFilter.filterChar(params.name);
            // 校验妖盟公告长度
            UserTextValidation.checkStringLenValid(
                name,
                Param.GuildCreateChinseNameLimit,
                Param.GuildCreateOtherNameLimit,
            )
            guild.name = name
        }

        // 修改公告
        if (params.notice && params.notice != guild.notice) {
            const notice = params.notice
            // notice = GameFilter.filterChar(params.notice)
            // 校验妖盟公告长度
            UserTextValidation.checkStringLenValid(notice, Param.GuildCreateNoticeLimit)
            guild.notice = notice
        }

        // 修改图标
        if (params.head && params.head != guild.head) {
            // 校验妖盟旗帜
            const flag = C.guild_flag(params.head).flag
            // 设置妖盟头像
            guild.head = parseInt(flag)
        }

        // 修改自由加入状态
        if (params.open && C.guild_apply(params.open) && params.open != guild.open) {
            guild.open = params.open
        }

        // 修改盟主联系方式
        if (params.contact && params.contact != guild.contact) {
            const contact = params.contact
            // contact = GameFilter.filterChar(params.contact)
            guild.contact = contact
        }
    }

    /**
     * 检查权限
     * @param user
     * @param actionId
     * @returns
     */
    static async checkPower(user: User, actionId: int) {
        // 检测是否拥有联盟
        const guildItem = await this.checkUserGuild(user)

        // 获取对于角色
        // 当前玩家所在联盟的职位，默认为成员
        const role = this.getGuildRoleByPower(guildItem, user.id, actionId)
        if (!role) {
            throw GuildErrors.GuildNoPower
        }
        return guildItem
    }

    /**
     * 获取联盟职位
     * @param guild
     * @param uId
     * @param actionId
     * @returns
     */
    static getGuildRoleByPower(guild: Guild, uId: int, actionId: int) {
        // 当前玩家所在联盟的职位，默认为成员
        const role = guild.members.get(uId)?.role ?? GuildDefine.ROLE_MEMBER
        const powerId = GuildRoleDefine.getRolePower(role) // 当前玩家的联盟权限
        if (actionId & powerId) {
            // 二进制运算，判断权限
            return role
        }
        return 0
    }

    /**
     * 检验用户联盟
     * @param HUser user
     * @return HGuild
     */
    static async checkUserGuild(user: User) {
        if (!user.guild) {
            // 您暂未加入联盟
            throw GuildErrors.GuildNotJoinGuild
        }

        const guldCache = await ActionGuild.load(user.guild)

        if (!guldCache) {
            // 您暂未加入联盟
            throw GuildErrors.GuildIsNull
        }

        return guldCache
    }
    //#endregion

    //#region 妖盟经验
    /**
     * 增加妖盟个人贡献和周贡献
     * @param guild
     * @param exp
     */
    static addExp(guild: Guild, exp: int): void {
        guild.exp += exp // 妖盟总经验
        guild.todayExp += exp // 今日妖盟获得经验

        // 是否触发升级
        const isUp = { stat: false }
        this.lvUp(guild, isUp)

        // 更新妖盟经验榜
        // const conf = C.guild(guild.lv)
        // const score = guild.lv + guild.exp / (conf.exp + 1)
        // Rank.getRedisRank(RankDefine.TYPE_GUILD_LEVEL).set(guild.id, score)
        // 同步战斗场景
        // isUp && SceneSync.syncSceneGuild(guild)
    }

    /**
     * 自动升级
     * @param guild
     * @param isUp
     * @returns
     */
    static lvUp(guild: Guild, isUp: { stat: boolean }) {
        const nextConf = C.guild(guild.lv + 1)
        if (nextConf == null) {
            return
        }
        const guildConf = C.guild(guild.lv)
        const needExp = guildConf.exp
        if (guild.exp < needExp) {
            return
        }

        guild.lv++
        guild.exp -= needExp
        isUp.stat = true
        this.lvUp(guild, isUp)
    }
    //#endregion

    //#region 重写Guild的load方法
    /**
     * 重写load方法，添加妖盟解散状态判断
     * @param id
     * @returns
     */
    static async load(id: int) {
        const guild = await Guild.load(id)
        if (!guild || guild.isDissolution) {
            return null
        }
        return guild
    }

    static async loadUserApply(uId: int, init: boolean = true) {
        let cache = await UserGuildApply.load(uId)
        if (!cache && init) {
            cache = new UserGuildApply(uId)
        }
        return cache
    }

    //#endregion

    /**
     * 获取有该权限的用户id集合
     * @param guild
     * @param actionIds
     * @returns
     */
    static getRoleMembers(guild: Guild, ...actionIds: int[]) {
        const ids: int[] = []
        for (const [, member] of guild.members) {
            // 当前玩家的权限
            const powerId = GuildRoleDefine.getRolePower(member.role)
            for (const actionId of actionIds) {
                // 二进制运算，判断权限
                if (actionId & powerId && !ids.includes(member.uId)) {
                    ids.push(member.uId)
                }
            }
        }
        return ids
    }

    /**
     * 添加用户加入联盟
     * @param guild
     * @param user
     * @param isCreate
     */
    static async addMember(guild: Guild, user: User, isCreate = false) {
        const uId = user.id
        // 在线状态
        const isOnline = await UserOnlineMgr.isOnline(uId, user.sId)

        // 成员角色
        const role = isCreate ? GuildDefine.ROLE_LEADER : GuildDefine.ROLE_MEMBER
        const memberItem = new GuildMemberBean({
            uId: uId,
            role: role,
            joinTime: timestamp(),
            dayBuildTimes: 0,
            isOnline: isOnline,
            userInfo: UserProfileFormatter.format(user),
        })
        guild.members.set(uId, memberItem)

        // 删除申请记录
        guild.applyMembers.delete(uId)
        const userApply = await UserGuildApply.load(uId)
        userApply?.delete()

        // 玩家联盟数据修改
        user.guild = guild.guildId
        user.guildName = guild.name
        user.guildRole = role

        // 联盟事件
        // GuildTrigger.join(user, guild, isCreate);
    }

    /**
     * 自动流转盟主
     * @param guildCache
     * @returns
     */
    static async autoTransferLeader(guildCache: Guild) {
        const leader = await GuildMemberRef.load(guildCache.leaderId)

        // 不需要转让
        if (UtilTime.dayDiffOfNature(leader!.activityTime, timestamp()) < Param.GuildLeaderAutoTransferTime) {
            return
        }

        const find = []
        const users = await GuildMemberRef.loadAll(guildCache.members.keys())
        for (const [, member] of guildCache.members) {
            find.push({
                uId: member.uId,
                role: member.role,
                active: users.get(member.uId)?.activityTime ?? 0,
            })
        }

        // 优先活跃玩家＞副盟主＞长老＞成员 active倒序、role 正序进行排序
        find.sort((a, b) => {
            if (a.active < b.active) {
                return b.active - a.active
            }
            if (a.role < b.role) {
                return 1
            }
            if (a.role > b.role) {
                return -1
            }
            return 0
        })

        const targetId = find.at(0)?.uId ?? 0
        if (targetId < 0) {
            return
        }

        // 执行自动转让逻辑，并推送结果
        await this.memberAssign(guildCache, guildCache.leaderId, targetId, GuildDefine.ROLE_LEADER)
    }

    /**
     * 联盟任命 此方法仅执行操作，不做判断
     * @param guildCache
     * @param uId      操作人
     * @param targetId 被操作人
     * @param role     目标职位
     */
    static async memberAssign(guildCache: Guild, uId: int, targetId: int, role: int) {
        // 盟主转让
        if (GuildDefine.ROLE_LEADER === role) {
            // 更新旧盟主联盟职位
            LocalAction.send(
                ActionUserFieldValUpdate,
                {
                    uId: uId,
                    data: [
                        {
                            field: 'guildRole',
                            val: GuildDefine.ROLE_MEMBER.toString(),
                        },
                    ],
                },
                uId,
                getServerIdByUid(uId),
            )

            // 任命盟主，即将联盟转让给指定玩家，自己变成普通成员
            guildCache.members.get(uId)!.role = GuildDefine.ROLE_MEMBER
            guildCache.leaderId = targetId
        }

        // 修改对应成员的职位
        guildCache.members.get(targetId)!.role = role

        // 更新目标成员联盟职位
        LocalAction.send(
            ActionUserFieldValUpdate,
            {
                uId: uId,
                data: [
                    {
                        field: 'guildRole',
                        val: role.toString(),
                    },
                ],
            },
            uId,
            getServerIdByUid(uId),
        )
    }

    /**
     * 玩家退盟操作
     * @param user
     * @param guild
     * @param quitType
     * @param clearMember 联盟解散不清除
     */
    static async quitGuild(uId: int, guild: Guild, quitType: int, clearMember: boolean = true) {
        // 删除妖盟内该成员
        if (clearMember) {
            guild.members.delete(uId)
        }

        // 同步到玩家进行修改数据
        LocalAction.send(
            ActionUserQuitGuild,
            {
                uId: uId,
                guildId: guild.guildId,
                quitType: quitType,
            },
            uId,
            getServerIdByUid(uId),
        )

        // 退出联盟触发器
        // GuildTrigger.quit(user, guild, quitType, adminName)
    }

    /**
     * 检查重置山头礼包数据
     * @param guild
     * @param isGuildTask
     */
    static async checkGuildRestGift(guild: Guild, isGuildTask: boolean = true) {
        const conf = C.guild_gift(ActionGuild.GUILD_GIFT)

        // 需要重置山头的礼包数据
        if (timestamp() - guild.lastRestGiftTime < conf.cutTime + conf.rebateTime) {
            return
        }

        // 在联盟进程直接重置
        if (isGuildTask) {
            await this.resetGuildGift(conf, guild)
        } else {
            // 延迟加载用于避开 ActionGuildResetGift 对本类的初始化环依赖。
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { ActionGuildResetGift } = require('./ActionGuildResetGift')
            LocalAction.send(ActionGuildResetGift, { guildId: guild.guildId }, 0, guild.sId)
        }
    }

    /**
     * 检查重置玩家礼包数据
     * @param temp
     */
    static async checkUserRestGift(temp: User) {
        const conf = C.guild_gift(this.GUILD_GIFT)
        const duration = conf.cutTime + conf.rebateTime
        const now = timestamp()

        const timeStr = UtilTime.formatYMD() + ' ' + conf.resetTime
        const restTime = UtilTime.parseYmdHis(timeStr)

        // 需要重置个人的礼包数据
        if (now - temp.lastRestGiftTime > duration) {
            temp.lastRestGiftTime = restTime

            // 重置数据
            temp.dayGuildGiftTimes = 0
            temp.guildGiftBuyPrice = 0
            temp.dayBargainTimes = 0
            temp.isCompensate = false
        }
    }

    /**
     * 重置山头礼包数据
     * @param conf
     * @param guild
     */
    static async resetGuildGift(conf: IConfGuild_gift, guild: Guild) {
        guild.lastRestGiftTime = timestamp()

        //随机礼包配置
        const giftConf = GameRandom.randomByWeightConfigMap(conf.gifts)

        //重置数据
        guild.giftId = giftConf.giftId
        guild.giftPrice = giftConf.costNum
        guild.bargainTimes = 0

        //删除砍价记录
    }

    /**
     * 判断当前是否在砍价｜购买阶段
     * @param guild
     * @param conf
     * @returns
     */
    static isCutTime(guild: Guild, conf: IConfGuild_gift) {
        return timestamp() - guild.lastRestGiftTime < conf.cutTime
    }
}
