import { RedisRecord, UtilTime, timestamp } from '@arthropoda/game-engine'
import { LodeBattleRecordItem } from './LodeBattleRecordItem'
import { LodeBattleRecordKeys } from './LodeBattleRecordKeys'
import { GameIdGenerator } from '../../../runtime/identity/GameIdGenerator'
import { LodeDefine } from '../rules/LodeDefine'
import { PropItem } from '../../../runtime/protocol/C2S/commom'
import { SystemInfoDefine } from '../../serverSettings/runtime/SystemInfoDefine'
import { UserBaseRef } from '../../user/ref/UserBaseRef'

export class LodeBattleRecords extends RedisRecord<LodeBattleRecordItem> {
    /** 排行榜最少可保留记录数 */
    public static minLen = 20

    /** 排行榜最多可保留记录数，超过后会截取minLen长度 */
    public static maxLen = 20

    static initKey(uId: int) {
        return LodeBattleRecordKeys.LODE_BATTLE_RECORDS + ':' + uId
    }

    public static load(key: string = LodeBattleRecordKeys.LODE_BATTLE_RECORDS) {
        return new LodeBattleRecords(key, this.minLen, this.maxLen)
    }

    /**
     * 进攻方日志
     */
    static async atk(
        atkId: int,
        defId: int,
        defType: int,
        isWin: boolean,
        targetLodeId: int,
        realm: int,
        awards: PropItem[] = [],
    ) {
        //#region 进攻方战报
        const battleRecord = new LodeBattleRecordItem()
        battleRecord.reportId = await GameIdGenerator.getUniqueId(GameIdGenerator.MODULE_LODE_ATTACK)
        battleRecord.type = LodeDefine.FIGHT_ATK
        battleRecord.targetId = defId
        battleRecord.targetType = defType
        battleRecord.targetLodeId = targetLodeId
        battleRecord.realm = realm
        battleRecord.result = isWin ? LodeDefine.FIGHT_RESULT_WIN : LodeDefine.FIGHT_RESULT_LOSE

        const lodeConf = C.lode(realm)

        let dataId = 0
        const data: { [key: string]: any } = {}
        data[1] = [SystemInfoDefine.PARAM_DEFAULT, lodeConf.name]
        if (defType === LodeDefine.MATCH_TARGET_NPC) {
            data[0] = [SystemInfoDefine.PARAM_MONSTER, defId]

            // 您成功战胜了占领{1}的{0}，获得{1}的归属权，获得奖励{2}
            dataId = 129
        } else {
            const defUser = await UserBaseRef.load(defId)
            data[0] = [SystemInfoDefine.PARAM_DEFAULT, defUser?.name ?? '']

            // 您成功赶走了盘踞于{1}的{0}，获得{1}的归属权，获得奖励{2}
            dataId = 128
        }

        if (isWin) {
            if (awards) {
                data[2] = [SystemInfoDefine.PARAM_AWARDS, awards]
            }
        } else {
            // 在抢夺{1}的过程中，您不幸落败与{0}
            dataId = 127
        }

        battleRecord.dataId = dataId
        battleRecord.data = JSON.stringify(data)
        await this.addItem(atkId, battleRecord)
        //#endregion
    }

    /**
     * 防守方日志
     * @param int  defId
     * @param int  atkId
     * @param int  atkType
     * @param bool isWin
     * @param int  targetLodeId
     * @param int  realm
     * @return void
     */
    static async def(defId: int, atkId: int, atkType: int, isWin: boolean, targetLodeId: int, realm: int) {
        //#region 进攻方战报
        const battleRecord = new LodeBattleRecordItem()
        battleRecord.reportId = await GameIdGenerator.getUniqueId(GameIdGenerator.MODULE_LODE_DEFEND)
        battleRecord.type = LodeDefine.FIGHT_DEF
        battleRecord.targetId = atkId
        battleRecord.targetType = atkType
        battleRecord.targetLodeId = targetLodeId
        battleRecord.realm = realm
        battleRecord.result = isWin ? LodeDefine.FIGHT_RESULT_WIN : LodeDefine.FIGHT_RESULT_LOSE

        let dataId = 0
        const data: { [key: string]: any } = {}
        // 文本日志
        const lodeConf = C.lode(realm)
        const atkUser = await UserBaseRef.load(atkId)
        data[0] = [SystemInfoDefine.PARAM_DEFAULT, atkUser?.name ?? '']
        data[1] = [SystemInfoDefine.PARAM_DEFAULT, lodeConf.name]
        if (isWin) {
            dataId = 130
        } else {
            // 您不幸被{0}击败，{1}失守
            dataId = 126
        }

        battleRecord.dataId = dataId
        battleRecord.data = JSON.stringify(data)
        await this.addItem(defId, battleRecord)
        //#endregion
    }

    /**
     * 添加单条战报
     * @param uId
     * @param record
     */
    static async addItem(uId: int, record: LodeBattleRecordItem) {
        const redis = this.load(this.initKey(uId))
        if (record.fightTime <= 0) {
            record.fightTime = timestamp()
        }
        await redis.add(record)
        await redis.expire(UtilTime.DAY_SECOND * 30)
    }

    /**
     * 战报列表
     * @param uId
     * @param num
     * @returns
     */
    static async getListJson(uId: int, num = 20) {
        const redis = this.load(this.initKey(uId))
        await redis.expire(UtilTime.DAY_SECOND * 30)
        return redis.get(num)
    }
}
