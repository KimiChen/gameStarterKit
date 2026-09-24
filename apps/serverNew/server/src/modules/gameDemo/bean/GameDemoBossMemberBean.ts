import { Bean } from '@arthropoda/game-engine'

/** 玩家当前所在 Boss；generation 每次换房递增，旧房间的迟到请求据此拒绝。 */
export class GameDemoBossMemberBean extends Bean {
    uid: int = 0
    bossId: string = ''
    generation: int = 0
}
