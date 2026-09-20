import { RedisInstance } from '@arthropoda/game-engine'
import { ChannelLoginProfile } from '../access/ChannelLoginProfile'

export class UserLoginProfile {
    static async load(openId: string): Promise<ChannelLoginProfile> {
        return RedisInstance.getCenterRedis().getObject(`${openId}_login`)
    }
}
