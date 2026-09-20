import Joi from 'joi'
import { ChannelProvider } from '../ChannelProvider'
import { ChannelUser } from '../ChannelUser'
import { timestamp } from '@arthropoda/game-engine'
import { ChannelSign } from '../ChannelSign'
import { Url } from '@arthropoda/game-engine'

interface ILoginParams {
    token: string
}

export class ChannelPaoyou extends ChannelProvider {
    protected UID_SUFFIX = '__PY'

    protected serverAddr = 'http://s1.uc.xmpaoyou.com/api.php'

    protected gameValidate = Joi.object({
        token: Joi.string().required(),
    }).options({ allowUnknown: true })

    async login(loginParams: any) {
        const p = this.checkParamValidate<ILoginParams>(loginParams)
        if (!p) {
            return null
        }
        const res = await this.checkToken(p.token)
        if (!res || res.status != 200) {
            Log.http.error(new Error(`res error:${res}`))
            return null
        }
        const result = res.data
        if (!result || result.code != 0 || !result.data) {
            Log.http.error(new Error('result error:' + JSON.stringify(result)))
            return null
        }
        const uId: string = this.addUidSuffix(result.data.user.uid)
        return new ChannelUser(uId, result.data.user.name)
    }

    private async checkToken(token: string) {
        const params = {
            mod: 'User',
            do: 'loginByToken',
            token: token,
            appid: this.appId,
            time: timestamp(),
            sign: '',
        }
        params.sign = ChannelSign.createSign(params, this.appKey)

        try {
            const res = await Url.get(this.serverAddr, params)
            return res
        } catch (e) {
            Log.http.error(e)
        }
    }
}
