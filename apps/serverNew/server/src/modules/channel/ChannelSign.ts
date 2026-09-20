import { md5 } from '@arthropoda/game-engine'

export class ChannelSign {
    public static createSign(params: { [key: string]: any }, appKey: string): string {
        if (!params) {
            return ''
        }

        delete params.sign
        const keys = Object.keys(params).sort()
        let signStr = ''

        for (const key of keys) {
            signStr += `${key}=${params[key]}`
        }

        signStr += appKey
        signStr = md5(signStr)

        return signStr
    }
}
