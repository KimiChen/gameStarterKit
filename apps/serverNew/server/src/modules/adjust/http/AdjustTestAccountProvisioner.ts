import { Url } from '@arthropoda/game-engine'
import { Service } from 'typedi'

@Service()
export class AdjustTestAccountProvisioner {
    async quickRegPlatformUser() {
        const config = CA.login_key[PLATFORM] ?? CA.login_key.bearjoy
        if (!config?.quick_reg_url || !config.login_url || !config.login_type) {
            console.error('quickRegPlatformUser config missing')
            return
        }

        const response = await Url.get(config.quick_reg_url)
        if (response.status !== 200 || response.data?.data?.p === undefined) {
            console.error('quickRegPlatformUser fail')
            return
        }

        const email = response.data.data.e
        const password = response.data.data.p
        const loginResponse = await Url.get(config.login_url, { email, password })
        if (loginResponse.status !== 200 || loginResponse.data?.data?.token === undefined) {
            console.error('quickRegPlatformUser fail')
            return
        }
        return { token: loginResponse.data.data.token, loginType: config.login_type, quicklyUser: 1 }
    }
}
