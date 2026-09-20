import { OpenSsl } from '../../../src/utils/OpenSsl'

function testSsl() {
    const key = '4RTDmP$rX1WWY2sA'
    const enStr = OpenSsl.encryptOpenssl({ test: 1 }, key)
    console.log('encryptOpenssl:', enStr)

    const deData = OpenSsl.decryptOpenssl(enStr, key)
    console.log('decryptOpenssl', deData)
}

testSsl()
