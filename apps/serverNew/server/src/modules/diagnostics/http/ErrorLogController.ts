import { base64_decode, getHttpReqClientIp, getIPv4OfMachine } from '@arthropoda/game-engine'
import fs from 'fs'
import axios from 'axios'
import { Request, Response } from 'express'
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers'
import { Service } from 'typedi'
import { isOpenIps } from '../../../http/security/isOpenIps'
import { OpenAPI } from 'routing-controllers-openapi'

/**
 * 错误日志查看
 */
@JsonController('/exception')
@Service()
export class ErrorLogController {
    @OpenAPI({ summary: '查看错误日志' })
    @Get('/info')
    async info(@QueryParam('data') p_data: string, @Req() req: Request, @Res() res: Response) {
        const repeatRequestNum = Int(req.header('repeatRequestNum'))
        if (repeatRequestNum > 1) {
            return '重复进行,中断循环'
        }

        const reqIp = getHttpReqClientIp(req)

        if (!isOpenIps(reqIp)) {
            return '非法访问'
        }

        const data = JSON.parse(base64_decode(p_data)) as {
            ip: string
            port: number
            filePath: string
            start: number
            end: number
        }
        if (!data.ip) {
            return '参数错误:' + p_data
        }

        res.setHeader('content-type', 'text/plain')
        if (data.ip == getIPv4OfMachine()) {
            if (!fs.existsSync(data.filePath)) {
                res.send('文件已经不存在')
                return
            }
            const f = fs.openSync(data.filePath, 'r')
            const buf = Buffer.alloc(data.end - data.start)
            fs.readSync(f, buf, 0, data.end - data.start, data.start)
            res.send(`${buf.toString('utf-8')}`)
        } else {
            const url = `http://${data.ip}:${data.port}/exception/info?data=${p_data}`
            const urlRes = await axios.get(url, { headers: { repeatRequestNum: repeatRequestNum + 1 } })
            res.send(urlRes.data)
        }
    }
}
