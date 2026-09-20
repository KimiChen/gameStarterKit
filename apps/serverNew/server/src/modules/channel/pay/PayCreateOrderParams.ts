export class PayCreateOrderParams {
    /**
     * 发行订单id
     */
    sdkOrderId: string = ''

    /**
     * sdk 透传参数
     */
    sdkParam: { [key: string]: any } = {}

    /**
     * 支付回调地址
     */
    cpCallbackUrl: string = ''

    /**
     * 游戏透传参数
     */
    cpExtension: string = ''
}
