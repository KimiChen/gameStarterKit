import { is_numeric, timestamp } from '@arthropoda/game-engine'
import { GiftProxy } from '../../persistence/GiftProxy'
import { Gift } from './Gift'
import { GiftModel } from '../../../../../../generated/persistence/GiftModel'

export class ActionGiftAddGift extends Gift {
    public async doAction(params: any) {
        const data = this.validate(params)
        if (!data) {
            return false
        }

        const id = await GiftProxy.insertGift(data)
        if (!id) {
            this.gmContext.setGmMsg(1004, '添加失败', params)
            return false
        }
        return { id: id }
    }

    private validate(params: any) {
        if (!params) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }
        const data: Partial<GiftModel> = {}
        //后台目前不会传 pay_type 进来,这个值永远为空
        data.payType = Number(params.pay_type ?? 0)
        // 验证充值档是否存在
        if (data.payType == 1) {
            const conf = C.recharge()
            if (!Object.hasOwn(params, 'recharge_id') || !conf.has(params.recharge_id)) {
                this.gmContext.setGmMsg(1002, '充值档不存在', params)
                return false
            }
        }
        data.rechargeId = Number(params.recharge_id)

        if (!Object.hasOwn(params, 'awards') || !Array.isArray(params.awards)) {
            this.gmContext.setGmMsg(1003, '奖励信息错误', params)
            return false
        }
        data.awards = JSON.stringify(params.awards)
        if (
            !Object.hasOwn(params, 'desc') ||
            !Object.hasOwn(params, 'total_limit') ||
            !Object.hasOwn(params, 'price')
        ) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }
        if (!is_numeric(params.price)) {
            this.gmContext.setGmMsg(1001, '参数错误', params)
            return false
        }

        data.vip = 0
        data.totalLimit = Number(params.total_limit)
        data.type = Number(params.gift_type ?? 0)

        data.desc = params.desc
        data.price = Number(params.price)
        data.createTime = timestamp()
        data.updateTime = timestamp()
        data.limitContent = ''

        return data
    }
}
