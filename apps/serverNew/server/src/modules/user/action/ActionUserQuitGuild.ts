import { timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { GuildDefine } from '../../guild/rules/GuildDefine'
import { UserErrors } from '../UserErrors'
import { ReqUserQuitGuild } from '../UserS2S'
import { User } from '../bean/User'

/**
 * 玩家退出联盟事件
 */
export class ActionUserQuitGuild extends GameAction {
    async doAction(req: ReqUserQuitGuild, res: ResDefault) {
        const user = await User.load(req.uId)
        if (!user) {
            throw UserErrors.UserNoUser
        }
        // 玩家已经加入其他联盟
        if (user.guild != req.guildId) {
            return
        }

        // 重置玩家身上的联盟数据
        user.guild = 0
        user.guildName = ''
        user.guildRole = 0

        // 是否需要退盟cd
        if (GuildDefine.isQuitCd(req.quitType) && Param.GuildQuitCD > 0) {
            user.nextCanAddGuildTime = timestamp() + Param.GuildQuitCD
        }
    }
}
