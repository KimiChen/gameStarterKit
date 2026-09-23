import axios from 'axios'
import { createHash, randomBytes } from 'crypto'
import { RedisInstance, timestamp } from '@arthropoda/game-engine'
import { ChannelSign } from '../../../modules/channel/ChannelSign'
import { AdjustWstoolUserModel } from '../../../../generated/persistence/AdjustWstoolUserModel'
import { createSsoSessionToken, parseSsoSessionToken } from './sso.token'
import { AdjustSsoUser, SsoRemoteUser, SsoSessionPayload, SsoSessionRecord } from './sso.types'

const DEFAULT_LOGIN_PATH = '/sso'
const VERIFY_PATH = '/api/game-account/login-by-token'
const DEFAULT_SESSION_TTL_SECONDS = 3 * 86400
const TOKEN_CACHE_TTL_SECONDS = 300
const TOKEN_CACHE_PREFIX = 'adjust:sso:token:'
const SESSION_PREFIX = 'adjust:sso:session:'
const REVOKED_PREFIX = 'adjust:sso:revoked:'

export class SsoAccessError extends Error {
    constructor(
        public readonly statusCode: 401 | 403,
        message: string,
    ) {
        super(message)
    }
}

function normalizeString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

export class AdjustSsoAuthenticator {
    getConfig() {
        const config = CP.platform.adjustSso
        return {
            enabled: config?.enabled === true,
            serverUrl: normalizeString(config?.serverUrl),
            loginPath: normalizeString(config?.loginPath) || DEFAULT_LOGIN_PATH,
            isGameLine: config?.isGameLine === true,
            whiteOpen: config?.whiteOpen === true,
            admins: (config?.admins ?? []).map(normalizeString).filter(Boolean),
            sessionTtlSeconds: config?.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS,
        }
    }

    async login(sourceToken: string, loginIp: string) {
        const remoteUser = await this.verifyRemoteToken(sourceToken)
        const config = this.getConfig()
        if (!(await this.canLogin(remoteUser.name))) {
            throw new SsoAccessError(403, '当前账号未被授权登录')
        }

        const now = timestamp()
        const sessionPayload: SsoSessionPayload = {
            openId: `${remoteUser.uid}__SSO`,
            sessionId: randomBytes(16).toString('hex'),
            issuedAt: now,
            expiresAt: now + config.sessionTtlSeconds,
        }
        const sessionRecord: SsoSessionRecord = {
            ...sessionPayload,
            ...remoteUser,
            loginIp,
        }
        await RedisInstance.getCenterRedis().set(
            SESSION_PREFIX + sessionPayload.openId,
            JSON.stringify(sessionRecord),
            config.sessionTtlSeconds,
        )

        return {
            token: createSsoSessionToken(sessionPayload, CP.platform.sessionSignKey),
            userInfo: this.toAdjustUser(sessionRecord),
        }
    }

    async authenticate(token: string) {
        const payload = parseSsoSessionToken(token, CP.platform.sessionSignKey)
        if (!payload) {
            throw new SsoAccessError(401, 'token 无效')
        }
        if (payload.expiresAt <= timestamp()) {
            throw new SsoAccessError(401, 'token 已过期')
        }
        if (await RedisInstance.getCenterRedis().exists(REVOKED_PREFIX + payload.sessionId)) {
            throw new SsoAccessError(401, 'session 已失效')
        }

        const record = await this.getSession(payload.openId)
        if (!record || record.sessionId !== payload.sessionId) {
            throw new SsoAccessError(401, 'session 已失效')
        }
        if (!(await this.canLogin(record.name))) {
            await this.logout(token)
            throw new SsoAccessError(401, '当前账号未被授权登录')
        }
        return this.toAdjustUser(record)
    }

    async logout(token: string) {
        const payload = parseSsoSessionToken(token, CP.platform.sessionSignKey)
        if (!payload) {
            return
        }
        const record = await this.getSession(payload.openId)
        if (record?.sessionId === payload.sessionId) {
            await RedisInstance.getCenterRedis().del(SESSION_PREFIX + payload.openId)
        }
        const remainingTtl = Math.max(1, payload.expiresAt - timestamp())
        await RedisInstance.getCenterRedis().set(REVOKED_PREFIX + payload.sessionId, '1', remainingTtl)
    }

