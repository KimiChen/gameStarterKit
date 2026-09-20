import { CenterHash } from '@arthropoda/game-engine'
import { DiffArray } from '@arthropoda/game-engine'
import { Mod, OnlyNet, OnlyRedis } from '@arthropoda/game-engine'
import { DiffMap } from '@arthropoda/game-engine'
import { GuildListItemBean } from './GuildListItemBean'
import { GuildMemberBean } from './GuildMemberBean'
import { GuildTimerBean } from './GuildTimerBean'
import { AskItem } from './AskItem'
import { GuildRedItem } from './GuildRedItem'
import { GuildApply } from './GuildApply'

/**
 * 联盟信息
 */
@Mod
export class Guild extends CenterHash {
    //#region 基础数据

    /**
     * 联盟Id
     */
    id: int = 0

    /**
     * 区服Id
     */
    sId: int = 0

    /**
     * 联盟id
     */
    guildId: int = 0

    /**
     * 联盟是否解散
     */
    @OnlyRedis
    isDissolution: boolean = false

    /**
     * 联盟图标
     */
    head: int = 0

    /**
     * 联盟名称
     */
    name: string = ''

    /**
     * 联盟等级
     */
    lv: int = 0

    /**
     * 联盟经验
     */
    exp: int = 0

    /**
     * 妖丹
     */
    demonPill: int = 0

    /**
     * 联盟审核条件
     */
    open: int = 0

    /**
     * 盟主id
     */
    leaderId: int = 0

    /**
     * 联盟公告
     */
    notice: string = ''

    /**
     * 联盟公告作者id
     */
    noticeWriterId: int = 0

    /**
     * 联盟公告修改时间
     */
    noticeWriteTime: int = 0

    /**
     * 盟主联系方式
     */
    contact: string = ''

    /**
     * 联盟势力
     */
    power: int = 0
    //#endregion

    //#region 客户端同步OnlyNet
    /**
     * 联盟列表
     */
    @OnlyNet
    showList?: DiffMap<int, GuildListItemBean>
    //#endregion

    //#region 其他数据

    /**
     * 今日获得的联盟经验
     */
    todayExp: int = 0

    /**
     * 今日捐献值
     */
    dayContribution: int = 0

    /**
     * 点赞数
     */
    like: int = 0

    /**
     * 妖盟拥有的旗帜
     */
    heads?: DiffArray<int>

    /**
     * 联盟时间管理
     */
    @OnlyRedis
    guildTimer?: GuildTimerBean
    //#endregion

    //#region 成员相关
    /**
     * 联盟内成员
     */
    members?: DiffMap<int, GuildMemberBean>

    /**
     * 申请加入联盟<uId,time>
     */
    @OnlyRedis
    applyMembers?: DiffMap<int, int>

    /**
     * 申请加入联盟玩家信息
     */
    @Mod
    @OnlyNet
    guildApply?: DiffMap<int, GuildApply>

    /**
     * 桃园求助列表
     */
    plantAskHelpList?: DiffMap<int, AskItem>

    /**
     * 灵脉求助列表
     */
    lodeAskHelpList?: DiffMap<int, AskItem>
    //#endregion

    //#region 法阵
    /**
     * 法阵<id,lv>
     */
    magics?: DiffMap<int, int>

    /**
     * 已激活法阵
     */
    activeMagicId: int = 0
    //#endregion

    //#region 红包
    /**
     * 红包列表
     */
    reds?: DiffMap<int, GuildRedItem>
    //#endregion

    //#region 历练
    /**
     * 当前历练id
     */
    missionId: int = 0

    /**
     * 上次历练结束时间
     */
    missionEndTime: int = 0

    /**
     * 山头boss积分
     */
    guildBossScore: int = 0

    /**
     * 山头boss试炼红包
     */
    @OnlyRedis
    guildBossRedId: int = 0
    //#endregion

    //#region 砍价

    /**
     * 砍价-礼包id
     */
    giftId: int = 0

    /**
     * 砍价-当前礼包价格
     */
    giftPrice: int = 0

    /**
     * 砍价-已砍总次数
     */
    bargainTimes: int = 0

    /**
     * 砍价-上次重置礼包的时间
     */
    lastRestGiftTime: int = 0

    /**
     * 聊天消息置顶
     */
    topChat: string = ''
    //#endregion

    getNotifyUids() {
        return this.members?.keys() ?? []
    }
}
