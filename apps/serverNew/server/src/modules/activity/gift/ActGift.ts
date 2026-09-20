import { GiftModel } from '../../../../generated/persistence/GiftModel'

export class ActGift {
    /**
     * 礼包id
     * @key
     * @alias a
     */
    public id = 0

    /**
     * 礼包归属类型（充值档类型）
     * @alias b
     */
    public type = 0

    /**
     * 支付类型：1现金 2仙玉 3广告
     */
    public payType = 0

    /**
     * 价格
     * @alias d
     */
    public price = 0

    /**
     * 充值档id
     * @alias f
     */
    public rechargeId = 0

    /**
     * 奖励
     */
    public awards: ActGiftAwardItem[] = []

    /**
     * 限购类型
     */
    public limitContent: ActGiftLimitItem[] = []

    /**
     * 礼包描述
     * @alias i
     */
    public desc = ''

    /**
     * @param GiftModel model
     * @return ActGift
     * @access
     * @static
     */
    public static formatByModel(model: GiftModel): ActGift {
        const obj = new ActGift()

        obj.id = model.id
        obj.type = model.type
        obj.payType = model.payType
        obj.price = model.price
        obj.rechargeId = model.rechargeId
        obj.desc = model.desc

        if (model.awards) {
            const awards = JSON.parse(model.awards) as Array<{ propId: number; num: number }>
            for (const award of awards) {
                const item = new ActGiftAwardItem()
                item.num = award.num
                item.propId = award.propId
                obj.awards.push(item)
            }
        }

        if (model.limitContent) {
            const limitContent = JSON.parse(model.limitContent) as Array<{ vipExp: number; totalLimit: number }>
            for (const value of limitContent) {
                const item = new ActGiftLimitItem()
                item.vipExp = value.vipExp
                item.totalLimit = value.totalLimit
                obj.limitContent.push(item)
            }
        }

        return obj
    }

    // /**
    //  * 来自系统配表
    //  * @param object|SystemRankGiftsConf model
    //  * @return ActGift
    //  * @access
    //  * @static
    //  */
    // public static  formatByConf( model: object): ActGift {
    //     obj = new ActGift();
    //     obj.id = model.giftId;
    //     obj.payType = model.payType;
    //     obj.price = model.price;
    //     obj.discount = model.discount;
    //     obj.rechargeId = model.rechargeId;
    //     obj.desc = model.desc;
    //     obj.type = model.rechargeId > 0 ? RechargeConf :: getByKey(model.rechargeId).type : 0;

    //     foreach(model.awards as award) {
    //         item = new ActGiftAwardItem();
    //         item.num = award.num;
    //         item.propId = award.propId;
    //         obj.awards[] = item;
    //     }

    //     item = new ActGiftLimitItem();
    //     item.vipExp = 0;
    //     item.totalLimit = model.totalLimit;
    //     obj.limitContent[] = item;

    //     return obj;
    // }
}

export class ActGiftAwardItem {
    /**
     * 道具id
     * @key
     * @alias a
     */
    public propId = 0

    /**
     * 数量
     * @alias b
     */
    public num = 0

    /**
     * 额外数据
     * @alias c
     */
    public data = ''
}

export class ActGiftLimitItem {
    /**
     * id
     * @key
     * @alias a
     */
    public id = 0

    /**
     * vip经验
     * @alias b
     */
    public vipExp = 0

    /**
     * 限购次数
     * @alias c
     */
    public totalLimit = 0
}
