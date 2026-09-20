import { Url } from '../../src/utils/Url'

function testUrl() {
    const url = new URL('http://api.xmpayou.com/api/user')

    const data = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
    }

    console.log(data)
}

async function testGet() {
    const url = 'http://s1.uc.xmpaoyou.com/api.php'
    const res = await Url.get(url)
    console.log(res.data)
}

function testPost() {}

async function testTextGet() {
    const url = 'http://s1.static.xmpaoyou.com/demontale/bearjoy/android/gameVersion_master.txt'
    const res = await Url.get(url)
    console.log(res.data)
}

function testMatch() {
    const str = 'pytsVer=b6fad4b5941e9b873e815897f36bc25c'
    const m = str.match(/pytsVer=([a-z0-9]+)/)
    if (m) {
        console.log(m, m[1], m.length)
    }
}

//testGet()
//testTextGet()
