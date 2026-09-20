import { ReqGuildMission, ResGuildMission } from '../GuildC2S'
import { ActionGuild } from './ActionGuild'

/**
 * 获取妖盟历练详情
 */
export class ActionGuildMission extends ActionGuild {
    async doAction(req: ReqGuildMission, res: ResGuildMission) {
        // 检测是否拥有联盟
        const guild = await ActionGuild.checkUserGuild(this.user)

        const missionConf = C.guild_mission(guild.lv)
        const monsterConf = C.monster(missionConf.monsterId)

        res.missionId = missionConf.id
        res.bossHp = monsterConf.hp
        res.playerNum = 1
    }
}
