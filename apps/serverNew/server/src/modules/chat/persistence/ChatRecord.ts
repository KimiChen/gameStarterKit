import { RedisInstance } from '@arthropoda/game-engine'
import { RedisRecord } from '@arthropoda/game-engine'
import { ChatMessge } from '../../../runtime/protocol/C2S/commom'

/**
 * 聊天记录
 */
export class ChatRecord extends RedisRecord<ChatMessge> {
    public static minLen = 100

    public static maxLen = 100

    public getRedis() {
        return RedisInstance.getServerRedis()
    }

    public static load(key: string) {
        return new ChatRecord(key, this.minLen, this.maxLen)
    }
}
