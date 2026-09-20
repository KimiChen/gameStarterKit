import { timestamp } from '@arthropoda/game-engine'
import { Props } from '../../props/inventory/Props'
import { ReqGuildBuy, ResGuildBuy } from '../GuildC2S'
import { GuildErrors } from '../GuildErrors'
import { Guild } from '../bean/Guild'
import { ActionGuild } from './ActionGuild'

/**
 * 购买
 */
export class ActionGuildBuy extends ActionGuild {
    async doAction(req: ReqGuildBuy, res: ResGuildBuy) {
        const guild = await Guild.load(this.user.guild)
        if (!guild) {
            throw GuildErrors.GuildNoGuild
        }

        // 检测重置礼包
        await ActionGuild.checkGuildRestGift(guild)
        await ActionGuild.checkUserRestGift(this.user)

        const conf = C.guild_gift(ActionGuild.GUILD_GIFT)
        const giftConf = conf.gifts.get(guild.giftId)

        // 当前在砍价阶段 ，需要先砍价再购买
        if (!this.user.dayBargainTimes && timestamp() - guild.lastRestGiftTime < conf.cutTime) {
            throw GuildErrors.GuildNoCut
        }

        // 购买次数限制
        if (this.user.dayGuildGiftTimes >= Param.guildCutGiftBuyLimit) {
            throw GuildErrors.GuildGiftLimt
        }

        // 当前礼包的价格
        const giftPrice = guild.giftPrice

        // 价格被砍到负
        if (giftPrice < 0) {
            await Props.addProp(this.user, giftConf.costId, Math.abs(giftPrice), res.awards)
        } else if (giftPrice > 0) {
            // 扣除道具
            await Props.costProp(this.user, giftConf.costId, giftPrice)
        }

        // 添加礼包奖励
        await Props.addProps(this.user, giftConf.awards, res.awards)

        // 购买次数记录
        this.user.dayGuildGiftTimes++

        // 购买的价格记录
        this.user.guildGiftBuyPrice = giftPrice

        // TaModuleGuild.guildGift(this.user, guild, guild.giftPrice, guild.giftPrice)
    }
}
