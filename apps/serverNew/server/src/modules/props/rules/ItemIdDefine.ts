import { SystemErrors } from '../../../runtime/errors/SystemErrors'

export class ItemIdDefine {
    //#region 道具类型
    /** 消耗品 */
    static readonly ITEM_TYPE_COST_ITEM = 1

    /** 材料 */
    static readonly ITEM_TYPE_MATERIAL = 2

    /** 装备 */
    static readonly ITEM_TYPE_EQUIPMENT = 3

    /** 展示用道具 */
    static readonly ITEM_TYPE_ONLY_SHOW = 10

    /** 奇珍 */
    static readonly ITEM_TYPE_TREASURE = 11

    /** 神通 */
    static readonly ITEM_TYPE_MAGIC = 12

    /** 至宝 */
    static readonly ITEM_TYPE_RARE = 13

    /**  时装 */
    static readonly ITEM_TYPE_FASHION = 14

    /**  称号 */
    static readonly ITEM_TYPE_TITLE = 15

    /**  符石 */
    static readonly ITEM_TYPE_GEM = 16

    /**  素罗皮肤 */
    static readonly ITEM_TYPE_NPC_SKIN = 17

    /**  宝箱 */
    static readonly ITEM_TYPE_BOX = 20

    /**  请神道具 */
    static readonly ITEM_TYPE_WORSHIP = 21

    /**  货币 */
    static readonly ITEM_TYPE_CURRENCY = 100
    //#endregion

    //#region 道具ID
    /** 仙玉 */
    static readonly ITEM_ID_GC = 1001

    /** 修为 */
    static readonly ITEM_ID_EXP = 1002

    /** 精力(体力) */
    static readonly ITEM_ID_POWER = 1003

    /** 杀敌数 */
    static readonly ITEM_ID_KILL_NUM = 1004

    /** 妖盟经验 */
    static readonly ITEM_ID_GUILD_EXP = 1005

    /** 妖丹 */
    static readonly ITEM_ID_DEMON_PILL = 1006

    /** 个人贡献 */
    static readonly ITEM_ID_GUILD_CONTRIBUTE = 1007

    /** 妖盟令 */
    static readonly ITEM_ID_GUILD_TOKEN = 1009

    /** 大招释放次数 */
    static readonly ITEM_ID_SKILL_NUM = 1012

    /** 大招怒气恢复值 */
    static readonly ITEM_ID_SKILL_MP_NUM = 1013

    /** 爱心值 */
    static readonly ITEM_ID_LOVE = 1014

    /** 通宝（代币） */
    static readonly ITEM_ID_TOKEN = 1015

    /** 属性点 */
    static readonly ITEM_ID_AP = 1010

    /** 素罗攻击次数 */
    static readonly ITEM_ID_NPC_ATK_TIMES = 1021

    /** 属性果 */
    static readonly ITEM_ID_ATTR_FRUIT = 10101

    /** 妖术点 */
    static readonly ITEM_ID_YS = 10102

    /** 功法点 */
    static readonly ITEM_ID_GF = 10201

    /** 清心符(解除控制1秒) */
    static readonly ITEM_ID_QINGXIN_FU = 10301

    /** 活血丹(加血道具) */
    static readonly ITEM_ID_HUOXUE_DAN = 10302

    /** 通脉散(回复法力) */
    static readonly TONGMAI_SAN = 10303

    /** 凝破丸(复活道具) */
    static readonly ITEM_ID_REVIVE = 10304

    /** 赤铜(炼器道具) */
    static readonly ITEM_ID_CUPRITE = 10309

    /** 补天神石(炼器道具) */
    static readonly ITEM_ID_GOD_STONE = 10310

    /** 灵气 */
    static readonly ITEM_ID_SC = 10202

    /**每日任务活跃度* */
    static readonly ITEM_ID_LIVENESS = 2001

    /**周任务活跃度* */
    static readonly ITEM_ID_WEEKLY_LIVENESS = 2002

    /**成就资历点* */
    static readonly ITEM_ID_ACHIEVE_POINT = 1008

    /**灵气双倍卡* */
    static readonly ITEM_ID_DOUBLE_CARD_SC = 10108

    /**功法双倍卡* */
    static readonly ITEM_ID_DOUBLE_CARD_GONG = 10109

    /**灵气双倍卡次数* */
    static readonly ITEM_ID_DOUBLE_CARD_SC_TIMES = 10110

    /**功法双倍卡次数* */
    static readonly ITEM_ID_DOUBLE_CARD_GONG_TIMES = 10111

    /**八荒令 * */
    static readonly ITEM_ID_CROSS_MISSION_TOKEN = 10112

    /**阴舍利 * */
    static readonly ITEM_ID_CLEANSE_NEGTIVE = 10307

