import { ActionGuildCreate } from '../action/ActionGuildCreate'
import { AdjustChange } from '../../adjust/change/AdjustChange'
import { RedisService } from '@arthropoda/game-engine'

export class AdjustGuild extends AdjustChange {
    /**
     * 创建联盟
     * @group 联盟
     * @canCustom
     * @sort 1
     */
    async createGuild() {
        const action = new ActionGuildCreate()
        action.setUser(this.user)
        await action.doAction(
            {
                guildName: 'gn',
                head: 11001,
                notice: '',
                contact: '',
                open: 1,
            },
            {},
        )
        await RedisService.save()
    }
}
