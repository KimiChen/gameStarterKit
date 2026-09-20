import { GuildRoleDefine } from '../rules/GuildRoleDefine'
import { ItemIdDefine } from '../../props/rules/ItemIdDefine'
import { AwardResponse, PropItem } from '../../../runtime/protocol/C2S/commom'
import { ReqGuildMemberDonate, ResGuildMemberDonate } from '../GuildC2S'
import { ActionGuild } from './ActionGuild'
import { Props } from '../../props/inventory/Props'

/**
 * 成员捐献
 */
export class ActionGuildMemberDonate extends ActionGuild {
    async doAction(req: ReqGuildMemberDonate, res: ResGuildMemberDonate) {
        const user = this.user
        // 捐献的妖盟令数量
        const num = req.num

        // 校验权限
        const guildCache = await ActionGuild.checkPower(user, GuildRoleDefine.ACTION_DONATE)

        // 每日重置捐献值
        await ActionGuild.dayInit(guildCache)

        const guildConf = C.guild(guildCache.lv)
        const buildConf = C.guild_build(1)

        // 消耗道具
        const costNum = buildConf.costNum * num
        await Props.costProp(user, buildConf.costId, costNum)

        // 最多可获得妖盟经验
        const donateDiff = guildConf.donateLimit - guildCache.dayContribution

        const maxLv = C.guild().end().id

        let donateLimit = guildConf.donateLimit
        if (guildCache.exp + donateDiff >= guildConf.exp && guildCache.lv < maxLv) {
            // 触发升级
            donateLimit = C.guild(guildCache.lv + 1).donateLimit
        }

        // 计算可以获得多少份妖盟经验
        const donateVal = buildConf.donate
        const maxExpNum = Math.floor((donateLimit - guildCache.dayContribution) / donateVal)
        const expNum = Math.min(num, maxExpNum)

        const awards: PropItem[] = []

        // 个人贡献
        for (const awardItem of buildConf.award) {
            if (awardItem.propId === ItemIdDefine.ITEM_ID_GUILD_CONTRIBUTE) {
                awards.push({
                    propId: ItemIdDefine.ITEM_ID_GUILD_CONTRIBUTE,
                    num: num * awardItem.num,
                })
                continue
            }

            if (awardItem.propId === ItemIdDefine.ITEM_ID_GUILD_EXP) {
                awards.push({
                    propId: ItemIdDefine.ITEM_ID_GUILD_EXP,
                    num: expNum * awardItem.num,
                })
            }
        }

        // 增长捐献值
        guildCache.dayContribution += expNum * donateVal

        // 今日贡献次数
        guildCache.members.get(user.id)!.dayBuildTimes += num

        const awardRes: AwardResponse = { awards: [] }
        await Props.addProps(user, awards, awardRes)

        res.awards = awardRes
    }
}
