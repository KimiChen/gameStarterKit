import { Body, Get, JsonController, Post, Req, Res } from 'routing-controllers'
import { Request, Response } from 'express'
import { Service } from 'typedi'
import { getHttpReqClientIp } from '@arthropoda/game-engine'
import { adjustSsoAuthenticator, SsoAccessError } from '../../../http/security/sso/AdjustSsoAuthenticator'
import { getBearerToken } from '../../../http/security/sso/sso.access'
import { AdjustSsoUser } from '../../../http/security/sso/sso.types'

function normalizeInput(value: unknown) {
    if (Array.isArray(value)) {
        return normalizeInput(value[0])
    }
    return typeof value === 'string' ? value.trim() : ''
}

function sendFailure(res: Response, error: unknown) {
    if (error instanceof SsoAccessError) {
        return res.status(error.statusCode === 401 ? 200 : error.statusCode).json({ s: 1, msg: error.message })
    }
    Log.http.error(error)
    return res.status(500).json({ s: 1, msg: 'SSO 服务暂时不可用' })
}

@JsonController('/center')
@Service()
export class SsoController {
    @Post('/ssoConfig')
    config() {
        const config = adjustSsoAuthenticator.getConfig()
        return {
            s: 0,
            ssoEnabled: config.enabled,
            isGameLine: config.isGameLine,
            ssoAdmins: config.admins,
            ssoServer: config.serverUrl,
            ssoLoginPath: config.loginPath,
        }
    }

    @Post('/ssoLogin')
    async login(@Body() body: { token?: unknown }, @Req() req: Request, @Res() res: Response) {
        const token = normalizeInput(body?.token)
        if (!token) {
            return res.status(400).json({ s: 1, msg: '参数错误: token 不能为空' })
        }
        try {
            const result = await adjustSsoAuthenticator.login(token, getHttpReqClientIp(req))
            return res.json({ s: 0, ...result })
        } catch (error) {
            return sendFailure(res, error)
        }
    }

    @Get('/ssoCheckSession')
    async checkSession(@Req() req: Request, @Res() res: Response) {
        const token = getBearerToken(req)
        if (!token) {
            return res.status(401).json({ s: 401, msg: '未提供 token' })
        }
        try {
            const userInfo = await adjustSsoAuthenticator.authenticate(token)
            return res.json({ s: 0, valid: true, userInfo })
        } catch (error) {
            if (error instanceof SsoAccessError) {
                return res.status(error.statusCode).json({ s: error.statusCode, valid: false, msg: error.message })
            }
            return sendFailure(res, error)
        }
    }

    @Post('/ssoLogout')
    async logout(@Req() req: Request) {
        const token = getBearerToken(req)
        if (token) {
            await adjustSsoAuthenticator.logout(token)
        }
        return { s: 0, success: true }
    }

    @Get('/ssoUserList')
    async userList(@Req() req: Request, @Res() res: Response) {
        try {
            this.assertAdmin(req)
            return res.json({ s: 0, list: await adjustSsoAuthenticator.listUsers() })
        } catch (error) {
            return sendFailure(res, error)
        }
    }

    @Post('/ssoUserAdd')
    async addUser(@Req() req: Request, @Body() body: { name?: unknown; chinese_name?: unknown }, @Res() res: Response) {
        try {
            this.assertAdmin(req)
            await adjustSsoAuthenticator.addUser(normalizeInput(body.name), normalizeInput(body.chinese_name))
            return res.json({ s: 0, success: true })
        } catch (error) {
            return sendFailure(res, error)
        }
    }

    @Post('/ssoUserDelete')
    async deleteUser(@Req() req: Request, @Body() body: { name?: unknown }, @Res() res: Response) {
        try {
            this.assertAdmin(req)
            await adjustSsoAuthenticator.deleteUser(normalizeInput(body.name))
            return res.json({ s: 0, success: true })
        } catch (error) {
            return sendFailure(res, error)
        }
    }

    private assertAdmin(req: Request) {
        const user = (req as Request & { adjustSsoUser?: AdjustSsoUser }).adjustSsoUser
        if (!user?.isAdmin) {
            throw new SsoAccessError(403, '权限不足，仅管理员可操作')
        }
    }
}
