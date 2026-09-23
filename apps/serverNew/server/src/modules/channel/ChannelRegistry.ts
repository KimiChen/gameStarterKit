import { ChannelProvider } from './ChannelProvider'
import { ChannelYueChi } from './yuechi/ChannelYueChi'

export class ChannelRegistry {
    static readonly SDK_YUECHI = 'yuechi'

    static readonly SDK_LINGQUAN = 'lingquan'

    static readonly SDK_YOURON = 'youron'

    static readonly SDK_YOURON_DEV = 'youronDev'

    private static createObj(sdkName: string): ChannelProvider {
        switch (sdkName) {
            case this.SDK_YUECHI:
                return new ChannelYueChi()
            default:
                throw new Error(`${sdkName}平台sdk基础类未实现`)
        }
    }

    static getObj(sdkName: string): ChannelProvider {
        const appConfig = CA.login_key[sdkName] ?? null
        // 判断当前登录方式，是否属于当前平台
        if (!appConfig || !appConfig.plats.includes(PLATFORM)) {
            throw new Error(`login_key文件未配置[${sdkName}]平台sdk信息`)
        }

        const obj = ChannelRegistry.createObj(sdkName)
        obj.appId = appConfig.cp_app_id
        obj.appKey = appConfig.cp_app_key
        obj.appPayKey = appConfig.cp_pay_key
        obj.serverUrl = appConfig.server_url ?? ''

        return obj
    }
}
