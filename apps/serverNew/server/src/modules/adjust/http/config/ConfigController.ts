import { Body, Get, JsonController, Post, QueryParam, Req, UploadedFile, UseBefore } from 'routing-controllers'
import { Request as ExpressRequest } from 'express'
import { Service } from 'typedi'
import { AdjustConfigConversionClient } from './AdjustConfigConversionClient'
import { adjustConfigUploadStorage } from './adjustConfigUploadStorage'
import { UtilTime, md5, timestamp } from '@arthropoda/game-engine'
import { ServerListModel } from '../../../../../generated/persistence/ServerListModel'
import { TestConfigModel } from '../../../../../generated/persistence/TestConfigModel'
import { ConfHistoryRes } from './AdjustConfigDeleteReqBody'
import { QueuedLocalAction } from '../../../../runtime/action/QueuedLocalAction'
import { ActionConfigReloadBroadcast } from '../../action/ActionConfigReloadBroadcast'
import { ResError } from '../../../../http/constants/httpError'
import { AdjustAccessMiddleware } from '../AdjustAccessMiddleware'
import { OpenAPI } from 'routing-controllers-openapi'
import { auditAi, getAdjustAiPolicy } from '../ai/aiPolicy'
import { getAllGameConfig } from '../ai/aiKnowledge'

@JsonController('/config')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class ConfigController {
    constructor(private readonly conversionClient: AdjustConfigConversionClient) {}

    @OpenAPI({ summary: '获取全部游戏配置' })
    @Get('/all')
    async all(@Req() req: ExpressRequest) {
        const startedAt = Date.now()
        const isAiRequest = req.get('x-adjust-tool-source') === 'ai-assistant'
        try {
            if (isAiRequest) {
                const policy = getAdjustAiPolicy()
                if (!policy.enabled || !policy.gameConfig) {
                    return { status: 1, msg: '当前线路未开启 AI 游戏配置上下文', data: {} }
                }
            }
            const data = getAllGameConfig()
            if (isAiRequest) {
                auditAi(req, {
                    action: 'game_config_all',
                    resultCount: Object.keys(data).length,
                    durationMs: Date.now() - startedAt,
                })
            }
            return { status: 0, data }
        } catch (error) {
            if (isAiRequest) auditAi(req, { action: 'game_config_all', durationMs: Date.now() - startedAt }, error)
            throw error
        }
    }

    @OpenAPI({ summary: '配置热更历史' })
    @Post('/history')
    async history() {
        const list = await ServerListModel.find({ select: ['sId', 'sName'] })

        const response: ConfHistoryRes = {
            serverInfoArr: [],
            files: [],
            s: 0,
        }
        for (const item of list) {
            response.serverInfoArr.push({
                name: item.sName,
                value: item.sId,
            })
        }

        const files = await TestConfigModel.find()
        for (const file of files) {
            response.files.push({
                id: file.id,
                config_name: file.configName,
                server_id: file.serverId,
                update_ts: file.updateTs,
                create_ts: file.createTs,
                date: UtilTime.format(file.updateTs),
                can_start: file.canStart,
                available: file.available,
            })
        }

        return { s: 0, data: { data: response } }
    }

    @OpenAPI({ summary: '获取可用区服' })
    @Get('/getSelect')
    async getSelect() {
        const list = await ServerListModel.find({ select: ['sId', 'sName'] })
        const data = []
        for (const item of list) {
            data.push({
                name: item.sName,
                value: item.sId,
            })
        }
        return { s: 0, data: data }
    }

    @OpenAPI({ summary: '上传配置' })
    @Post('/upload')
    async upload(
        @UploadedFile('up_file_0', { options: { storage: adjustConfigUploadStorage } }) file: any,
        @Body() data: { server_id: string },
    ) {
        if (!file) {
            throw new ResError('请上传文件')
        }
        const arr = file.originalname.split('.')
        if (arr.length != 2) {
            throw new ResError('文件命名不合法')
        }

        // 0索引是英文名，1索引是后缀
        const fileName = arr[0]
        const fileContentName = arr[0] + '.' + arr[1]
        const saveFilepath = `public/uploadCfg/${fileName}.xlsx`

        if (arr[1] != 'xlsx') {
            throw new ResError('文件格式错误,不是xlsx文件')
        }
        const pattern = /[\u4e00-\u9fff]/
        if (pattern.test(fileName)) {
            throw new ResError(`文件名不能包含中文,/${fileName}`)
        }

        const serverId = data.server_id
        if (!serverId || serverId.length == 0) {
            throw new ResError('必须选择区服id')
        }

        const serverIds = serverId.split(',')
        if (!serverIds) {
            throw new ResError('必须选择区服id')
        }

        const jsonContent = await this.conversionClient.convertFile(saveFilepath, fileContentName, 'json')

        for (const svId of serverIds) {
            // 如果配置名称已存在数据库，则覆盖
            let conf = await TestConfigModel.findOneBy({
                serverId: Int(svId),
                configName: fileName,
            })
            if (!conf) {
                conf = new TestConfigModel()
                conf.createTs = timestamp()
            }
            conf.serverId = Int(svId)
            conf.configName = fileName
            conf.configContent = jsonContent
            conf.jsonContent = jsonContent
            conf.salt = md5(fileName + timestamp())
            conf.updateTs = timestamp()
            conf.canStart = 0
            await conf.save()
        }

        // 微服务重新加载配置
        await QueuedLocalAction.rpc(ActionConfigReloadBroadcast, {}, 0, 0)

        return { s: 0, msg: '上传成功' }
    }

    @OpenAPI({ summary: '删除配置' })
    @Post('/delete')
    async delete(@Body() body: { ids: string }) {
        const ids = body.ids.split(',')
        if (ids.length == 0) {
            throw new ResError('请选择要删除的配置')
        }
        await TestConfigModel.delete(ids)

        // 微服务重新加载配置
        await QueuedLocalAction.rpc(ActionConfigReloadBroadcast, {}, 0, 0)

        return { s: 0, msg: '删除配置成功' }
    }

    @OpenAPI({ summary: '查看配置' })
    @Get('show')
    async configShow(@QueryParam('id') query: { id: string }) {
        const result = await TestConfigModel.findOneBy({ id: Number(query.id) })
        return { s: 0, data: result?.jsonContent }
    }
}
