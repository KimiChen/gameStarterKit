import { GuildListItemBean } from '../guild/GuildListItemBean'
import { GuildTimerBean } from '../guild/GuildTimerBean'
import { GuildMemberBean } from '../guild/GuildMemberBean'
import { AskItem } from '../guild/AskItem'
import { GuildRedItem } from '../guild/GuildRedItem'
import { GuildApply } from '../guild/GuildApply'

export interface Guild {
    /**
     * 联盟Id
     */
    id: int
    /**
     * 区服Id
     */
    sId: int
    /**
     * 联盟id
     */
    guildId: int
    /**
     * 联盟是否解散
     */
    isDissolution: boolean
    /**
     * 联盟图标
     */
    head: int
    /**
     * 联盟名称
     */
    name: string
    /**
     * 联盟等级
     */
    lv: int
    /**
     * 联盟经验
     */
    exp: int
    /**
     * 妖丹
     */
    demonPill: int
    /**
     * 联盟审核条件
     */
    open: int
    /**
     * 盟主id
     */
    leaderId: int
    /**
     * 联盟公告
     */
    notice: string
    /**
     * 联盟公告作者id
     */
    noticeWriterId: int
    /**
     * 联盟公告修改时间
     */
    noticeWriteTime: int
    /**
     * 盟主联系方式
     */
    contact: string
    /**
     * 联盟势力
     */
    power: int
    /**
     * 联盟列表
     */
    showList?: Map<int, GuildListItemBean>
    /**
     * 今日获得的联盟经验
     */
    todayExp: int
    /**
     * 今日捐献值
     */
    dayContribution: int
    /**
     * 点赞数
     */
    like: int
    /**
     * 妖盟拥有的旗帜
     */
    heads?: int[]
    /**
     * 联盟时间管理
     */
    guildTimer?: GuildTimerBean
    /**
     * 联盟内成员
     */
    members?: Map<int, GuildMemberBean>
    /**
     * 申请加入联盟<uId,time>
     */
    applyMembers?: Map<int, int>
    /**
     * 桃园求助列表
     */
    plantAskHelpList?: Map<int, AskItem>
    /**
     * 灵脉求助列表
     */
    lodeAskHelpList?: Map<int, AskItem>
    /**
     * 法阵<id,lv>
     */
    magics?: Map<int, int>
    /**
     * 已激活法阵
     */
    activeMagicId: int
    /**
     * 红包列表
     */
    reds?: Map<int, GuildRedItem>
    /**
     * 当前历练id
     */
    missionId: int
    /**
     * 上次历练结束时间
     */
    missionEndTime: int
    /**
     * 山头boss积分
     */
    guildBossScore: int
    /**
     * 山头boss试炼红包
     */
    guildBossRedId: int
    /**
     * 砍价-礼包id
     */
    giftId: int
    /**
     * 砍价-当前礼包价格
     */
    giftPrice: int
    /**
     * 砍价-已砍总次数
     */
    bargainTimes: int
    /**
     * 砍价-上次重置礼包的时间
     */
    lastRestGiftTime: int
    /**
     * 聊天消息置顶
     */
    topChat: string
}
