import { Service } from '../../runtime/protocol/ServiceType'

/**
 * 重置山头礼包
 */
export interface ReqGuildResetGift extends Service<'Guild'> {
    guildId: int
}
