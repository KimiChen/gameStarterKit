import { GameAction } from '../../../runtime/action/GameAction'
import { Guild } from '../../guild/bean/Guild'
import { ResDefault } from '../../../runtime/protocol/S2S/default'
import { ReqPlantHelpWater } from '../PlantS2S'
import { SessionMgr } from '@arthropoda/game-engine'

/**
 * 协助浇水
 */
export class ActionPlantHelpWater extends GameAction {
    async doAction(req: ReqPlantHelpWater, res: ResDefault) {
        const guild = await Guild.load(req.guildId)
        if (!guild) {
            return
        }

        // 记录被协助次数
        this.user.plant.dayBeenHelpedIds.add(req.helpId)
        this.user.plant.dayBeenHelpedWaterTimes++

        // 修改被协助次数change,底层会自动推送所有联盟成员
        guild.members.get(this.user.id)!.dayHelpedTimes = this.user.plant.dayBeenHelpedWaterTimes
    }
}
