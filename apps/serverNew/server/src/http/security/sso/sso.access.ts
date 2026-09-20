import { NextFunction, Request, Response } from 'express'
import { getHttpReqClientIp } from '@arthropoda/game-engine'
import { isOpenIps } from '../isOpenIps'
import { adjustSsoAuthenticator, SsoAccessError } from './AdjustSsoAuthenticator'
import { AdjustSsoUser } from './sso.types'
import { isToolWriteRequest } from './isToolWriteRequest'

const PUBLIC_TOOL_PATHS = new Set([
    '/adjust/domain',
    '/adjust/config',
    '/center/ssoConfig',
    '/center/ssoLogin',
    '/center/ssoCheckSession',
    '/center/ssoLogout',
])

const ADMIN_PATHS = new Set(['/center/ssoUserList', '/center/ssoUserAdd', '/center/ssoUserDelete'])

function isToolPath(path: string) {
    return (
        path.startsWith('/adjust/') ||
        path === '/adjust' ||
        path.startsWith('/config/') ||
        path === '/config' ||
        path.startsWith('/center/sso')
    )
}

export function getBearerToken(req: Request) {
    const authorization = req.get('authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) {
        return ''
    }
    return authorization.slice(7).trim()
}

export function isAllowedToolOrigin(req: Request) {
    const origin = req.get('origin')
    if (!origin) {
        return true
    }
    if (CP.platform.adjustOrigins?.includes(origin)) {
        return true
    }
    try {
        const originUrl = new URL(origin)
        const requestHost = req.get('host')
        return (
            originUrl.host === requestHost ||
            originUrl.hostname === 'localhost' ||
            originUrl.hostname === '127.0.0.1' ||
            originUrl.hostname === '::1'
        )
    } catch {
        return false
    }
}

function sendAccessError(res: Response, error: SsoAccessError) {
    res.status(error.statusCode).json({ s: error.statusCode, msg: error.message })
}

function auditAccountWhiteAccessDenied(req: Request, user: AdjustSsoUser | undefined, error: SsoAccessError) {
    if (!req.path.startsWith('/adjust/account/white/')) return
    Log.http.error(
        `[adjust-account-white-audit] ${JSON.stringify({
            time: new Date().toISOString(),
            operator: user?.name || user?.account || 'anonymous',
            operatorId: user?.uid || '',
            isAdmin: user?.isAdmin === true,
            ip: getHttpReqClientIp(req),
            success: false,
            action: 'access_denied',
            method: req.method,
            path: req.path,
            requestCount: Array.isArray(req.body?.accounts) ? req.body.accounts.length : 0,
            statusCode: error.statusCode,
            reason: error.message,
        })}`,
    )
}

function auditAiAccessDenied(req: Request, user: AdjustSsoUser | undefined, error: SsoAccessError) {
    if (req.get('x-adjust-tool-source') !== 'ai-assistant') return
    Log.http.error(
        `[adjust-ai-audit] ${JSON.stringify({
            time: new Date().toISOString(),
            operator: user?.name || user?.account || 'anonymous',
            operatorId: user?.uid || '',
            isAdmin: user?.isAdmin === true,
            source: 'ai-assistant',
            ip: getHttpReqClientIp(req),
            success: false,
            action: 'access_denied',
            method: req.method,
            path: req.path,
            statusCode: error.statusCode,
        })}`,
    )
}

export async function toolAccessMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!isToolPath(req.path)) {
        next()
        return
    }

    const reqIp = getHttpReqClientIp(req)
    if (!isOpenIps(reqIp) || !isAllowedToolOrigin(req)) {
        res.sendStatus(404)
        return
    }
    const origin = req.get('origin')
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
        res.sendStatus(204)
        return
    }

    const config = adjustSsoAuthenticator.getConfig()
    if (!config.enabled || PUBLIC_TOOL_PATHS.has(req.path)) {
        next()
        return
    }

    const token = getBearerToken(req)
    if (!token) {
        const error = new SsoAccessError(401, '未提供认证 token')
        auditAccountWhiteAccessDenied(req, undefined, error)
        auditAiAccessDenied(req, undefined, error)
        sendAccessError(res, error)
        return
    }
    let user: AdjustSsoUser | undefined
    try {
        user = await adjustSsoAuthenticator.authenticate(token)
        ;(req as Request & { adjustSsoUser?: AdjustSsoUser }).adjustSsoUser = user

        if (ADMIN_PATHS.has(req.path) && !user.isAdmin) {
            throw new SsoAccessError(403, '权限不足，仅管理员可操作')
        }
        if (config.isGameLine && isToolWriteRequest(req) && !user.isAdmin) {
            throw new SsoAccessError(403, '权限不足：当前账号仅有只读权限')
        }
        next()
    } catch (error) {
        if (error instanceof SsoAccessError) {
            auditAccountWhiteAccessDenied(req, user, error)
            auditAiAccessDenied(req, user, error)
            sendAccessError(res, error)
            return
        }
        next(error)
    }
}
