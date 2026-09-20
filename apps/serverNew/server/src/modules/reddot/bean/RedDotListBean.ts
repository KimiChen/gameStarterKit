import { Bean, DiffMap } from '@arthropoda/game-engine'
import { RedDotBean } from './RedDotBean'

export class RedDotListBean extends Bean {
    /**
     * 红点类型
     */
    type: string = ''

    /**
     * 红点信息
     */
    redDot?: DiffMap<string, RedDotBean>
}
