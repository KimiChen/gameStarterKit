import { timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { QueuedLocalAction as QueueAction } from '../../../runtime/action/QueuedLocalAction'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { GuildErrors } from '../../guild/GuildErrors'
import { Guild } from '../../guild/bean/Guild'
import { ActionLove } from '../../love/action/ActionLove'
import { LoveDefine } from '../../love/rules/LoveDefine'
import { User } from '../../user/bean/User'
import { ReqPlantWater, ResPlantWater } from '../PlantC2S'
import { PlantErrors } from '../PlantErrors'
import { ActionPlantHelpWater } from './ActionPlantHelpWater'

/**
 * 帮别人浇水
 */
export class ActionPlantWater extends GameAction {
    async doAction(req: ReqPlantWater, res: ResPlantWater) {
        const targetUid = req.targetUId
        if (!targetUid) {
            throw SystemErrors.SysParamError
        }

        if (targetUid !== this.user.id) {
            // 给别人浇水
            await this.helpWater(this.user, targetUid, res)
            return
        }

        const now = timestamp()

        if (!this.user.plant.matureTime) {
            this.user.plant.matureTime = now + Param.PeachOrchardCd
        }

        // 桃子已经成熟
        if (this.user.plant.matureTime <= now) {
            throw PlantErrors.PlantMature
        }

        // 浇水次数不足(每日浇水次数 = 每日固有次数 + 别人点击协助送的次数)
        if (this.user.plant.dayWaterTimes >= Param.PeachOrchardWaterTimes + this.user.plant.dayBeenHelpedWaterTimes) {
            throw PlantErrors.PlantNoWaterTimes
        }

        // 减少成熟时间
        const after = this.user.plant.matureTime - Param.PeachOrchardWaterReTime
        this.user.plant.matureTime = Math.max(after, now)

        // 记录浇水次数
        this.user.plant.dayWaterTimes++

        // TaModulePlant.plantWater(this.user);

        // 任务埋点
        // TaskHelper.update(this.user, 1, TaskDefine.TARGET_1078_PLANT_WATER);
    }

    /**
     * 协助别人浇水
     * @param user
     * @param targetUid
     * @param res
     * @returns
     */
    async helpWater(user: User, targetUid: int, _res: ResPlantWater) {
        const targetUser = await User.loadOnlyRead(targetUid)
        if (!targetUser) {
            return
        }

        const guild = await Guild.load(targetUser.guild)

        // 没有联盟
        if (!guild) {
            throw GuildErrors.GuildNoGuild
        }

        // 对方不是盟友
        if (targetUser.guild !== this.user.guild) {
            throw GuildErrors.GuildNotAlly
        }

        // 对方未发起协助
        if (!guild.plantAskHelpList.has(targetUid)) {
            throw PlantErrors.PlantNotAsk
        }

        // 已经协助过
        if (user.plant.hasHelpedUIds.includes(targetUid)) {
            throw PlantErrors.PlantHasWatered
        }

        // 协助次数不足
        if (user.plant.hasHelpedUIds.length() >= Param.PeachOrchardHelpTimes) {
            throw PlantErrors.PlantNoHelpTimes
        }

        // 被协助次数不足
        if (targetUser.plant.dayBeenHelpedWaterTimes >= Param.PeachOrchardHelpedTimes) {
            throw PlantErrors.PlantNoHelpedTimes
        }

        // 记录协助的玩家id
        user.plant.hasHelpedUIds.add(targetUid)

        // 投递到目标玩家进程处理
        await QueueAction.rpc(
            ActionPlantHelpWater,
            {
                uId: targetUid,
                guildId: guild.id,
                helpId: user.id,
            },
            targetUid,
            user.sId,
        )

        // TaModulePlant.plantHelp(this.user, targetUid, this.user.name);
        // TaModulePlant.plantBeenHelp(targetUser, this.user);

        // 获得爱心值
        await ActionLove.doBehaviorByType(this.user, LoveDefine.PLANT, true)

        // 发送到山头频道(浇水成功)
        // Push.sendSystemInfoById(SystemInfoDefine.PlantHelpWaterHelpGuildTip,
        //     [
        //         [SystemInfoDefine.PARAM_DEFAULT, this.user.name],
        //         [SystemInfoDefine.PARAM_DEFAULT, targetUser.name],
        //         [SystemInfoDefine.PARAM_DEFAULT, 1],
        //     ],
        //     [Push.ARGS_GUILD_ID => this.user.guild]);

        // // 任务更新
        // TaskHelper.update(this.user, 1, TaskDefine.TARGET_1090_HELP_WATER);
    }
}
