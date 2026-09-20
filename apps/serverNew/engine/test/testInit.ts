
import path from 'path'
import { engineInit } from '../src/init'
import { Config } from '../src/config/config'
import { IPlatformConfigMap } from '../src/typings/conf-platform'
import { RedisInstance } from '../src/database/RedisInstance'
import { log } from '../src/logging/log'

//这个文件在test下是因为初始化目录时计算需要,移动了需要改代码
export async function testInitEnv() {
    global.ADJUST_OPEN = true
    engineInit()
    init()
    //@ts-ignore
    Config.tryLoadConf('platform')
    setConfigProxy()
    log.init({})
    // // 初始化数据库
    // await DB.init(entities, CP.platform.centerMysql)

    // // 初始化redis
    await RedisInstance.init(CP.platform.centerRedis, CP.platform.serverRedis, CP.platform.userRedis)

    // 设置时间偏移量
    // await PrepareManager.prepareTimeAdd()
}

function init() {
    global.ROOT_PATH = path.dirname(__dirname)
    global.ADJUST_OPEN = PLATFORM == 'bearjoy' || PLATFORM_VERSION == 'beta' || PLATFORM_VERSION == 'dev'
}

function setConfigProxy() {
    global.CP = new Proxy<IPlatformConfigMap>({} as IPlatformConfigMap, {
        get(target, p) {
            return Config.getConfigSync(p.toString())
        },
    })

}