    async listUsers() {
        const rows = await AdjustWstoolUserModel.find({ order: { id: 'DESC' } })
        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            chinese_name: row.chineseName,
        }))
    }

    async addUser(name: string, chineseName: string) {
        if (!name) {
            throw new SsoAccessError(403, '参数错误: name 不能为空')
        }
        if (!chineseName) {
            throw new SsoAccessError(403, '参数错误: chinese_name 不能为空')
        }
        if (this.isAdmin(name)) {
            throw new SsoAccessError(403, '该用户已在管理员配置中，无需重复添加')
        }
        if (await AdjustWstoolUserModel.existsBy({ name })) {
            throw new SsoAccessError(403, '用户已存在')
        }
        const row = new AdjustWstoolUserModel()
        row.name = name
        row.chineseName = chineseName
        await row.save()
    }

    async deleteUser(name: string) {
        if (!name) {
            throw new SsoAccessError(403, '参数错误: name 不能为空')
        }
        if (this.isAdmin(name)) {
            throw new SsoAccessError(403, '该用户属于管理员，请在配置中维护')
        }
        const result = await AdjustWstoolUserModel.delete({ name })
        if (!result.affected) {
            throw new SsoAccessError(403, '用户不存在')
        }
    }

    isAdmin(name: string) {
        return this.getConfig().admins.includes(name)
    }

    private async canLogin(name: string) {
        const config = this.getConfig()
        if (!config.whiteOpen) {
            return true
        }
        if (!name) {
            return false
        }
        return this.isAdmin(name) || (await AdjustWstoolUserModel.existsBy({ name }))
    }

    private toAdjustUser(user: SsoSessionRecord): AdjustSsoUser {
        const config = this.getConfig()
        return {
            uid: user.openId,
            name: user.name,
            account: user.account,
            phone: user.phone,
            avatar: user.avatar,
            role: config.isGameLine ? 'readonly' : 'readwrite',
            isAdmin: this.isAdmin(user.name),
        }
    }

    private async getSession(openId: string) {
        const value = await RedisInstance.getCenterRedis().get(SESSION_PREFIX + openId)
        if (!value) {
            return null
        }
        try {
            return JSON.parse(value) as SsoSessionRecord
        } catch {
            return null
        }
    }

    private async verifyRemoteToken(sourceToken: string): Promise<SsoRemoteUser> {
        const cacheKey = TOKEN_CACHE_PREFIX + createHash('sha256').update(sourceToken).digest('hex')
        const cached = await RedisInstance.getCenterRedis().get(cacheKey)
        if (cached) {
            return JSON.parse(cached) as SsoRemoteUser
        }

        const config = this.getConfig()
        if (!config.serverUrl) {
            throw new Error('adjustSso.serverUrl 未配置')
        }

        const loginConfig = CA.login_key[PLATFORM] ?? CA.login_key.bearjoy
        if (!loginConfig) {
            throw new Error(`login_key 未配置 ${PLATFORM} 的 SSO 应用信息`)
        }
        const params = {
            token: sourceToken,
            appid: loginConfig.cp_app_id,
            time: timestamp(),
            sign: '',
        }
        params.sign = ChannelSign.createSign(params, loginConfig.cp_app_key)

        const response = await axios.get(`${config.serverUrl}${VERIFY_PATH}`, {
            params,
            timeout: 10000,
        })
        const user = response.data?.code === 0 ? response.data?.data?.user : null
        if (!user?.uid || !user?.name) {
            throw new SsoAccessError(401, 'SSO token 验证失败')
        }
        const remoteUser: SsoRemoteUser = {
            uid: normalizeString(user.uid),
            name: normalizeString(user.name),
            account: normalizeString(user.account ?? user.username ?? user.email ?? user.uid),
            phone: normalizeString(user.phone),
            avatar: normalizeString(user.avatar),
        }
        await RedisInstance.getCenterRedis().set(cacheKey, JSON.stringify(remoteUser), TOKEN_CACHE_TTL_SECONDS)
        return remoteUser
    }
}

export const adjustSsoAuthenticator = new AdjustSsoAuthenticator()
