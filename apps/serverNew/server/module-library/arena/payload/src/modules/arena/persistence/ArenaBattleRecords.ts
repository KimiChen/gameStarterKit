import { RedisRecord, UtilTime, timestamp } from '@arthropoda/game-engine'
import { ArenaBattleRecordKeys } from './ArenaBattleRecordKeys'
import { ArenaBattleRecordItem } from './ArenaBattleRecordItem'

export class ArenaBattleRecords extends RedisRecord<ArenaBattleRecordItem> {
    /** 排行榜最少可保留记录数 */
    public static minLen = 20

    /** 排行榜最多可保留记录数，超过后会截取minLen长度 */
    public static maxLen = 20

    static initKey(uId: int) {
        return ArenaBattleRecordKeys.ARENA_BATTLE_RECORDS + ':' + uId
    }

    public static load(key: string = ArenaBattleRecordKeys.ARENA_BATTLE_RECORDS) {
        return new ArenaBattleRecords(key, this.minLen, this.maxLen)
    }

    /**
     * 添加单条战报
     * @param uId
     * @param record
     */
    static async addItem(uId: int, record: ArenaBattleRecordItem) {
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
