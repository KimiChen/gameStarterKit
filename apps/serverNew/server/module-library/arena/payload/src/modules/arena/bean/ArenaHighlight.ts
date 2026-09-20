import { DiffArray, DiffMap, ServerHash, UtilTime } from '@arthropoda/game-engine'
import { ArenaHighlightItem } from './ArenaHighlightItem'

export class ArenaHighlight extends ServerHash {
    /**
     * id日期
     */
    id: int = 0

    /**
     * 新星
     */
    stars?: DiffArray<int>

    /**
     * 玩家信息
     */
    highlightRecords?: DiffMap<int, ArenaHighlightItem>

    expireTime(): number {
        return 2 * UtilTime.DAY_SECOND
    }
}
