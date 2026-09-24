import { Service } from '../../runtime/protocol/ServiceType'

/** 可靠队列投递到玩家 Owner 的奖励邮件；`source` 是业务幂等号，重复投递只入箱一次。 */
export interface ReqGameDemoMailDeliver extends Service<'Base'> {
    source: string
    title: string
    gold: int
}

/** 炼丹提交后投递到活动所在 Task Worker 的积分；`uid:batchId` 在同一期内只计一次。 */
export interface ReqGameDemoSeasonScore extends Service<'Base'> {
    uid: int
    batchId: int
    score: int
    at: int
}

/** 每秒推进活动：开期、到期定榜、登记奖励与开启下一期。 */
export interface ReqGameDemoSeasonTick extends Service<'Base'> {}

/** 每秒推进三个 Boss 房间：自动攻击、反击、复活、结算与换局。 */
export interface ReqGameDemoBossTick extends Service<'Base'> {}