    /**阳舍利 * */
    static readonly ITEM_ID_CLEANSE_POSTIVE = 10308
    //#endregion

    /** 道具系统访问玩家数据时使用的稳定字段路径 */
    static readonly USER_FIELD_PATH = {
        gc: 'gc',
        sc: 'sc',
        mgPoint: 'gong.mgPoint',
        abPoint: 'gong.abPoint',
        attrPoint: 'attr.point',
        exp: 'exp',
        practiceKilledNum: 'practice.practiceKilledNum',
        skillTimes: 'skillTimes',
        skillRecoveryNum: 'skillRecoveryNum',
        guildContribute: 'guildContribute',
        demonPill: 'demonPill',
        practiceNpcTimesLimit: 'practice.practiceNpcTimesLimit',
        magicItems: 'gong.magics',
        rareItems: 'weapon.rares',
        fashionItems: 'fashion.fashions',
    } as const

    /** 道具耐久逻辑和统计使用的稳定叶子字段名 */
    static readonly DURABLE_FIELD_NAME = {
        magicItems: 'magics',
        rareItems: 'rares',
        fashionItems: 'fashions',
    } as const

    /**
     * 货币道具映射用户字段
     */
    static readonly currencyUserFields = new Map<int, string>([
        [ItemIdDefine.ITEM_ID_GC, this.USER_FIELD_PATH.gc],
        [ItemIdDefine.ITEM_ID_SC, this.USER_FIELD_PATH.sc],
        [ItemIdDefine.ITEM_ID_YS, this.USER_FIELD_PATH.mgPoint],
        [ItemIdDefine.ITEM_ID_GF, this.USER_FIELD_PATH.abPoint],
        [ItemIdDefine.ITEM_ID_AP, this.USER_FIELD_PATH.attrPoint],
        [ItemIdDefine.ITEM_ID_EXP, this.USER_FIELD_PATH.exp],
        [ItemIdDefine.ITEM_ID_KILL_NUM, this.USER_FIELD_PATH.practiceKilledNum],
        [ItemIdDefine.ITEM_ID_SKILL_NUM, this.USER_FIELD_PATH.skillTimes],
        [ItemIdDefine.ITEM_ID_SKILL_MP_NUM, this.USER_FIELD_PATH.skillRecoveryNum],
        [ItemIdDefine.ITEM_ID_GUILD_CONTRIBUTE, this.USER_FIELD_PATH.guildContribute],
        // [ItemIdDefine.ITEM_ID_LIVENESS, 'liveness'],
        // [ItemIdDefine.ITEM_ID_WEEKLY_LIVENESS, 'weeklyLiveness'],
        // [ItemIdDefine.ITEM_ID_ACHIEVE_POINT, 'achievePoint'],
        [ItemIdDefine.ITEM_ID_DEMON_PILL, this.USER_FIELD_PATH.demonPill],
        [ItemIdDefine.ITEM_ID_NPC_ATK_TIMES, this.USER_FIELD_PATH.practiceNpcTimesLimit],
    ])

    static readonly ITEM_TYPE_DESC = new Map<int, string>([
        [this.ITEM_TYPE_CURRENCY, '货币类型'],
        [this.ITEM_TYPE_COST_ITEM, '消耗品'],
        [this.ITEM_TYPE_MATERIAL, '材料'],
        [this.ITEM_TYPE_EQUIPMENT, '装备'],
        [this.ITEM_TYPE_TREASURE, '奇珍'],
        [this.ITEM_TYPE_MAGIC, '神通'],
        [this.ITEM_TYPE_RARE, '至宝'],
        [this.ITEM_TYPE_FASHION, '时装'],
        [this.ITEM_TYPE_TITLE, '称号'],
        [this.ITEM_TYPE_GEM, '符石'],
        [this.ITEM_TYPE_NPC_SKIN, '素罗皮肤'],
        [this.ITEM_TYPE_BOX, '宝箱'],
    ])

    /** 道具类型映射用户字段 */
    static readonly ITEM_TYPE_FIELD_MAP: { [key: string]: string } = {
        [this.ITEM_TYPE_RARE]: this.DURABLE_FIELD_NAME.rareItems,
        [this.ITEM_TYPE_MAGIC]: this.DURABLE_FIELD_NAME.magicItems,
        [this.ITEM_TYPE_FASHION]: this.DURABLE_FIELD_NAME.fashionItems,
    }

    /**
     * 获取获货币道具对应的玩家字段
     * @param cId
     */
    static getUserFieldCashMap(cId: int) {
        const field = this.currencyUserFields.get(cId)
        if (!field) {
            throw SystemErrors.SysComponentErr
        }
        return field
    }
}
