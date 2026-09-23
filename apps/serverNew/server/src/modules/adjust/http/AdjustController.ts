import { Body, Get, JsonController, Post, QueryParam, QueryParams, Req, UseBefore } from 'routing-controllers'
import { Request as ExpressRequest } from 'express'
import { OpenSsl, RedisInstance, Url, timestamp } from '@arthropoda/game-engine'
import * as json5 from 'json5'
import { Service } from 'typedi'
import { User } from '../../user/bean/User'
import { ServerListModel } from '../../../../generated/persistence/ServerListModel'
import { ResError, ResSuccess } from '../../../http/constants/httpError'
import { AdjustDoMainResponse, AdjustGetCustomBody, NewUserQuery, ParseCommitActionBody } from './NewUserQuery'
import { AdjustActionDispatcher } from './AdjustActionDispatcher'
import { AdjustDocumentQuery } from './AdjustDocumentQuery'
import { AdjustTestAccountProvisioner } from './AdjustTestAccountProvisioner'
import { ServerUserModel } from '../../../../generated/persistence/ServerUserModel'
import { OpsUserModel } from '../../../../generated/persistence/OpsUserModel'
import { AdjustAccessMiddleware } from './AdjustAccessMiddleware'
import { OpenAPI } from 'routing-controllers-openapi'
import { FixedServerEndpoint } from '../../../http/FixedServerEndpoint'
import { buildAdjustQuickMenus } from './quickMenu'
import { auditAi, digestAiValue, getAdjustAiPolicy } from './ai/aiPolicy'

