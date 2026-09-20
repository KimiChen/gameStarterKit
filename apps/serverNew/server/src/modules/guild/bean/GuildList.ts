import { ServerHash } from '@arthropoda/game-engine'
import { Mod, OnlyNet } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { GuildListItemBean } from './GuildListItemBean'

/**
 * 联盟显示列表
 */
@OnlyNet
@Mod
export class GuildList extends ServerHash {
    id: int = 0

    /**
     * 联盟列表
     */
    l?: DiffMap<int, GuildListItemBean>
}
