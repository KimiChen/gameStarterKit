import { ReqGuildResetGift } from '../GuildS2S'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { ActionGuild } from './ActionGuild'
import { Guild } from '../bean/Guild'

/**
 * 重置山头礼包
 */
export class ActionGuildResetGift extends ActionGuild {
    async doAction(req: ReqGuildResetGift, res: ResDefault) {
        const guild = await Guild.load(req.guildId)
        if (!guild) {
            return
        }

        const conf = C.guild_gift(ActionGuild.GUILD_GIFT)
        await ActionGuild.resetGuildGift(conf, guild)
    }
}