@JsonController('/adjust')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class AdjustController {
    constructor(
        private readonly actionDispatcher: AdjustActionDispatcher,
        private readonly documentQuery: AdjustDocumentQuery,
        private readonly accountProvisioner: AdjustTestAccountProvisioner,
    ) {}

    private routeList(request: ExpressRequest) {
        const input = request.query.routeList ?? request.query['routeList[]']
        if (Array.isArray(input)) return input.map(String)
        if (input === undefined || input === null || input === '') return []
        if (typeof input === 'string' && input.startsWith('[')) {
            try {
                const parsed = JSON.parse(input)
                if (Array.isArray(parsed)) return parsed.map(String)
            } catch {
                return [input]
            }
        }
        return [String(input)]
    }

    private queryNumber(input: unknown) {
        const value = Array.isArray(input) ? input[0] : input
        return Number(value)
    }

    private async loadUser(uId: number) {
        const user = await User.load(uId)
        if (!user) throw new ResError('该uId查询不到用户信息')
        return user
    }

    @OpenAPI({ summary: '获取线路列表' })
    @Get('/domain')
    async domain() {
        return {
            status: 0,
            msg: '操作成功',
            data: [],
        } satisfies AdjustDoMainResponse
    }

    @OpenAPI({ summary: '获取自定义功能' })
    @Post('/getCustomFunction')
    async getCustomFunction(@QueryParam('uId') uId: int, @Body() body: AdjustGetCustomBody) {
        let user: User | undefined
        try {
            user = await User.load(uId)
        } catch (e) {
            throw new ResError('该uId查询不到用户信息')
        }
        if (!user) {
            throw new ResError('无法找到该玩家')
        }
        const r = await this.documentQuery.getData(user, body.routeList, body.pageName)
        if (!r) {
            throw new ResError('操作失败，服务器有报错，查看错误日志')
        }

        return { status: 0, msg: '操作成功', data: [{ node: r, routeList: body.routeList }] }
    }

    @OpenAPI({ summary: '获取数据修改节点' })
    @Get('/get')
    async getData(@QueryParam('uId') uId: int, @Req() request: ExpressRequest) {
        const user = await this.loadUser(this.queryNumber(uId))
        const routeList = this.routeList(request)
        const data = await this.documentQuery.getData(user, routeList)
        return { status: 0, msg: '操作成功', data: [{ node: data, routeList }] }
    }

    @OpenAPI({ summary: '解析提交操作' })
    @Post('/parseCommitAction')
    async parseCommitAction(@QueryParam('uId') uId: int, @Body() body: ParseCommitActionBody) {
        const actionRequest = body.actionRequest
        let user: User | undefined
        try {
            user = await User.load(uId)
        } catch (e) {
            throw new ResError('该uId查询不到用户信息')
        }
        if (!user) {
            throw new ResError('无法找到该玩家')
        }

        const arItem = actionRequest[0]
        if (!arItem?.action) throw new ResError('actionRequest错误')

        if (['edit', 'del', 'add'].includes(arItem.action.route)) {
            try {
                const response = await this.actionDispatcher.sendDataModifyAction(uId, arItem.routeList, arItem.action)
                if (response.status !== 200 || response.data?.code === -1) {
                    throw new Error(response.data?.message || '固定服处理失败')
                }
            } catch (e: any) {
                throw new ResError(e.message)
            }
            const refreshedUser = await this.loadUser(uId)
            const refreshed = await this.documentQuery.getData(refreshedUser, arItem.routeList, body.pageName)
            return {
                status: 0,
                msg: '操作成功',
                data: [{ node: refreshed, routeList: arItem.routeList }],
                debug: '',
                codeMirrorMode: '',
            }
        }

        const params = []
        for (const child of arItem.action.controlNode?.children ?? []) {
            params.push(child.value)
        }

        if (arItem.action.inApiLumen > 0) {
            return this.actionDispatcher.execApiAction(user, arItem, params)
        }

        let result: any
        let status: int = 0
        let codeMirrorMode = 'javascript'
        try {
            const urlRes = await this.actionDispatcher.execNoticeAction(uId, arItem, params)
            result = urlRes.data
            if (result) {
                if (result.code === -1) {
                    throw new ResError('微服务处理出错:' + result.message)
                } else {
                    const json = result.data.json
                    if (json) {
                        if (json.startsWith('{')) {
                            //判断是json
                            result.data = json5.parse(json)
                        } else if (typeof json === 'string' && !json.startsWith('<!DOCTYPE')) {
                            result = `<!DOCTYPE html><body>${json}</body>`
                        } else {
                            result = json
                        }
                    } else if (/<!DOCTYPE html>/.test(result)) {
                        codeMirrorMode = ''
                    } else {
                        result.data = undefined
                    }
                }
            }
            status = urlRes.status == 200 ? 0 : 1
        } catch (e: any) {
            throw new ResError(e.message)
        }

        const ret = await this.documentQuery.getData(user, arItem.routeList, body.pageName)

        await this.actionDispatcher.reloadTimeAdd()

        return {
            status,
            data: [{ node: ret, routeList: arItem.routeList }],
            debug: result ?? '',
            codeMirrorMode,
        }
    }

    @OpenAPI({ summary: '创建新角色' })
    @Get('/newUser')
    async newUser(@QueryParams() querys: NewUserQuery) {
        const sId = querys.sId
        if (!FixedServerEndpoint.get(sId)) throw new ResError(`区服不存在: ${sId}`)
        const params = await this.accountProvisioner.quickRegPlatformUser()
        if (params === undefined) {
            throw new ResError('center login fail')
        }

        const webApi = `http://${CP.platform.host}:${CP.platform.port}`
        const gameLoginUrl = webApi + '/center/login'
        const resonse = await Url.get(gameLoginUrl, params)
        if (resonse.status != 200 || resonse.data.s !== 0) {
            throw new ResError('center login fail')
        }

        const apiUrl = querys.t == 1 ? webApi.replace(/^http:/, 'https:') : webApi
        return new ResSuccess({
            serverId: sId,
            hashKey: resonse.data.h,
            ws: FixedServerEndpoint.websocketUrl(sId),
            apiUrl,
        })
    }

    @OpenAPI({ summary: '查询玩家信息' })
    @Get('/userInfo')
    async userInfo(@QueryParam('uId') uId: int) {
        // 从redis中加载
        const user = await User.load(uId)
        if (user === undefined) {
            throw new ResError('该uId查询不到用户信息')
        }
        return {
            s: 0,
            status: 0,
            data: {
                id: user.id,
                sId: user.sId,
                name: user.name,
                raw: user.toString(),
            },
        }
    }

    @OpenAPI({ summary: '获取玩家的hashKey' })
    @Get('/getHash')
    async getHash(@QueryParam('uId') uId: int, @Req() request: ExpressRequest) {
        const startedAt = Date.now()
        const isAiRequest = request.get('x-adjust-tool-source') === 'ai-assistant'
        try {
            if (isAiRequest && !getAdjustAiPolicy().mockClient) {
                throw new ResError('当前线路未开启 AI 模拟客户端工具')
            }
            const user = await ServerUserModel.find({ where: { userId: `${uId}` } })
            if (user.length <= 0) throw new ResError('无法找到该玩家')
            const data: { userId: string; openId: string; time: int; opsType: int } = {} as any
            const opsUsers = await OpsUserModel.find({ where: { openId: user[0].userRegId } })
            if (opsUsers.length > 0) data.opsType = opsUsers[0].opsType
            data.userId = user[0].userRegId
            data.openId = user[0].userRegId
            data.time = timestamp()
            await RedisInstance.getCenterRedis().set(user[0].userRegId + '_login', JSON.stringify(data))
            const sId = Number(user[0].userSid)
            const response = {
                s: 0,
                hash: OpenSsl.encryptOpenssl(data, CP.platform.sessionSignKey),
                ws: FixedServerEndpoint.websocketUrl(sId),
                sId,
            }
            if (isAiRequest) {
                auditAi(request, {
                    action: 'mock_client_hash',
                    uidDigest: digestAiValue(uId),
                    sId,
                    durationMs: Date.now() - startedAt,
                })
            }
            return response
        } catch (error) {
            if (isAiRequest) {
                auditAi(
                    request,
                    {
                        action: 'mock_client_hash',
                        uidDigest: digestAiValue(uId),
                        durationMs: Date.now() - startedAt,
                    },
                    error,
                )
            }
            throw error
        }
    }

    @OpenAPI({ summary: '获取当前服务器时间' })
    @Get('/time')
    async time() {
        return { status: 0, timestamp: timestamp() }
    }

    @OpenAPI({ summary: '获取区服信息列表' })
    @Get('/getServer')
    async getServer() {
        const servers = await ServerListModel.find({ order: { sId: 'ASC' } })
        const svList: { value: int; name: int }[] = []
        for (const iterator of servers) {
            svList.push({ value: iterator.sId, name: iterator.sId })
        }
        return { status: 0, timestamp: timestamp(), data: svList }
    }

    @OpenAPI({ summary: '获取网页调试工具快捷入口' })
    @Get('/wstool/config')
    quickMenuConfig(@Req() request: ExpressRequest) {
        const webApi = `${request.protocol}://${request.get('host')}`
        return { s: 0, menus: buildAdjustQuickMenus(webApi) }
    }
}
