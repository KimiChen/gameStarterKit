import { DiffMap, Mod, OnlyRedis, UserHash } from '@arthropoda/game-engine'
import { GameDemoMailBean } from './GameDemoMailBean'

/**
 * gameDemo 的玩家私有状态：材料、丹药、英雄、商店限购、最近一批炼丹与邮箱。
 *
 * 只由玩家 Owner（Event Worker）上的 Action 修改，随 `RedisTask` 统一提交并经 ModSync 同步给本人；
 * Task Worker 上的共享玩法只能 `loadOnlyRead`。金币不在这里，统一使用宿主 `User.copper`。
 */
@Mod
export class GameDemoPlayer extends UserHash {
    id: int = 0

    /** 已领取开发资源、开放玩法。 */
    initialized: boolean = false

    herb: int = 0
    dew: int = 0
    pill: int = 0
    finePill: int = 0

    heroLevel: int = 1
    heroExp: int = 0

    /** 限购所属业务日（UTC+8），跨日时计数归零。 */
    shopDay: string = ''
    shopHerb: int = 0
    shopDew: int = 0

    /** 最近一批炼丹；批次号只增不减，同时作为活动积分投递的幂等号。 */
    batchSeq: int = 0
    batchCount: int = 0
    batchStartedAt: int = 0
    batchPill: int = 0
    batchFinePill: int = 0
    batchScore: int = 0

    mailSeq: int = 0
    mails?: DiffMap<int, GameDemoMailBean>

    /** 已投递的奖励来源（source → mailId），保证可靠队列重复投递时只入箱一次；只保留最近的有界窗口。 */
    @OnlyRedis
    deliveredSources?: DiffMap<string, int>
}
