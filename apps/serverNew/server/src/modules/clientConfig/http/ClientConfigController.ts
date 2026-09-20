import { Get, JsonController, QueryParam, QueryParams, Res } from 'routing-controllers'
import { Service } from 'typedi'
import { ClientConfigCatalog } from './ClientConfigCatalog'
import { ClientConfigGetListRes, ConfigZipQuery } from './DownloadQuery'
import { Response } from 'express'
import { OpenAPI } from 'routing-controllers-openapi'

/**
 * 客户端表格热更
 */
@JsonController('/clientConfig')
@Service()
export class ClientConfigController {
    constructor(private readonly configCatalog: ClientConfigCatalog) {}

    @OpenAPI({ summary: '可热更的配置列表' })
    @Get('/listOld')
    async getClientConfList(@QueryParam('sId') sId: int) {
        const configNames = this.configCatalog.getConfigNames()
        if (configNames.length == 0) {
            return { s: this.configCatalog.SUCCESS_CODE }
        }

        // 获取配置信息
        const configVerList = await this.configCatalog.getConfInfoMap(configNames, sId)

        const respone: ClientConfigGetListRes = {
            s: this.configCatalog.SUCCESS_CODE,
            l: Array.from(configVerList.values()),
            prefix: `http://${CP.platform.host}:${CP.platform.port}`,
            is_zip: this.configCatalog.IS_ZIP,
        }

        // json生成参数配置同步到前端

        return respone
    }

    @OpenAPI({ summary: '可热更的配置列表' })
    @Get('/list')
    async getClientConfListNew(@QueryParam('sId') sId: int) {
        const configNames = this.configCatalog.getConfigNames()
        if (configNames.length == 0) {
            return { s: this.configCatalog.SUCCESS_CODE }
        }

        // 获取配置信息
        const configVerList = await this.configCatalog.getConfInfoMap(configNames, sId)

        const respone: ClientConfigGetListRes = {
            s: this.configCatalog.SUCCESS_CODE,
            l: Array.from(configVerList.values()),
            prefix: `http://${CP.platform.host}:${CP.platform.port}`,
            is_zip: this.configCatalog.IS_ZIP,
        }

        // json生成参数配置同步到前端

        return respone
    }

    @OpenAPI({ summary: '打包发生客户端获取的json文件列表' })
    @Get('/configZip')
    async getZipFiles(@QueryParams() query: ConfigZipQuery, res: Response) {
        const fileNamesStr = query.fileNames
        const sId = query.sId
        if (!fileNamesStr) {
            return
        }

        res.header('X-Accel-Chareset', 'utf-8')
        res.header('Content-Type', 'application/octet-stream')
        res.header('Content-Disposition', 'attachment; filename=clientConfig.zip')
        res.header('X-Archive-Files', 'zip')

        const fileNames = fileNamesStr.split(',')
        // 获取配置信息
        const configVerList = await this.configCatalog.getConfInfoMap(fileNames, sId)

        const crc32 = '-'
        for (const [fileName, info] of configVerList) {
            res.write(`${crc32} ${info.size} ${info.uri} ${fileName}\n`)
        }
        res.send()
    }
}
