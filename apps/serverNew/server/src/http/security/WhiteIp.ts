import { SystemErrors } from '../../runtime/errors/SystemErrors'

export class WhiteIp {
    static checkWhiteIPList(ip: string, whiteIPList: string[]): void {
        if (whiteIPList.length == 0) {
            return
        }
        for (const item of whiteIPList) {
            if (item.startsWith('/')) {
                // 正则匹配
                if (new RegExp(item).test(ip)) {
                    return
                }
            } else {
                if (item === ip) {
                    return
                }
            }
        }
        throw SystemErrors.InvalidIp.params({ vars: { msg: '非法的客户端请求: ' + ip } })
    }
}
