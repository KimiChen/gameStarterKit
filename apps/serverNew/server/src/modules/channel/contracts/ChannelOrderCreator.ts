import { PayClickBean } from '../../../../generated/protocol/server/C2S/mod/pay/PayClickBean'
import { PayCreateOrderParams } from '../pay/PayCreateOrderParams'

/**
 * 支付下单 sdk 接口
 */
export abstract class ChannelOrderCreator {
    abstract createOrder(
        clickInfo: PayClickBean,
        token: string,
        sdkInfo: string,
        openId: string,
        channelId: int,
    ): Promise<false | PayCreateOrderParams>
}
