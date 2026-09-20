import { Gift } from './Gift'

/**
 * 获取充值档id
 */
export class ActionGiftGetRechargeId extends Gift {
    public async doAction(params: any) {
        const confList = C.recharge()
        if (!confList) {
            this.gmContext.setGmMsg(1001, '配置表不存在', params)
            return false
        }
        const list: Record<number, number> = {}
        for (const [, conf] of confList) {
            if (conf.type != Gift.RECHARGE_GIFT_TYPE) {
                continue
            }

            list[conf.recharge] = conf.id
        }
        return list
    }
}
