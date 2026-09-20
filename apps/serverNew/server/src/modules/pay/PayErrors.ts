import { GameError } from '@arthropoda/game-engine'

export class PayErrors {
    static readonly PayLimitNum = new GameError(2001, '限购次数不足')

    static readonly PayNever = new GameError(2002, '尚未充值')

    static readonly GiftError = new GameError(2003, '无法领取礼包')

    static readonly PayRepeatFund = new GameError(2004, '不要重复购买基金')

    static readonly PayMax = new GameError(2005, '充值达到上限')

    static readonly PayRepeatPass = new GameError(2006, '已购买过高级战令')

    static readonly PayError = new GameError(2007, '充值异常')

    static readonly PayTqExpire = new GameError(2008, '月卡已过期')

    static readonly PayGiftNotExist = new GameError(2009, '礼包不存在')

    static readonly PayGiftExpire = new GameError(2010, '礼包已过期')

    static readonly PayFundNotExist = new GameError(2011, '基金不存在')

    static readonly PayLimit = new GameError(2012, '未满足购买条件')

    static readonly PayRechargeError = new GameError(2013, '充值档异常')

    static readonly PayNoChoose = new GameError(2014, '特惠礼包自选道具未选择')
}
