import { RedisInstance } from '@arthropoda/game-engine'

/**
 * 登录前的公告
 */
export const LINE_GONGGAO = 1

export async function checkLineModuleOpen(module: number | string) {
    const moduleV = typeof module == 'number' ? module.toString() : module
    const isMember = await RedisInstance.getCenterRedis().sIsmember('lineSwitch', moduleV)
    return isMember ? false : true
}
