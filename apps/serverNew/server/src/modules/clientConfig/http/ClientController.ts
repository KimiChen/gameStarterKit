import { Get, JsonController, QueryParam, QueryParams, Res } from 'routing-controllers'
import { Service } from 'typedi'
import { ClientConfigCatalog } from './ClientConfigCatalog'
import { TestConfigModel } from '../../../../generated/persistence/TestConfigModel'
import { Response } from 'express'
import { DownloadQuery } from './DownloadQuery'
import { OpenAPI } from 'routing-controllers-openapi'

/**
 * 客户端表格热更
 */
@JsonController('/client')
@Service()
export class ClientController {
    constructor(private readonly configCatalog: ClientConfigCatalog) {}

    @OpenAPI({ summary: '下载测试上传的临时配置文件' })
    @Get('/download')
    async downloadTempConfig(@QueryParams() query: DownloadQuery, @Res() res: Response) {
        const tempConf = (await TestConfigModel.find({ where: { serverId: query.sId, configName: query.name } }))[0]
        if (tempConf == null) {
            res.status(404).send('文件不存在')
            return
        }
        res.header({
            'Content-Type': 'text/html;charset=UTF-8',
            'Content-Disposition': `attachment; filename="${query.name}.json"`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
        })
        res.status(200).send(tempConf.jsonContent)
    }

    @OpenAPI({ summary: '下载配置文件' })
    @Get('/downloadConf')
    async downloadConfig(@QueryParam('name') name: string, @Res() res: Response) {
        res.download(this.configCatalog.ConfigGamePath + name + '.json')
    }
}
