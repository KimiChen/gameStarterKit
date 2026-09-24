import { DiffMap, ServerHash } from '@arthropoda/game-engine'
import { GameDemoBossMemberBean } from './GameDemoBossMemberBean'

/**
 * 本区服 Boss 大厅（单例 id=1）：记录每位玩家当前所在房间。
 *
 * 「同一账号同时只在一个房间」跨越三个房间，所以大厅与三个房间共用同一个 Boss 串行组。
 */
export class GameDemoBossLobby extends ServerHash {
    id: int = 0
    members?: DiffMap<int, GameDemoBossMemberBean>
}
