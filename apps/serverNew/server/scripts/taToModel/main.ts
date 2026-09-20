import { Facade } from './Facade'

async function run() {
    const facade = new Facade()

    console.log('正在初读取文档...')
    await facade.init()

    console.log('正在处理公共属性...')
    await facade.handleCommon()

    console.log('正在处理用户数据...')
    await facade.handleUser()

    console.log('正在处理事件...')
    await facade.handleEvents()

    console.log('正在格式化...')
    facade.formatCode()
}

run()
    .then(() => {
        console.log('执行完毕')
    })
    .catch((err) => {
        console.log(err)
        process.exit(1)
    })
