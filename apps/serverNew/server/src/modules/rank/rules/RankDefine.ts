import { RankListDaily } from '../list/RankListDaily'
import { RankListSystem } from '../list/RankListSystem'
import { RankGuildRef } from '../ref/RankGuildRef'
import { RankUserRef } from '../ref/RankUserRef'
import { RankRefBase } from '@arthropoda/game-engine'
import { RankMemberDefine } from './RankMemberDefine'
import { RankListActivity } from '../list/RankListActivity'

interface IConfSet {
    isCenter?: boolean // 是否跨服榜单
    memberType: string // 排行榜成员类型
    rankRef: typeof RankRefBase // DiffRank 排名对象的元素映射类
    rankListClass: typeof RankListSystem // 使用哪个类处理列表
    subInfo?: boolean // 关联其他子项信息
}

export class RankDefine {
    /**总评分榜单 供跨服历练使用*/
    static readonly TYPE_FP = 'fp'

    // #region 每日个人榜
    /**等级榜*/
    static readonly TYPE_LEVEL = 'Level'

    /**境界榜*/
    static readonly TYPE_REALM = 'Realm'

    /**成就榜*/
    static readonly TYPE_ACHIEVE = 'Achieve'

    /**颜值榜*/
    static readonly TYPE_APPEARANCE = 'Appearance'

    /** 灵气掉落冲榜 */
    static readonly TYPE_RankAbPointDraw = 'RankAbPointDraw'
    // #endregion

    // #region 每日装备榜
    /**头饰评分榜 */
    static readonly TYPE_EQ_HAIR = 'EqHair'

    /**服饰评分榜 */
    static readonly TYPE_EQ_CLOTHES = 'EqClothes'

    /**护腕评分榜 */
    static readonly TYPE_EQ_WRISTBAND = 'EqWristband'

    /**鞋子评分榜 */
    static readonly TYPE_EQ_SHOE = 'EqShoe'

    /**腰带评分榜 */
    static readonly TYPE_EQ_BELT = 'EqBelt'

    /**裤子评分榜 */
    static readonly TYPE_EQ_PANTS = 'EqPants'
    // #endregion

    // #region 每日妖盟榜
    /** 妖盟等级 */
    static readonly TYPE_GUILD_LEVEL = 'GuildLevel'

    /** 联盟活跃时间 */
    static readonly TYPE_GUILD_ACTIVE_TIME = 'GuildActiveTime'

    /** 山头boss成员积分榜 */
    static readonly TYPE_GUILD_MEMBER_SCORE = 'GuildMemberScore'
    // #endregion

    //#region  斩心魔榜
    /**斩心魔榜*/
    static readonly TYPE_HEART_DEMON = 'HeartDemon'
    //#endregion

    // #region 竞技场相关
    /** 竞技场声望排行榜 */
    static readonly TYPE_ARENA_PRESTIGE = 'ArenaPrestige'

    /** 天梯每日分数排行榜 */
    static readonly TYPE_ARENA_TIER_DAILY = 'ArenaTierDaily'

    /** 天梯赛季分数排行榜 */
    static readonly TYPE_ARENA_TIER_SEASON = 'ArenaTierSeason'
    // #endregion

    //#region  每个组的排行榜

    /**
     * 个人榜
     */
    static readonly TYPE_PERSONAL = 1

    /**
     * 装备榜
     */
    static readonly TYPE_EQUIP = 2

    /**
     * 妖盟榜
     */
    static readonly TYPE_GUILD = 3

    /**
     * 副本
     */
    static readonly TYPE_DUNGEON = 4

    /**
     * 每个组的排行榜
     */
    static readonly RankMapGroup: Map<int, Array<[string, int]>> = new Map([
        [
            this.TYPE_PERSONAL,
            [
                [RankDefine.TYPE_LEVEL, this.TYPE_PERSONAL],
                [RankDefine.TYPE_REALM, this.TYPE_PERSONAL],
                [RankDefine.TYPE_APPEARANCE, this.TYPE_PERSONAL],
                [RankDefine.TYPE_ACHIEVE, this.TYPE_PERSONAL],
            ],
        ],
        [this.TYPE_GUILD, [[RankDefine.TYPE_GUILD_LEVEL, this.TYPE_GUILD]]],
        [
            this.TYPE_EQUIP,
            [
                [RankDefine.TYPE_EQ_HAIR, this.TYPE_EQUIP],
                [RankDefine.TYPE_EQ_CLOTHES, this.TYPE_EQUIP],
                [RankDefine.TYPE_EQ_WRISTBAND, this.TYPE_EQUIP],
                [RankDefine.TYPE_EQ_SHOE, this.TYPE_EQUIP],
                [RankDefine.TYPE_EQ_BELT, this.TYPE_EQUIP],
                [RankDefine.TYPE_EQ_PANTS, this.TYPE_EQUIP],
            ],
        ],
        [
            this.TYPE_DUNGEON,
            [
                [RankDefine.TYPE_ARENA_TIER_DAILY, this.TYPE_DUNGEON],
                //RankDefine.TYPE_HEART_DEMON    , this.TYPE_DUNGEON,
            ],
        ],
    ])

    //#endregion

    /**
     * 排行榜映射配置
     */
    static readonly CONF: Map<string, IConfSet> = new Map([
        [
            this.TYPE_FP,
            {
                isCenter: false, // 是否跨服榜单
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankRef: RankRefBase, // DiffRank 排名对象的元素映射类
                rankListClass: RankListSystem, // 使用哪个类处理列表
            },
        ],
        // #region 个人榜
        [
            this.TYPE_LEVEL,
            {
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_REALM,
            {
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_APPEARANCE,
            {
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_ACHIEVE,
            {
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_RankAbPointDraw,
            {
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListActivity, // 使用哪个类处理列表
            },
        ],
        // #endregion

        // #region 装备榜
        [
            this.TYPE_EQ_HAIR,
            {
                subInfo: true, // 关联其他子项信息
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_EQ_CLOTHES,
            {
                subInfo: true, // 关联其他子项信息
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_EQ_WRISTBAND,
            {
                subInfo: true, // 关联其他子项信息
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_EQ_SHOE,
            {
                subInfo: true, // 关联其他子项信息
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_EQ_BELT,
            {
                subInfo: true, // 关联其他子项信息
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_EQ_PANTS,
            {
                subInfo: true, // 关联其他子项信息
                rankRef: RankUserRef,
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        // #endregion

        // #region 妖盟榜
        [
            this.TYPE_GUILD_LEVEL,
            {
                rankRef: RankGuildRef, // DiffRank 排名对象的元素映射类
                memberType: RankMemberDefine.GUILD, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_GUILD_ACTIVE_TIME,
            {
                rankRef: RankGuildRef, // DiffRank 排名对象的元素映射类
                memberType: RankMemberDefine.GUILD, // 排行榜成员类型
                rankListClass: RankListDaily, // 使用哪个类处理列表
            },
        ],
        [
            this.TYPE_GUILD_MEMBER_SCORE,
            {
                rankRef: RankGuildRef, // DiffRank 排名对象的元素映射类
                memberType: RankMemberDefine.USER, // 排行榜成员类型
                rankListClass: RankListSystem, // 使用哪个类处理列表
            },
        ],
        //#endregion
    ])
}
