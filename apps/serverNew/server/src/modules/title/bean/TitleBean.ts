import { Bean, DiffMap } from '@arthropoda/game-engine'
import { TitleItem } from './TitleItem'

export class TitleBean extends Bean {
    /**
     * 称号ID
     */
    titleId: int = 0

    /**
     * 称号过期时间
     */
    titleExpire: int = 0

    /**
     * 称号信息
     */
    titles?: DiffMap<int, TitleItem>
}
