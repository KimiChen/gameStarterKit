import { Props } from '../../props/inventory/Props'
import { ReqGuildCompensate, ResGuildCompensate } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { ActionGuild } from './ActionGuild'

/**
 * 补差
 */
export class ActionGuildCompensate extends ActionGuild {
    async doAction(req: ReqGuildCompensate, res: ResGuildCompensate) {
        const guild = await Guild.load(this.user.guild)
        if (!guild) {
            throw GuildErrors.GuildNoGuild
        }

        // 检测重置礼包
        await ActionGuild.checkGuildRestGift(guild)
        await ActionGuild.checkUserRestGift(this.user)

        // 没有领取次数
        if (this.user.isCompensate) {
            throw GuildErrors.GuildNoCompensate
        }

        const conf = C.guild_gift(ActionGuild.GUILD_GIFT)
        const giftConf = conf.gifts.get(guild.giftId)

        // 没买东西
        if (!this.user.dayGuildGiftTimes) {
            throw GuildErrors.GuildNotBuyGift
        }

        // 计算差价
        const diffPrice = this.user.guildGiftBuyPrice - guild.giftPrice
        if (!diffPrice) {
            throw GuildErrors.GuildLowestPrice
        }

        // 差价领取记录
        this.user.isCompensate = true

        await Props.addProp(this.user, giftConf.costId, diffPrice * this.user.dayGuildGiftTimes, res.awards)

        // TaModuleGuild.guildGift(this.user, guild, guild.giftPrice, guild.giftPrice)
    }
}
