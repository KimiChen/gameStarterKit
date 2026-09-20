import { RedisInstance } from '@arthropoda/game-engine'
import { getHttpReqClientIp } from '@arthropoda/game-engine'
import { UtilTime } from '@arthropoda/game-engine'
import { clonedeep, md5, ucfirst } from '@arthropoda/game-engine'
import { GmConfigCatalog } from '../config/GmConfig'
import { GmExecutionContext } from './GmExecutionContext'
import { classList } from '../../../../generated/configTypes/gm-info'
import { WhiteIp } from '../../../http/security/WhiteIp'
import { Request } from 'express'

export class GmRequestDispatcher {
    static readonly GM_REQUEST_EXPIRE = UtilTime.MINUTE_SECOND * 15

    private gmContext: GmExecutionContext

    private isPost: boolean = false

    private bodyParams: any = {}

    private queryParams: any = {}

    private methodParams: any = {}

    constructor() {
        this.gmContext = new GmExecutionContext()
    }

    async doApi(req: Request) {
        const ip = getHttpReqClientIp(req)
        let whiteIPList = GmConfigCatalog.white?.ip ?? []
        whiteIPList = whiteIPList.concat(CP.platform.gmApiWhiteIPList ?? [])
        WhiteIp.checkWhiteIPList(ip, whiteIPList)

        this.parseRequestParams(req)
        return this.doAction()
    }

    /**
     * 1 参数分2部分，一部分是url地址上的参数, 一部分是post的body参数
     * 2 get请求时，是只有url上的参数
     *
     * @param req
     */
    private parseRequestParams(req: Request) {
        this.isPost = req.method == 'POST'

        if (this.isPost) {
            this.bodyParams = typeof req.body === 'object' ? req.body : {}
        }

        this.queryParams = typeof req.query === 'object' ? req.query : {}

        if (this.isPost) {
            this.methodParams = clonedeep(this.bodyParams)
        } else {
            this.methodParams = clonedeep(this.queryParams)
            delete this.methodParams.mod
            delete this.methodParams.do
            delete this.methodParams.sign
        }
    }

    /*
     * 调用相应对象处理
     */
    private async doAction() {
        const mod = this.queryParams.mod ?? ''
        const doAction = this.queryParams.do ?? '' //do是保留字段不能用

        if (!this.checkSign(CP.platform.gmSecret ?? '')) {
            this.gmContext.setGmMsg(GmExecutionContext.CODE_SIGN_ERROR, '签名错误')
            return this.gmContext.gmFailResponse()
        }
        if (!mod || !doAction) {
            this.gmContext.setGmMsg(GmExecutionContext.CODE_MOD_ERROR, 'mod or do 错误')
            return this.gmContext.gmFailResponse()
        }
        Log.info(`gmApiReq: mod:${mod},do:${doAction},req:${JSON.stringify(this.methodParams)}`)

        this.gmContext.mod = mod
        this.gmContext.do = doAction
        this.gmContext.requestData = this.methodParams

        // 判断当前的 requestId 是否正在处理或已处理过

        const requestId: string = this.queryParams.requestId ?? ''
        if (!requestId) {
            this.gmContext.setGmMsg(GmExecutionContext.CODE_MOD_ERROR, '请求的requestId不存在')
            return this.gmContext.gmFailResponse()
        }
        const redis = RedisInstance.getCenterRedis()
        const lockNx = await redis.setnx(requestId, '', GmRequestDispatcher.GM_REQUEST_EXPIRE)
        if (lockNx) {
            // 执行具体的接口
            const actionName = `Action${ucfirst(mod)}${ucfirst(doAction)}` as keyof typeof classList
            const actionClass = classList[actionName] ?? null
            if (!actionClass) {
                this.gmContext.setGmMsg(
                    GmExecutionContext.CODE_MOD_ERROR,
                    '请求的action不存在或者未调用classList脚本代码生成,需要Action开头且继承GmAction',
                    { actionName: actionName },
                )
                return this.gmContext.gmFailResponse()
            }
            let res = {}
            const ins = new actionClass(this.gmContext)
            try {
                res = await ins.doAction(this.methodParams)
            } catch (err) {
                res = false
                Log.error(err)
                this.gmContext.setGmMsg(GmExecutionContext.CODE_MOD_ERROR, 'run task error', { err: err })
            }
            if (res === false) {
                await redis.del(requestId)
                return this.gmContext.gmFailResponse()
            } else {
                await redis.set(requestId, JSON.stringify(res) ?? '', GmRequestDispatcher.GM_REQUEST_EXPIRE)
                return this.gmContext.gmSuccessResponse(res)
            }
        } else {
            const requestIdRes = await redis.getObject(requestId)
            if (requestIdRes) {
                return this.gmContext.gmSuccessResponse(requestIdRes)
            } else {
                return this.gmContext.gmFailResponse()
            }
        }
    }

    /*
     * checkSign
     * 当有body的时候,为body的数值参与加密
     * 否则是url的参数参与加密
     */
    private checkSign(secret: string) {
        if (PLATFORM === 'bearjoy' && PLATFORM_VERSION !== 'release') {
            return true
        }
        const sign = this.queryParams.sign ?? ''
        const params = this.isPost ? this.bodyParams : this.methodParams

        const keys = Object.keys(params).sort()
        const signStrArr: string[] = []

        for (const key of keys) {
            signStrArr.push(key + '=' + params[key])
        }
        const signStr = signStrArr.join('&') + secret

        return sign === md5(signStr)
    }
}
