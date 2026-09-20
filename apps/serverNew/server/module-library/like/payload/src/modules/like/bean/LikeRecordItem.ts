import { DiffArray } from '@arthropoda/game-engine'
import { Bean } from '@arthropoda/game-engine'

export class LikeRecordItem extends Bean {
    /**
     * 排行榜名称 每个系统点赞记录的唯一id
     */
    id: string = ''

    /**
     * 赞过的玩家id 或 妖盟id
     */
    ids?: DiffArray<int>
}
