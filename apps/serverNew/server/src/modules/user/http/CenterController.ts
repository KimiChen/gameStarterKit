import { Request, Response } from 'express'
import { Get, JsonController, QueryParams, Req, Res } from 'routing-controllers'
import { Service } from 'typedi'
import { PackageVersionQuery, UserLoginQuery } from './UserLoginQuery'
import { CenterLogin } from './CenterLogin'
import { LoginAnnouncementQuery } from '../../serverSettings/http/LoginAnnouncementQuery'
import { PackageVersionResponder } from '../../clientConfig/http/PackageVersionResponder'
import { OpenAPI } from 'routing-controllers-openapi'

@JsonController('/center')
@Service()
export class CenterController {
    constructor(
        private readonly centerLogin: CenterLogin,
        private readonly packageVersionResponder: PackageVersionResponder,
    ) {}

    @OpenAPI({ summary: '玩家登录' })
    @Get('/login')
    async login(@QueryParams() query: UserLoginQuery, @Req() req: Request) {
        return this.centerLogin.login(query, req)
    }

    @OpenAPI({ summary: 'GM玩家登录' })
    @Get('/gmLogin')
    async gmLogin(@QueryParams() query: UserLoginQuery, @Req() req: Request) {
        return this.centerLogin.gmLogin(query, req)
    }

    @OpenAPI({ summary: '获取游戏公告列表' })
    @Get('/gongGaoList')
    async getGongGaoList() {
        return LoginAnnouncementQuery.get()
    }

    @OpenAPI({ summary: '包管理请求' })
    @Get('/packageVersion')
    async packageVersion(@QueryParams() query: PackageVersionQuery, @Res() res: Response) {
        return this.packageVersionResponder.send(query, res)
    }
}
