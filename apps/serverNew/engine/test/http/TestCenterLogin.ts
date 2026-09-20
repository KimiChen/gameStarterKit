import { Url } from '../../src/utils/Url'

async function registerAccount() {
    const regUrl = 'http://s1.uc.xmpaoyou.com/quickReg.php'

    return Url.get(regUrl)
}

async function loginAccount(email: string, password: string) {
    const regUrl = 'http://s1.uc.xmpaoyou.com/login.php'

    return Url.get(regUrl, { email: email, password: password })
}

async function centerLogin() {
    const regRes = await registerAccount()
    if (regRes.status != 200 || !regRes.data.data) {
        throw new Error(`注册异常:status:${regRes.status}, data:${regRes.data}`)
    }
    console.log('regRes:', regRes.data)
    const loginRes = await loginAccount(regRes.data.data.e, regRes.data.data.p)
    if (loginRes.status != 200 || !loginRes.data.data) {
        throw new Error(`登录异常:status:${loginRes.status}, data:${loginRes.data}`)
    }
    console.log('loginRes:', loginRes.data)

    const centerUrl = 'http://127.0.0.1:3000/center/login'
    const centerRes = await Url.get(centerUrl, { loginType: 'paoyou', token: loginRes.data.data.token })

    console.log('centerRes', centerRes.data)
}

centerLogin()
