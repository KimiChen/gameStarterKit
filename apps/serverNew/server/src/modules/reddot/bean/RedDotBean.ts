import { Bean, DiffArray } from '@arthropoda/game-engine'

export class RedDotBean extends Bean {
    /**
     * 红点类型
     */
    type: string = ''

    /**
     * 红点数量
     */
    state: int = 0

    /**
     * 红点额外信息，这里用来标记红点位置
     */
    extraIds?: DiffArray<int>
}
