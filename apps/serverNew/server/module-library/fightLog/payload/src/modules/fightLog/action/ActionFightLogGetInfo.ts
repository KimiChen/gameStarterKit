import { GameAction } from '../../../runtime/action/GameAction'
import { ReqFightLogGetInfo, ResFightLogGetInfo } from '../FightLogC2S'
import { FightLogRecord } from '../persistence/FightLogRecord'
import { FightLogRecordSchema } from '../rules/FightLogRecordSchema'

/**
 * 请求日志列表
 */
export class ActionFightLogGetInfo extends GameAction {
    async doAction(req: ReqFightLogGetInfo, res: ResFightLogGetInfo) {
        let types = req.logTypes
        if (types.length == 0) {
            types = [FightLogRecordSchema.TYPE_USER, FightLogRecordSchema.TYPE_MONSTER, FightLogRecordSchema.TYPE_OTHER]
        }

        for (const type of types) {
            const log = FightLogRecord.load(this.user.id, type)
            const list = await log.list()
            switch (type) {
                case FightLogRecordSchema.TYPE_USER:
                    res.playerLogs = list
                    break
                case FightLogRecordSchema.TYPE_MONSTER:
                    res.monsterLogs = list
                    break
                case FightLogRecordSchema.TYPE_OTHER:
                    res.otherLogs = list
                    break
                case FightLogRecordSchema.TYPE_GUILD:
                    res.guildLogs = list
                    break
                case FightLogRecordSchema.TYPE_GUILD_BARGAIN:
                    res.bargainLogs = list
                    break
                case FightLogRecordSchema.TYPE_HOME:
                    res.homeLogs = list
                    break
            }
        }
    }
}
