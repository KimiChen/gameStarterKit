export class ShopConst {
    static readonly MOD_DO = 'Shop'

    static readonly NO_LIMIT = -1 // 不限制购买次数

    static readonly NO_RESET = 0 // 不重置

    // 定义商店名称
    static readonly SHOP_BASE = 'shop' // 基础商店

    static readonly SHOP_LOVE = 'shopLove' // 爱心商店

    static readonly SHOP_GUILD = 'shopGuild' // 联盟商店

    static readonly SHOP_COW = 'shopCow' // 夔牛商店

    static readonly SHOP_ARENA = 'shopArena' // 竞技商店

    static readonly SHOP_BACK = 'shopBack' // 馈礼坊

    // 万能活动相关商店
    // 道具商店叫 万能活动名 _ shop
    // 积分商店叫 万能活动名 _ scoreShop
    static readonly General_Suffix = 'shop'

    static readonly General_Suffix_Score = 'scoreShop'

    // 商店解锁
    static readonly UNLOCK_DEFAULT = -1 // 默认解锁

    static readonly UNLOCK_MODULE = 1 // 功能解锁

    // shopItem的解锁
    static readonly ITEM_UNLOCK_LEVEL = 1 // 根据等级解锁

    static readonly ITEM_UNLOCK_GUILD = 2 // 根据仙盟等级解锁

    static readonly BASE_CONF_NAME = 'shop'

    /**
     * 商店配置
     */
    static readonly shopConfMap: { [key: string]: string } = {
        [ShopConst.SHOP_BASE]: ShopConst.BASE_CONF_NAME,
        [ShopConst.SHOP_LOVE]: ShopConst.BASE_CONF_NAME,
        [ShopConst.SHOP_COW]: ShopConst.BASE_CONF_NAME,
        [ShopConst.SHOP_GUILD]: ShopConst.BASE_CONF_NAME,
        [ShopConst.SHOP_ARENA]: ShopConst.BASE_CONF_NAME,
        [ShopConst.SHOP_BACK]: ShopConst.BASE_CONF_NAME,
    }

    // 购买限购
    static readonly LimitTypeDay = 1 // 每日

    static readonly LimitTypeWeek = 2 // 每周

    static readonly LimitTypeMonth = 3 // 每月

    static readonly LimitTypeTotal = 4 // 总限购（永久限购）

    static readonly LimitTypeActivity = 100 // 活动重置
}
