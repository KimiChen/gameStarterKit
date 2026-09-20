import { sleep } from '../../../src/utils/common'

async function test1() {
    console.log('开始', new Date().toLocaleString())
    await sleep(2000)
    console.log('结束1', new Date().toLocaleString())
    sleep(2000).catchError('')
    console.log('结束2', new Date().toLocaleString())
}

async function asyncEsLintError() {
    await test1()
    console.log('保存', new Date().toLocaleString())
}

asyncEsLintError().catchError('')
