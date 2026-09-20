import { Service } from 'typedi'
import { CenterOrderModel } from '../../../../../generated/persistence/CenterOrderModel'
import { timestamp } from '@arthropoda/game-engine'

@Service()
export class PaymentCallback {
    readonly ORDER_ADD_YES = 1 // 已发货状态

    readonly ORDER_ADD_NO = 1 // 未发货状态

    readonly ORDER_STATUS_YES = 1 // 已支付

    jsonResponse(query: any, code: int, msg: string) {
        const data = {
            code: code == 0 ? '00000' : code,
            tips: msg,
            description: msg,
            data: {},
        }
        if (code === 0) {
            Log.pay.info('payCallback response:', [data, query])
        } else {
            Log.pay.error('payCallback error:', [data, query])
        }
        return data
    }

    channelCallback(channelObj: any, code: int, msg: string, query: any) {
        const data = channelObj.payCallbackResponse(code, msg)
        if (code === 0) {
            Log.pay.info('payCallback response:', [data, query])
        } else {
            Log.pay.error('payCallback error:', [data, query])
        }
        return data
    }

    async notice(
        uId: int,
        rechargeId: int,
        billNo: string,
        txid: string,
        payMoney: number,
        orderType: string,
        giftId: int = 0,
        activityName: string = '',
        gm: int = 0,
    ) {
        if (billNo.length < 1) {
            return false
        }
        const sId = 1

        const orderItem = await CenterOrderModel.findOneBy({ orderBillno: billNo })
        if (orderItem) {
            if (orderItem.orderTxid != txid) {
                Log.http.error(
                    `支付回调数据异常，发行订单号重复,内部订单号billno=${billNo},接口中发行订单号txid=${txid}`,
                    orderItem,
                )
                return false
            }
            if (orderItem.orderAdd < this.ORDER_ADD_YES) {
                // 通知IPayCallBackAction  TODO
            } else {
                Log.http.error(
                    `支付回调数据异常，奖励已发放,内部订单号billno=${billNo},接口中发行订单号txid=${txid}`,
                    orderItem,
                )
                return false
            }
            return true
        }
        const orderConf = C.recharge(rechargeId)
        if (!orderConf || orderConf.recharge > payMoney) {
            Log.http.error(`billno=${billNo}, paybackcalll: rechargeId 有误, 或者金额不对`)
            return false
        }

        const addOrder = CenterOrderModel.create()
        addOrder.userId = String(uId)
        addOrder.orderItemid = orderConf.id
        addOrder.orderDateline = timestamp()
        addOrder.orderTxid = txid
        addOrder.orderBillno = billNo
        addOrder.orderMoney = orderConf.recharge
        //addOrder.orderUsd = orderConf.recharge
        addOrder.orderStatus = this.ORDER_STATUS_YES ? 1 : 0
        addOrder.orderFromGm = gm
        addOrder.orderType = orderType
        addOrder.orderSid = sId
        addOrder.orderAdd = this.ORDER_ADD_NO
        addOrder.giftId = giftId
        addOrder.activityName = activityName

        try {
            await addOrder.save()
        } catch (e) {
            Log.http.error(`billno=${billNo},paybackcalll: 订单插入失败`)
            return false
        }
        // 通知IPayCallBackAction  TODO
        return true
    }
}
