import Joi from 'joi'
import { ChannelProvider } from '../ChannelProvider'
import { ChannelUser } from '../ChannelUser'
import { Url, getServerIdByUid, md5, millisecond, mt_rand } from '@arthropoda/game-engine'
import { randomUUID } from 'crypto'
import { PayClickBean } from '../../../../generated/protocol/server/C2S/mod/pay/PayClickBean'
import { PayParams } from '../pay/PayParams'
import { PayCreateOrderParams } from '../pay/PayCreateOrderParams'
import { ChannelPaymentCallback } from '../contracts/ChannelPaymentCallback'
import { ChannelOrderCreator } from '../contracts/ChannelOrderCreator'
import { IncomingHttpHeaders } from 'http'
import { PayCallbackParams } from '../pay/PayCallbackParams'

interface ILoginParams {
    token: string
    channelId: string
    userId: string
    gameId: string
    sdkInfo?: string
}

/**
 * 创酷 悦驰 sdk
 */
export class ChannelYueChi extends ChannelProvider implements ChannelPaymentCallback, ChannelOrderCreator {
    /**
     * 从渠道获取的用户id的后缀, 一般都是需要增加后缀的，防止多个渠道用户id有一样的情况
     */
    protected UID_SUFFIX = '__YC'

    /**
     * 渠道标识
     */
    protected CHANNEL_CODE = 'yuechi'

    /**
     * 正式环境
     */
    protected SERVER_ADDR = 'https://ol-api.gzyuechiwl.cn'

    /**
     * 沙箱环境
     */
    protected SERVER_ADDR_DEV = 'http://120.78.14.179:6789'

    protected SDK_VERSION = 1

    protected gameValidate = Joi.object<ILoginParams>({
        token: Joi.string().required(),
        channelId: Joi.string().required(),
        gameId: Joi.string().required(),
    }).options({ allowUnknown: true })

    async login(loginParams: any) {
        const p = this.checkParamValidate<ILoginParams>(loginParams)
        if (!p) {
            return null
        }

        const body = {
            channelId: p.channelId,
            userId: p.userId,
            token: p.token,
            sdkInfo: p.sdkInfo ?? '',
        }

        const result = await this.request(this.appId, body, '/cp/user/verifyLogin')
        if (result === false) {
            return null
        }

        // 一般都是需要增加后缀的，防止多个渠道用户id有一样的情况
        const uId = this.addUidSuffix((result.data.userId as string).toLowerCase())
        return new ChannelUser(uId, '', loginParams.channelId)
    }

    /**
     * 创建订单
     * @access
     * @return PayCreateOrderParams|bool
     */
    async createOrder(clickInfo: PayClickBean, token: string, sdkInfo: string, openId: string, channelId: int) {
        const cpParam = `${clickInfo.uId}-${clickInfo.rechargeId}-${clickInfo.id}-${clickInfo.giftId}-${clickInfo.activity}`
        //cpParam       = OpenSsl::encryptOpenssl(cpParam, PlatformConfig::getSessionSecret());
        const cpCallbackUrl = PayParams.getPayCallBackUrl(this.CHANNEL_CODE)
        const rechargeConf = C.recharge(clickInfo.rechargeId)
        const body = {
            userId: openId,
            token: token,
            channelId: channelId,
            zoneId: 0,
            serverId: getServerIdByUid(clickInfo.uId),
            roleId: clickInfo.uId,
            productId: rechargeConf.productId,
            cpOrderId: clickInfo.id,
            cpParam: cpParam,
            cpCallbackUrl: cpCallbackUrl,
            sdkInfo: sdkInfo,
            // clientIp: getRealIp(),
            price: rechargeConf.recharge * 100,
        }
        Log.pay.info('创建订单发送参数 ' + JSON.stringify(body))
        const result = await this.request(this.appId, body, '/cp/pay/createOrder')
        Log.pay.info('创建订单结果 ' + JSON.stringify(result))
        if (result === false) {
            return false
        }

        const data = new PayCreateOrderParams()
        data.sdkOrderId = result.data.sdkOrderId
        data.sdkParam = result.data.sdkParam
        data.cpCallbackUrl = cpCallbackUrl
        data.cpExtension = clickInfo.rechargeId.toString()
        return data
    }

    /**
     * 解析支付回调内容
     * @param params
     * @param header
     * @returns
     */
    async payCallbackParse(params: { [k: string]: any }, header: IncomingHttpHeaders) {
        const sign = header['X-Sign']
        const time = Int(header['X-Timestamp'] as string)
        if (sign != this.genSign(params, time)) {
            Log.pay.error('payCallbackParse:签名错误', null, {
                'X-Sign: ': sign,
                'sign: ': this.genSign(params, time),
            })
            return false
        }
        return new PayCallbackParams(params.cpParam ?? '', Int(params.amount / 100), params.orderId, params.roleId)
    }

    /**
     * 组装支付回调返回内容
     * @param int code
     * @param string msg
     * @return array
     * @access
     */
    payCallbackResponse(code: int, msg: string) {
        return {
            code: code == 0 ? '00000' : code,
            tips: msg,
            description: msg,
            data: {},
        }
    }

    private async request(gameId: string, bodyParam: { [k: string]: any }, path: string) {
        const time = millisecond()
        const body = JSON.stringify(bodyParam)
        const reqId = md5(randomUUID() + path + JSON.stringify(body) + time + mt_rand(0, 100000))
        const header = {
            'Content-Type': 'application/json;charset=utf-8',
            'X-Request-Id': reqId, // 仅用于识别哪个请求，没有其他业务作用。值可以为uuid，或雪花算法的id值
            'X-Version': this.SDK_VERSION, // 版本号，当前为1
            'X-Game-Id': gameId, // 时间戳，精确到毫秒
            'X-Timestamp': time,
            'X-Sign': this.genSign(body, time),
        }
        const url = this.SERVER_ADDR
        const requestUrl = url + path

        const logArr: { [k: string]: any } = {
            url: requestUrl,
            body: body,
            header: header,
            resp: [],
        }
        try {
            const response = await Url.postJson(requestUrl, body, '', header)
            logArr.resp = response
            if (!response.isCodeOK()) {
                throw new Error('sdk接口响应错误')
            }
            if (response.status != 0o0) {
                throw new Error('sdk接口响应状态码有误')
            }
            Log.info('requestSuccess', logArr)
            return response
        } catch (e) {
            Log.error('requestFail:', e, logArr)
            return false
        }
    }

    /**
     * 签名
     * @return string
     */
    private genSign(body: { [k: string]: any } | string, time: int): string {
        let p = body
        if (Array.isArray(body)) {
            p = JSON.stringify(body)
        }

        const signStr = `signKey=${this.appKey}&timestamp=${time}&${p}`
        const sign = md5(signStr).toLowerCase()
        Log.info('signStr: ' + signStr)
        Log.info('sign: ' + sign)

        return sign
    }
}
