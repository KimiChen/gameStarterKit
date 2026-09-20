import { isInnerIp } from '@arthropoda/game-engine'

/** 判断是否为允许访问项目的安全 IP。 */
export function isOpenIps(ip: string): boolean {
    if (isInnerIp(ip)) {
        return true
    }
    return !!CA.open_ip?.ips?.includes(ip)
}
