import { getRedis } from '../../../../src/differ/redis'
import { RedisRecord } from '../../../../src/differ/RedisRecord'
import { ChatMessge } from '../../../../src/share/protocols/commom'

export class ChatRecord extends RedisRecord<ChatMessge> {
    public static minLen = 100

    public static maxLen = 100

    public getRedis() {
        return getRedis()
    }

    public static load(key: string) {
        return new ChatRecord(key, this.minLen, this.maxLen)
    }
}
