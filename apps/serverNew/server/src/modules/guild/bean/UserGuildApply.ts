import { ServerHash } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'

/**
 * 联盟申请记录
 */
export class UserGuildApply extends ServerHash {
    id: int = 0

    /**
     * 玩家Id
     */
    uId: int = 0

    /**
     * 申请记录<guild,time>
     */
    records?: DiffMap<int, int>
}
