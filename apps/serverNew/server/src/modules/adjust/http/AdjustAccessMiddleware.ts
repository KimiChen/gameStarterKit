import { getHttpReqClientIp } from '@arthropoda/game-engine'
import { ExpressMiddlewareInterface } from 'routing-controllers'
import { Service } from 'typedi'
import { isOpenIps } from '../../../http/security/isOpenIps'

@Service()
export class AdjustAccessMiddleware implements ExpressMiddlewareInterface {
    use(req: any, res: any, next: (err?: any) => any) {
        const reqIp = getHttpReqClientIp(req)
        if (isOpenIps(reqIp)) {
            next()
            return
        }
        res.sendStatus(404)
    }
}
