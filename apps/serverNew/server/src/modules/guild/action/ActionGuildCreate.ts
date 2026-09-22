import { DB, timestamp } from '@arthropoda/game-engine'
import { CenterGuildModel } from '../../../../generated/persistence/CenterGuildModel'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { Props } from '../../props/inventory/Props'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { ActionGuild } from './ActionGuild'
import { GuildCreateRequest } from './GuildCreateRequest'

/**
 * 创建妖盟
 */
export class ActionGuildCreate extends ActionGuild {
    async doAction(req: GuildCreateRequest, res: ResDefault) {
        const name = req.guildName // 妖盟名称
        const head = req.head // 图标
        const open = req.open // 妖盟自由加入状态
        const notice = req.notice // 公告
        const contact = req.contact // 盟主联系方式

        const user = this.user

        // 玩家已经加入妖盟，不能创建
        if (user.guild && user.guild > 0) {
            throw GuildErrors.GuildAlreadyGuild
        }

        // 参数错误
        if (!head || !name || !open) {
            throw SystemErrors.SysParamError
        }

        // 校验参数
        ActionGuild.validate(head, open, name, notice, contact)

        // 创建妖盟消耗，道具不够直接抛出异常
        await Props.costProp(user, Param.GuildCreateCost[0], Param.GuildCreateCost[1])

        const curTs = timestamp()
        // 开启事务
        await DB.startTransaction(async (queryRunner) => {
            // 判断妖盟名字是否被使用
            // if ((await CenterGuild.count({ where: { guildName: name } })) > 0) {
            //     throw GuildErrors.GuildNameHasExist
            // }

            // 初始化妖盟信息
            const guildModel = CenterGuildModel.create()
            guildModel.guildName = name
            guildModel.guildCreateTime = curTs
            guildModel.userId = user.id.toString()
            guildModel.sid = user.sId

            await queryRunner.manager.save(guildModel)

            const guildId = guildModel.guildId
            if (!guildId) {
                await queryRunner.rollbackTransaction()
                throw SystemErrors.SysParamError.params({ vars: [guildId, guildId] })
            }

            // 初始化妖盟缓存信息
            const guildCache = new Guild(guildId)
            guildCache.guildId = guildId
            guildCache.sId = user.sId
            guildCache.lv = 1
            guildCache.name = name // 妖盟名称
            guildCache.head = head // 图标
            guildCache.leaderId = user.id // 盟主id
            guildCache.open = open // 开放方式
            guildCache.notice = notice // 公告
            guildCache.contact = contact // 盟主联系方式

            // 盟主加入妖盟
            await ActionGuild.addMember(guildCache, user, true)

            await queryRunner.commitTransaction()

            // 更新联盟经验榜
            // Rank.getRedisRank(RankDefine:: TYPE_GUILD_LEVEL) -> set($hGuild -> id, $hGuild -> lv)

            // 联盟活跃榜
            // Rank.getRedisRank(RankDefine:: TYPE_GUILD_ACTIVE_TIME) -> set($guildId, timestamp())

            // 砍价商店初始化
            await ActionGuild.checkGuildRestGift(guildCache)
        })
    }
}
