import { timestamp } from '@arthropoda/game-engine'
import { ResDefault } from '../../../runtime/protocol/C2S/default'
import { GuildErrors } from '../../guild/GuildErrors'
import { ActionGuild } from '../../guild/action/ActionGuild'
import { AskItem } from '../../guild/bean/AskItem'
import { ReqPlantAskHelp } from '../PlantC2S'
import { PlantErrors } from '../PlantErrors'

/**
 * 发送求助
 */
export class ActionPlantAskHelp extends ActionGuild {
    async doAction(req: ReqPlantAskHelp, res: ResDefault) {
        const guild = await ActionGuild.load(this.user.guild)
        if (!guild) {
            throw GuildErrors.GuildNoGuild
        }

        const now = timestamp()
        // 求助cd
        if (this.user.plant.lastAskHelpTime + Param.PeachOrchardAskHelpCd > now) {
            throw PlantErrors.PlantAskIsCd
        }

        // 记录协助列表
        let askItem = guild.plantAskHelpList.get(this.user.id)
        if (!askItem) {
            askItem = new AskItem({ id: this.user.id })
            guild.plantAskHelpList.set(this.user.id, askItem)
        }
        // 更改协助时间
        askItem.askTime = now

        // 记录求助时间
        this.user.plant.lastAskHelpTime = now
        this.user.plant.dayPlantAskHelpTimes++

        // TaModulePlant.plantAskHelp(this.user)
    }
}
