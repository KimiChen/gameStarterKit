import { ApiCall } from '@arthropoda/game-engine'
import { ReqGuildGetInfo, ResGuildGetInfo } from '../GuildC2S'
import { ActionGuild } from './ActionGuild'

/**
 * 获取联盟信息
 */
export class ActionGuildGetInfo extends ActionGuild {
    async getBindId(call: ApiCall): Promise<number | undefined> {
        return (call.req as ReqGuildGetInfo).guildId
    }

    async doAction(req: ReqGuildGetInfo, res: ResGuildGetInfo) {
        let guildId = this.user.guild
        if (req.guildId > 0) {
            guildId = req.guildId
        }

        const guild = await ActionGuild.modSetGuild(guildId)

        if (!guild) {
            return
        }

        res.guildInfo = guild.toModData() as any
    }
}
