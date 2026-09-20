import { Bean } from '@arthropoda/game-engine'
import { OnlyNet } from '@arthropoda/game-engine'
import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'

export class GuildRedRecordItem extends Bean {
    /**
     * 玩家id
     */
    uId: int = 0

    /**
     * 玩家信息
     */
    @OnlyNet
    uInfo?: UserInfoOnlyNetBean

    /**
     * 领取的时间
     */
    time: int = 0

    /**
     * 领取的奖励列表（json格式）
     */
    awards: string = ''
}
