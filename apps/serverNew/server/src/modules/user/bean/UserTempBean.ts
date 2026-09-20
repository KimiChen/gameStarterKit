import { Mod, OnlyRedis } from '@arthropoda/game-engine'
import { ServerHash } from '@arthropoda/game-engine'

// @Mod
export class UserTempBean extends ServerHash {
    id: int = 0

    /**
     * 上次世界、临时聊天发言时间
     */
    @OnlyRedis
    chatTime: int = 0

    /**
     * 上次世界、临时聊天发言时间
     */
    @OnlyRedis
    guildChatTime: int = 0

    /**
     * 上次世界、临时聊天发言时间
     */
    @OnlyRedis
    crossChatTime: int = 0

    expireTime(): number {
        return 30 * 86400
    }
}
