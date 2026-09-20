
/** 获取客户端ip地址, 只有express进程http服务下有效 */
export function getHttpReqClientIp(req: any) {
    let ip = req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || ''
    if (typeof ip == 'string') {
        if (ip.split(',').length > 0) {
            ip = ip.split(',')[0]
        }
    } else {
        ip = ip[0]
    }
    ip = ip.substring(ip.lastIndexOf(':') + 1, ip.length)
    return ip
}