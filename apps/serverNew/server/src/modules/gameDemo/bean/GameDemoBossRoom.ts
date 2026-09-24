import { DiffMap, Mod, OnlyRedis, ServerHash } from '@arthropoda/game-engine'
import { GameDemoBossEventBean } from './GameDemoBossEventBean'
import { GameDemoBossFighterBean } from './GameDemoBossFighterBean'
import { GameDemoRewardBean } from './GameDemoRewardBean'

/**
 * 一个 Boss 房间的当前局（id = 配置中的 Boss 序号，从 1 开始）。
 *
 * 非玩家资源，由 Boss Action 在同一 Task Worker 串行写入。房内在线参与者经 `addNotifyUids`
 * 登记为接收者，框架在提交后自动推送 sync 帧；客户端据此刷新，不另设自定义推送。
 * 参与者、事件与奖励只落 Redis，同步面只携带轻量的局号 / 血量 / 版本。
 */
@Mod
export class GameDemoBossRoom extends ServerHash {
    id: int = 0
    runNumber: int = 0
    hp: int = 0
    phase: string = 'running'
    revision: int = 0
    respawnAt: int = 0

    /** 本局开局时间；与房间序号一起构成奖励来源，Redis 重建后也不会与旧局重复。 */
    @OnlyRedis
    startedAt: int = 0

    @OnlyRedis
    nextCounterAt: int = 0

    @OnlyRedis
    attackSeq: int = 0

    @OnlyRedis
    eventSeq: int = 0

    @OnlyRedis
    fighters?: DiffMap<int, GameDemoBossFighterBean>

    @OnlyRedis
    events?: DiffMap<int, GameDemoBossEventBean>

    /** 上一局的奖励，在下一局开启前持续幂等登记投递。 */
    @OnlyRedis
    rewards?: DiffMap<int, GameDemoRewardBean>
}
