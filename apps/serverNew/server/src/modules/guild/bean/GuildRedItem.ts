import { Bean } from '@arthropoda/game-engine'
import { OnlyNet } from '@arthropoda/game-engine'
import { UserInfoOnlyNetBean } from '../../user/bean/UserInfoOnlyNetBean'
import { DiffMap } from '@arthropoda/game-engine'
import { PropBean } from '../../props/bean/PropBean'
import { GuildRedRecordItem } from './GuildRedRecordItem'

export class GuildRedItem extends Bean {
    /**
     * 红包Id
     */
    id: int = 0

    /**
     * 发出的玩家id
     */
    uId: int = 0

    /**
     * 发出的玩家信息
     */
    @OnlyNet
    uInfo?: UserInfoOnlyNetBean

    /**
     * 发出的红包配置id
     */
    cId: int = 0

    /**
     * 红包发出的时间
     */
    time: int = 0

    /**
     * 红包数量
     */
    maxNum: int = 0

    /**
     * boss红包对应阶段
     */
    stage: int = 0

    /**
     * 聊天序号id
     */
    chatId: int = 0

    /**
     * 发出的红包奖励内容
     */
    awards?: DiffMap<int, PropBean>

    /**
     * 领取记录
     */
    records?: DiffMap<int, GuildRedRecordItem>
}
