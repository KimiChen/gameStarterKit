import { GameDemoMailBean } from '../gameDemo/GameDemoMailBean'

export interface GameDemoPlayer {
    id: int
    /**
     * 已领取开发资源、开放玩法。
     */
    initialized: boolean

    herb: int

    dew: int

    pill: int

    finePill: int

    heroLevel: int

    heroExp: int
    /**
     * 限购所属业务日（UTC+8），跨日时计数归零。
     */
    shopDay: string

    shopHerb: int

    shopDew: int
    /**
     * 最近一批炼丹；批次号只增不减，同时作为活动积分投递的幂等号。
     */
    batchSeq: int

    batchCount: int

    batchStartedAt: int

    batchPill: int

    batchFinePill: int

    batchScore: int

    mailSeq: int

    mails?: Map<int, GameDemoMailBean>
    /**
     * 已投递的奖励来源（source → mailId），保证可靠队列重复投递时只入箱一次；只保留最近的有界窗口。
     */
    deliveredSources?: Map<string, int>
}
