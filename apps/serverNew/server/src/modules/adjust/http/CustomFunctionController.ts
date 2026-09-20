import { Body, Get, JsonController, Post, QueryParam, Req, UseBefore } from 'routing-controllers'
import { Request } from 'express'
import { Service } from 'typedi'
import { User } from '../../user/bean/User'
import { ApiChangeAction } from '../api/ApiChangeAction'
import { ResError } from '../../../http/constants/httpError'
import { AdjustAccessMiddleware } from './AdjustAccessMiddleware'
import { AdjustActionDispatcher } from './AdjustActionDispatcher'
import { AdjustDocumentQuery } from './AdjustDocumentQuery'
import {
    buildCustomFunctionTree,
    findCustomFunction,
    formatCustomFunctionResult,
    loadCustomFunctionOptions,
} from './customFunctionTree'
import { auditAi, digestAiValue, getAdjustAiPolicy } from './ai/aiPolicy'

interface CustomFunctionCommitBody {
    route?: string
    flag?: string
    data?: { name?: string; value?: any }[]
    injectArr?: any[]
    secret?: string
}

interface CustomFunctionOptionsBody {
    methods?: string[]
}

@JsonController('/adjust/customFunc')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class CustomFunctionController {
    constructor(
        private readonly actionDispatcher: AdjustActionDispatcher,
        private readonly documentQuery: AdjustDocumentQuery,
    ) {}

    private requireAiCustomFunction(req: Request) {
        if (req.get('x-adjust-tool-source') === 'ai-assistant' && !getAdjustAiPolicy().customFunction) {
            throw new ResError('当前线路未开启 AI 自定义功能工具')
        }
    }

    private async loadUser(uId: number) {
        if (!uId) throw new ResError('请带上uId=?')
        const user = await User.load(uId)
        if (!user) throw new ResError('该uId查询不到用户信息')
        return user
    }

    @Get('/get')
    async get(@QueryParam('uId') uId: number, @Req() req: Request) {
        this.requireAiCustomFunction(req)
        await this.loadUser(Number(uId))
        const list = buildCustomFunctionTree(this.documentQuery.loadChangeDocument())
        if (req.get('x-adjust-tool-source') === 'ai-assistant') {
            auditAi(req, { action: 'custom_function_list', uidDigest: digestAiValue(uId), resultCount: list.length })
        }
        return { status: 0, msg: '操作成功', data: { list, openCheck: false } }
    }

    @Get('/getOne')
    async getOne(
        @QueryParam('uId') uId: number,
        @QueryParam('method') method: string,
        @QueryParam('flag') flag?: string,
        @QueryParam('isApi') isApi?: string,
        @Req() req?: Request,
    ) {
        if (req) this.requireAiCustomFunction(req)
        await this.loadUser(Number(uId))
        const useFlag = flag || (String(isApi) === '1' || String(isApi) === 'true' ? 'api' : 'notice')
        const group = buildCustomFunctionTree(this.documentQuery.loadChangeDocument())
        const item = group
            .flatMap((node) => node.children)
            .find((node) => node.route === method && (!useFlag || node.flag === useFlag))
        if (!item) throw new ResError('未找到该功能')
        return { status: 0, msg: '操作成功', data: item }
    }

    @Post('/getOptions')
    async getOptions(@QueryParam('uId') uId: number, @Body() body: CustomFunctionOptionsBody, @Req() req: Request) {
        this.requireAiCustomFunction(req)
        const user = await this.loadUser(Number(uId))
        if (!Array.isArray(body.methods) || body.methods.length === 0) {
            throw new ResError('methods错误')
        }
        const data = await loadCustomFunctionOptions(user, body.methods)
        return { status: 0, msg: '操作成功', data }
    }

    @Post('/commit')
    async commit(@QueryParam('uId') uId: number, @Body() body: CustomFunctionCommitBody, @Req() req: Request) {
        const startedAt = Date.now()
        const isAiRequest = req.get('x-adjust-tool-source') === 'ai-assistant'
        try {
            this.requireAiCustomFunction(req)
            const user = await this.loadUser(Number(uId))
            if (!body.route || !body.flag) throw new ResError('路由错误')
            const action = findCustomFunction(this.documentQuery.loadChangeDocument(), body.route, body.flag)
            if (!action) throw new ResError('未找到该功能')
            const params = (body.data ?? []).map((item) => item.value)
            let result: any
            if (action.inApiLumen) {
                const actionObj = new ApiChangeAction(user)
                const target = (actionObj as any)[action.methodName]
                if (typeof target !== 'function') throw new ResError(`自定义功能不存在: ${action.methodName}`)
                result = await target.apply(actionObj, params)
            } else {
                const response = await this.actionDispatcher.execNoticeAction(
                    uId,
                    { routeList: [action.group, action.methodName], action },
                    params,
                )
                const payload = response.data
                if (payload?.code === -1) throw new ResError(payload.message || '固定服处理失败')
                result = payload?.data?.json ?? payload?.data ?? payload
            }
            if (isAiRequest) {
                auditAi(req, {
                    action: 'custom_function_commit',
                    uidDigest: digestAiValue(uId),
                    route: body.route,
                    flag: body.flag,
                    parameterCount: params.length,
                    durationMs: Date.now() - startedAt,
                })
            }
            return {
                status: 0,
                msg: '操作成功',
                result: formatCustomFunctionResult(result),
            }
        } catch (error) {
            if (isAiRequest) {
                auditAi(
                    req,
                    {
                        action: 'custom_function_commit',
                        uidDigest: digestAiValue(uId),
                        route: body?.route || '',
                        flag: body?.flag || '',
                        parameterCount: Array.isArray(body?.data) ? body.data.length : 0,
                        durationMs: Date.now() - startedAt,
                    },
                    error,
                )
            }
            throw error
        }
    }
}
