/** 添加任务类型定义，需要将计算获得的数值类型添加到Task
 * 命名规则：TARGET_定义id_字段名
 */
export class TaskDefine {
    //  #region
    //  任务类型定义
    /**@var int 装备P1品质的P2等级装备的数量V */
    static readonly TARGET_1001_WEAR_EQUIP_QUALITY_LV = 1001

    /**@var int 玩家等级达到V级 */
    static readonly TARGET_1002_PLAYER_LV = 1002

    /**@var int 法宝达到V级 */
    static readonly TARGET_1003_WEAPON = 1003

    /**@var int 功法达到V级 */
    static readonly TARGET_1004_GONG_LV = 1004

    /**@var int 装备V件的P等级装备 */
    static readonly TARGET_1005_WEAR_EQUIP_LV = 1005

    /**@var int 离线修炼 */
    static readonly TARGET_1006_OFFLINE_PRACTICE = 1006

    /**@var int 快速修炼 */
    static readonly TARGET_1007_QUICK_PRACTICE = 1007

    /**@var int 个人历练 参与{value}次个人历练 */
    static readonly TARGET_1008_PERSONAL_MISSION = 1008

    /**@var int 夔牛活动 参与{value}次夔牛活动 */
    static readonly TARGET_1009_KUICOW = 1009

    /**@var int 妖盟历练 */
    static readonly TARGET_1010_YAOMEN_MISSION = 1010

    /**@var int 击杀小怪 */
    static readonly TARGET_1011_KILL_MONSTER = 1011

    /**@var int 妖盟捐赠 */
    static readonly TARGET_1012_YAOMEN_DONATE = 1012

    /**@var int 获得装备 */
    static readonly TARGET_1013_GET_EQUIP = 1013

    /**@var int 参与竞技 */
    static readonly TARGET_1014_ARENA = 1014

    /**@var int 给人点赞 */
    static readonly TARGET_1015_GIVE_LIKE = 1015

    /**@var int 购买体力 */
    static readonly TARGET_1016_BUY_POWER = 1016

    /**@var int 观看广告 */
    static readonly TARGET_1017_WATCH_AD = 1017

    /**@var int 领取月卡 */
    static readonly TARGET_1018_GET_MONTH_CARD = 1018

    /**@var int 领取年卡 */
    static readonly TARGET_1019_GET_YEAR_CARD = 1019

    /**@var int 抽取装备 */
    static readonly TARGET_1020_DRAW_EQUIPMENT = 1020

    /**@var int 境界提升 */
    static readonly TARGET_1021_BOUNDARY_RISE = 1021

    /**@var int 器灵炼化 */
    static readonly TARGET_1022_DEVICE_REFINE = 1022

    /**@var int 奇珍拥有 */
    static readonly TARGET_1023_OWN_TREASURE = 1023

    /**@var int 供奉 */
    static readonly TARGET_1024_WORSHIP = 1024

    /**@var int 熔炼装备 */
    static readonly TARGET_1025_SMELTING_EQUIPMENT = 1025

    /**@var int 装备符石 */
    static readonly TARGET_1026_EQUIPMENT_SYMBOL = 1026

    /**@var int 装备宝箱 */
    static readonly TARGET_1027_EQUIPMENT_BOX = 1027

    /**@var int 养成评分 */
    static readonly TARGET_1028_DEVELOP_SCORE = 1028

    /**@var int 被人点赞 */
    static readonly TARGET_1029_BE_LIKED_BY_OTHER = 1029

    /**@var int 释放技能 */
    static readonly TARGET_1031_RELEASE_SKILLS = 1031

    /**@var int 拥有好友 */
    static readonly TARGET_1032_HAVE_FRIENDS = 1032

    /**@var int 收集时装 */
    static readonly TARGET_1033_COLLECT_COSTUME = 1033

    /**@var int 收集神通 */
    static readonly TARGET_1034_COLLECT_SHENTONG = 1034

    /**@var int 收集至宝 */
    static readonly TARGET_1035_COLLECT_RARE = 1035

    /**@var int 颜值达标 */
    static readonly TARGET_1036_APPEARANCE_STANDARD = 1036

    /**@var int 称号获得 */
    static readonly TARGET_1037_GET_TITLE = 1037

    /**@var int 购买历练 购买个人历练次数达到{value}次 */
    static readonly TARGET_1038_BUY_MISSION = 1038

    /**@var int 消耗仙玉 */
    static readonly TARGET_1039_CONSUME_IMMORTAL_JADE = 1039

    /**@var int 消耗精力(体力) */
    static readonly TARGET_1040_CONSUME_POWER = 1040

    /**@var int 修炼 击杀（param1）地图第{value}波次boss */
    static readonly TARGET_1041_PRACTICE_MAP_BOSS = 1041

