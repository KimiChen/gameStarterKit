import { IncomingHttpHeaders } from 'http'
import { PayCallbackParams } from '../pay/PayCallbackParams'

/**
 * 支付 sdk 接口
 */
export abstract class ChannelPaymentCallback {
    /**
     * 解析支付回调内容
     * @param params
     * @param
     * @param HeaderBag
     * @param $header
     */
    abstract payCallbackParse(
        params: { [key: string]: any },
        header?: IncomingHttpHeaders,
    ): Promise<PayCallbackParams | false>

    /**
     * 组装返回给发行的支付回调信息
     * @param code
     * @param msg
     */
    abstract payCallbackResponse(code: int, msg: string): void
}
