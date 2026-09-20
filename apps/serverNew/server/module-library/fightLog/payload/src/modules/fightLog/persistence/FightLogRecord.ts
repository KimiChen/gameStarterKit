import { RedisInstance, RedisRecord } from '@arthropoda/game-engine'
import { FightLogKeys } from './FightLogKeys'
import { PbFightLogItem } from '../FightLogC2S'

export class FightLogRecord extends RedisRecord<PbFightLogItem> {
    public static minLen = 100

    public static maxLen = 100

    public getRedis() {
        return RedisInstance.getServerRedis()
    }

    public static load(uId: int, type: int) {
        const key = FightLogKeys.FIGHT_LOG_KEY + type + '_' + uId
        return new FightLogRecord(key, this.minLen, this.maxLen)
    }

    async list() {
        return this.get(this.maxLen)
    }
}
