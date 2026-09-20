import { Url } from '@arthropoda/game-engine'
import { Service } from 'typedi'

@Service()
export class AdjustTestAccountProvisioner {
    async quickRegPlatformUser() {
        const response = await Url.get('http://s1.uc.xmpaoyou.com/quickReg.php')
        if (response.status !== 200 || response.data?.data?.p === undefined) {
            console.error('quickRegPlatformUser fail')
            return
        }

        const email = response.data.data.e
        const password = response.data.data.p
        const loginResponse = await Url.get('http://s1.uc.xmpaoyou.com/login.php', { email, password })
        if (loginResponse.status !== 200 || loginResponse.data?.data?.token === undefined) {
            console.error('quickRegPlatformUser fail')
            return
        }
        return { token: loginResponse.data.data.token, loginType: 'paoyou', quicklyUser: 1 }
    }
}
