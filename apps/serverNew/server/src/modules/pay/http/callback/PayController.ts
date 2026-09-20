import { Get, HeaderParams, JsonController, Post, QueryParam, QueryParams, Req } from 'routing-controllers'
import { Service } from 'typedi'
import { PaymentCallback } from './PaymentCallback'
import { ChannelRegistry } from '../../../channel/ChannelRegistry'
import { ChannelPaymentCallback } from '../../../channel/contracts/ChannelPaymentCallback'
import { Request } from 'express'
import { OpenAPI } from 'routing-controllers-openapi'

/**
 * 问卷回调
 */
@JsonController('/pay')
@Service()
export class PayController {
    constructor(private readonly callback: PaymentCallback) {}

    @OpenAPI({ summary: '支付回调' })
    @Get('/:sdk')
    @Post('/:sdk')
    async payCallback(@QueryParam('sdk') sdk: string, @Req() req: Request) {
        Log.pay.info('payCallback request ', [sdk, req.query])
        if (!req.query || !sdk) {
            return this.callback.jsonResponse(req.query, 1, 'param error')
        }

        // WhiteIPService.checkWhiteIPList(request, PlatformConfig.getPayCallbackWhiteIPList())

        const channelObj = ChannelRegistry.getObj(sdk)
        if (!(channelObj instanceof ChannelPaymentCallback)) {
            return this.callback.jsonResponse(req.query, 1, 'channel error')
        }
        const backData = await channelObj.payCallbackParse(req.query, req.headers)

        if (backData === false) {
            return this.callback.channelCallback(channelObj, 1, 'parse error', req.query)
        }

        if (!backData.attach) {
            return this.callback.channelCallback(channelObj, 2, 'cpParam parse error', req.query)
        }

        if (backData.attachUid != backData.uId.toString()) {
            return this.callback.channelCallback(channelObj, 3, 'roleId err', req.query)
        }

        const noticeRes = await this.callback.notice(
            backData.uId,
            backData.attachRechargeId,
            backData.attachBillno,
            backData.orderId,
            backData.amount,
            '1',
            backData.attachGiftId,
            backData.attachActivity,
        )

        if (!noticeRes) {
            return this.callback.channelCallback(channelObj, 4, 'send err', req.query)
        }

        return this.callback.jsonResponse(req.query, 0, 'success')
    }
}