    /**@var int 对话 主线任务专用类型，无需埋点 */
    static readonly TARGET_1042_MAIN_TASk_DIALOG = 1042

    /**@var int 斩心魔达到{value}关 */
    static readonly TARGET_1043_HEART_DEMON_CHAPTER = 1043

    /**@var int 参与{value}次{param1}历练 */
    static readonly TARGET_1044_MISSION_TYPE = 1044

    /**@var int 镶嵌{value}个{param1}符石 */
    static readonly TARGET_1045_GEM_DRESS = 1045

    /**@var int 妖盟商店兑换{value}次 */
    static readonly TARGET_1046_GUILD_SHOP = 1046

    /**@var int 任意妖盟法阵升级到{value}级 */
    static readonly TARGET_1047_GUILD_MAGIC = 1047

    /**@var int 妖盟密法达到{value}级 */
    static readonly TARGET_1048_GUILD_MF = 1048

    /**@var int 器灵坑位炼化{value}个 */
    static readonly TARGET_1049_WEAPON_COL = 1049

    /**@var int {value}件{param2}级{param1}以上装备 */
    static readonly TARGET_1050_WEAR_EQUIP_QUALITY = 1050

    /**@var int 获得爱心值达到{value}点 */
    static readonly TARGET_1053_ADD_LOVE = 1053

    /**@var int 操作伙伴攻击{value}次 主线任务专用不埋点 */
    static readonly TARGET_1054_PARTNER_ATK = 1054

    /**@var int 玩家属性加点{value}次 */
    static readonly TARGET_1055_ATTR_ADD = 1055

    /**@var int 击杀（param1）地图{value}只小怪 主线专用不埋点 */
    static readonly TARGET_1056_MAP_KILL_MONSTER = 1056

    /**@var int 伙伴等级提升至{value}级 */
    static readonly TARGET_1057_PARTNER_LV = 1057

    /**@var int 伙伴境界提升至{value} */
    static readonly TARGET_1058_PARTNER_REALM = 1058

    /**@var int 修炼到达{value}地图 */
    static readonly TARGET_1059_ENTER_PRACTICE = 1059

    /**@var int 在多人修炼地图中击杀{value}个小怪 */
    static readonly TARGET_1060_PRACTICE_MULTI_KILL_MONSTER = 1060

    /**@var int 累计操作伙伴攻击{value}次 */
    static readonly TARGET_1061_PARTNER_ATK = 1061

    /**@var int 累计捐献妖盟令达到{value}个 */
    static readonly TARGET_1062_YAOMEN_DONATE = 1062

    /**@var int 累计消耗妖丹达到{value}个 */
    static readonly TARGET_1063_USE_PILL = 1063

    /**@var int 到达{value}{param1}地图 */
    static readonly TARGET_1064_ENTER_PRACTICE_MULTI = 1064

    /**@var int 完成{param1}任务开启功能 */
    static readonly TARGET_1065_MAIN_TASK = 1065

    /**@var int 完成{param1}地图{value}波次怪 */
    static readonly TARGET_1066_PRACTICE_TURN = 1066

    /**@var int 功法等级达到{value}级 showLv */
    static readonly TARGET_1067_GONG_SHOW_LV = 1067

    /**@var int 法宝等级达到{value}级 showLv */
    static readonly TARGET_1068_WEAPON_SHOW_LV = 1068

    /**@var int 累计获取具有3个及以上特效的红色装备共{value}件 */
    static readonly TARGET_1069_EQUIP_RED_3_EFFECT = 1069

    /**@var int 累计获取具有3个及以上属性的红色装备共{value}件 */
    static readonly TARGET_1070_EQUIP_RED_3_ATTR = 1070

    /**@var int 升级{param1}妖术至{valua}级 */
    static readonly TARGET_1071_SORCERY_LV = 1071

    /**@var int 完成{param1}引导 */
    static readonly TARGET_1072_GUIDE = 1072

    /**@var int 累计充值{value}元 */
    static readonly TARGET_1073_RECHARGE = 1073

    /**@var int 消耗精铁 */
    static readonly TARGET_1074_IRON_COST = 1074

    //#region 主线特殊任务
    static readonly MAIN_TAK_SPEC = [
        this.TARGET_1056_MAP_KILL_MONSTER,
        this.TARGET_1042_MAIN_TASk_DIALOG,
        this.TARGET_1054_PARTNER_ATK,
        this.TARGET_1059_ENTER_PRACTICE,
    ]
    //#endregion

    /**
     * 主线任务是否已完成
     * @param mainTaskId
     * @param progress
     * @returns
     */
    public static checkMainTaskProgress(mainTaskId: int, progress: int) {
        if (!C.main_task().has(mainTaskId)) {
            return true
        }

        const conf = C.main_task(mainTaskId)
        if (this.MAIN_TAK_SPEC.includes(conf.type)) {
            return false
        }

        return progress >= conf.value
    }
}
