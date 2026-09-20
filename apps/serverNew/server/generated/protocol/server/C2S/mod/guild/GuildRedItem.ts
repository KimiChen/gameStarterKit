import { UserInfoOnlyNetBean } from '../user/UserInfoOnlyNetBean'
import { PropBean } from '../props/PropBean'
import { GuildRedRecordItem } from '../guild/GuildRedRecordItem'

export interface GuildRedItem {
    /**
     * 红包Id
     */
    id: int
    /**
     * 发出的玩家id
     */
    uId: int
    /**
     * 发出的玩家信息
     */
    uInfo?: UserInfoOnlyNetBean
    /**
     * 发出的红包配置id
     */
    cId: int
    /**
     * 红包发出的时间
     */
    time: int
    /**
     * 红包数量
     */
    maxNum: int
    /**
     * boss红包对应阶段
     */
    stage: int
    /**
     * 聊天序号id
     */
    chatId: int
    /**
     * 发出的红包奖励内容
     */
    awards?: Map<int, PropBean>
    /**
     * 领取记录
     */
    records?: Map<int, GuildRedRecordItem>
}
