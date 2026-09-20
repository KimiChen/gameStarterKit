import { Get, JsonController, QueryParams, Param, Post } from 'routing-controllers'
import { Service } from 'typedi'
import { OrderCreateReq } from './OrderCreateReq'
import { ChannelRegistry } from '../../../channel/ChannelRegistry'
import { ChannelOrderCreator } from '../../../channel/contracts/ChannelOrderCreator'
import { OpenSsl, RedisInstance } from '@arthropoda/game-engine'
import { PayClickBean } from '../../bean/PayClickBean'
import { User } from '../../../user/bean/User'
import { OpenAPI } from 'routing-controllers-openapi'

@JsonController('/order')
@Service()
export class OrderController {
    @OpenAPI({ summary: '支付下单接口' })
    @Get('/create/:sdk')
    @Post('/create/:sdk')
    async orderCreate(@Param('sdk') sdk: string, @QueryParams() query: OrderCreateReq) {
        if (!sdk) {
            return { status: 1, msg: 'params is error' }
        }
        const channelObj = ChannelRegistry.getObj(sdk)
        if (!(channelObj instanceof ChannelOrderCreator)) {
            return { status: 1, msg: 'channelObj invalid' }
        }

        // 验证信息有效性
        const decryKey = OpenSsl.decryptOpenssl(query.key, CP.platform.sessionSignKey)
        if (decryKey == false) {
            return { status: 1, msg: 'params is error' }
        }

        // 获取玩家id
        const [uId, billNo] = decryKey
        const info = await PayClickBean.load(uId, billNo)
        if (!info) {
            return { status: 1, msg: 'get PayClickInfo error' }
        }
        let openId = ''
        let channelId = 0
        try {
            const HUser = (await User.loadOnlyRead(info.uId))!
            openId = HUser.openid.split('__')[0]
            const loginInfo = await RedisInstance.getCenterRedis().getObject(HUser.openid + '_login')
            channelId = loginInfo?.channelId ?? 0
        } catch (e) {
            return { status: 1, msg: 'player data error' + e }
        }

        const data = await channelObj.createOrder(info, query.token, query.sdkInfo, openId, channelId)
        if (data === false) {
            return { status: 1, msg: 'create order fail' }
        }
        return { status: 0 }
    }
}
