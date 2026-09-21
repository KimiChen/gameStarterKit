import { createHash } from 'node:crypto'
import {
    LobbyAuthRejection,
    type LobbyAuthInput,
    type LobbyAuthProvider,
    type LobbyConnectionContext,
    type LobbyIdentity,
    type LobbyWireBusinessError,
} from '@arthropoda/game-engine'
import {
    ForceLogoutReason,
    KICK_CLOSE_CODE,
    type ForceLogoutReasonType,
} from '../../../generated/lobby-contract/protocol/lobbyRpc'
import type { NativeLobbyReleasedIdentity } from '../lobby/NativeLobbyRouteRegistry'
import { WebPlatformSessionVerifier } from './WebPlatformSessionVerifier'

export interface NativeLobbyIdentityResolver {
    resolve(uid: string, sId: number): Promise<number>
}

interface VerifiedToken {
    readonly token: string
    readonly uid: string
    readonly issuedAtMs: number
    references: number
}

/** 关闭码 → 强制下线原因；`banned/revoked` 来自身份服务，`replaced` 来自本进程顶号。 */
const FORCE_LOGOUT_MESSAGE: Record<ForceLogoutReasonType, string> = {
    [ForceLogoutReason.Banned]: '账号已被封禁',
    [ForceLogoutReason.Replaced]: '账号在其他设备登录，已下线',
    [ForceLogoutReason.Revoked]: '账号已被强制下线，请重新登录',
}

export interface NativeLobbyAuthProviderOptions {
    readonly verifier: WebPlatformSessionVerifier
    readonly identities: NativeLobbyIdentityResolver
    /**
     * 本进程固定服务的区服（启动参数 `--sid`，与 `CP.service.sid` 已由 `ServiceRuntime` 对齐）。
     *
     * 客户端可以在 auth 帧里任意填 `sId`，因此这里是**必填**项：缺省或漏传就是 fail-open，
     * 「合法的他区票据」会被本进程当成自己区服的会话建连，串掉区服数据与内部身份。
     */
    readonly serverId: number
    readonly onAuthenticated?: (uid: string, internalUid: number, sId: number) => Promise<void>
    /**
     * 会话结束（断线 / 顶号 / 被踢）时调用；只在被释放的连接确实是该 uid/sId 的当前连接时触发。
     * 业务离线收尾必须挂在这里——旧的连接级断线回调依赖的 `SessionMgr` 已随 P6 删除。
     */
    readonly onReleased?: (identity: NativeLobbyReleasedIdentity) => Promise<void>
}

/**
 * 原生 Lobby 的会话适配：外部 uid 仅作不透明字符串保存；每条 RPC 回源验证 token。
 * `sessionEpoch` 包含签发时刻与 token 摘要，既能识别换票据又不把原 token 放入连接上下文。
 */
export class NativeLobbyAuthProvider implements LobbyAuthProvider {
    private readonly verifier: WebPlatformSessionVerifier
    private readonly identities: NativeLobbyIdentityResolver
    private readonly serverId: number
    private readonly onAuthenticated?: (uid: string, internalUid: number, sId: number) => Promise<void>
    private readonly onReleased?: (identity: NativeLobbyReleasedIdentity) => Promise<void>

    private readonly tokens = new Map<string, VerifiedToken>()
    private readonly online = new Map<string, LobbyConnectionContext>()
    /**
     * 运营后台沿用引擎内部 role_id；它只用于定位**当前在线**连接，不能替代持久身份映射。
     * 同一连接同时存在于此表与外部 uid 表，所有删除必须走 `removeOnline` 保持一致。
     */
    private readonly onlineByInternalUid = new Map<string, LobbyConnectionContext>()
    private readonly latestIssuedAt = new Map<string, number>()
    private forceLogout?: (connectionId: string, error: LobbyWireBusinessError, closeCode: number) => void

    constructor(options: NativeLobbyAuthProviderOptions) {
        if (!Number.isSafeInteger(options.serverId) || options.serverId < 1) {
            throw new Error('native Lobby auth requires a fixed server id')
        }
        this.verifier = options.verifier
        this.identities = options.identities
        this.serverId = options.serverId
        this.onAuthenticated = options.onAuthenticated
        this.onReleased = options.onReleased
    }

    setForceLogout(fn: (connectionId: string, error: LobbyWireBusinessError, closeCode: number) => void): void {
        this.forceLogout = fn
    }

    async authenticate(input: LobbyAuthInput): Promise<LobbyIdentity> {
        // 固定区服：本进程只服务一个区服。必须回源之前就拒绝，否则身份服务会为「他区票据」
        // 返回合法结果，本进程据此建连并落他区的角色/内部 uid。
        if (input.sId !== this.serverId) {
            throw new LobbyAuthRejection({ code: 'AUTH_REQUIRED', msg: '区服不匹配' })
        }
        const verified = await this.verifier.verify(input.token, input.sId)
        if (!verified.valid) throw rejectionOf(verified.reason)
        const accountKey = `${input.sId}:${verified.userId}`
        const latest = this.latestIssuedAt.get(accountKey)
        if (latest !== undefined && verified.issuedAtMs < latest) throw new Error('stale session epoch')
        const internalUid = await this.identities.resolve(verified.userId, input.sId)
        await this.onAuthenticated?.(verified.userId, internalUid, input.sId)
        const sessionEpoch = `${verified.issuedAtMs}:${tokenDigest(input.token)}`
        const current = this.tokens.get(sessionEpoch)
        if (current && (current.uid !== verified.userId || current.token !== input.token)) {
            throw new Error('ambiguous session epoch')
        }
        if (!current)
            this.tokens.set(sessionEpoch, {
                token: input.token,
                uid: verified.userId,
                issuedAtMs: verified.issuedAtMs,
                references: 0,
            })
        this.latestIssuedAt.set(accountKey, verified.issuedAtMs)
        // 内部角色 ID 随身份一起回传：会话结束时的业务离线收尾需要它，engine 只透传不解释。
        return { uid: verified.userId, sId: input.sId, sessionEpoch, internalUid }
    }

    async validateActive(context: LobbyConnectionContext): Promise<LobbyWireBusinessError | null> {
        const active = this.tokens.get(context.sessionEpoch)
        if (!active) return { code: 'AUTH_REQUIRED', msg: '会话已失效' }
        try {
            const verified = await this.verifier.verify(active.token, context.sId)
            if (!verified.valid) {
                if (verified.reason === 'BANNED') return { code: 'ACCOUNT_BANNED', msg: FORCE_LOGOUT_MESSAGE.banned }
                return { code: 'AUTH_REQUIRED', msg: '会话已失效' }
            }
            if (verified.userId !== context.uid) return { code: 'AUTH_REQUIRED', msg: '会话已失效' }
            if (this.latestIssuedAt.get(onlineKey(context)) !== active.issuedAtMs) {
                return { code: 'AUTH_EPOCH_STALE', msg: '会话已更新' }
            }
            if (verified.issuedAtMs !== active.issuedAtMs) return { code: 'AUTH_EPOCH_STALE', msg: '会话已更新' }
            return null
        } catch {
            // 外部身份服务不可用时不能把未复验请求继续执行业务。
            return { code: 'AUTH_REQUIRED', msg: '会话验证不可用' }
        }
    }

    async claimOnline(context: LobbyConnectionContext): Promise<void> {
        const token = this.tokens.get(context.sessionEpoch)
        if (!token) throw new Error('authenticated token missing before online claim')
        token.references++
        const key = onlineKey(context)
        const previous = this.online.get(key)
        const internalKey = internalOnlineKey(context)
        const previousInternal = this.onlineByInternalUid.get(internalKey)
        if (previousInternal && previousInternal.uid !== context.uid) {
            throw new Error('native Lobby internal uid maps to multiple external identities')
        }
        this.online.set(key, context)
        this.onlineByInternalUid.set(internalKey, context)
        if (previous && previous.connectionId !== context.connectionId) {
            // 顶号：新连接已就位后才踢旧连接，旧连接的迟到回调不会覆盖新会话。
            this.forceLogout?.(
                previous.connectionId,
                { code: 'AUTH_EPOCH_STALE', msg: FORCE_LOGOUT_MESSAGE.replaced },
                KICK_CLOSE_CODE[ForceLogoutReason.Replaced],
            )
        }
    }

    async releaseOnline(context: LobbyConnectionContext): Promise<void> {
        const token = this.tokens.get(context.sessionEpoch)
        if (token) {
            token.references--
            if (token.references <= 0) this.tokens.delete(context.sessionEpoch)
        }
        const key = onlineKey(context)
        // 只有「被释放的连接确实是该 uid/sId 的当前连接」才算真正的会话结束：顶号之后旧连接的
        // 迟到回调不能把新会话的离线收尾提前触发。旧实现靠 `SessionMgr` 比较连接 id，该链已删除。
        if (this.online.get(key)?.connectionId !== context.connectionId) return
        this.removeOnline(context)
        // 本 provider 的 `authenticate` 必定填 `internalUid`；缺失时不猜身份，宁可少做一次收尾。
        if (this.onReleased && context.internalUid !== undefined) {
            await this.onReleased({ uid: context.uid, sId: context.sId, internalUid: context.internalUid })
        }
    }

    connectionId(uid: string, sId: number): string | undefined {
        return this.online.get(`${sId}:${uid}`)?.connectionId
    }

    /** 只查询当前在线会话；不建立持久化 internal uid → 外部 uid 反查。 */
    connectionIdByInternalUid(internalUid: number, sId: number): string | undefined {
        if (!Number.isSafeInteger(internalUid) || internalUid < 1) return undefined
        return this.onlineByInternalUid.get(`${sId}:${internalUid}`)?.connectionId
    }

    /**
     * 运营强制下线（未封号，可重新登录）。这是 4903 的唯一入口：
     * 封号走鉴权拒绝（4901），顶号走 `claimOnline`（4902）。
     */
    revoke(uid: string, sId: number): boolean {
        return this.kick(uid, sId, ForceLogoutReason.Revoked)
    }

    /** 运营后台按内部 role_id 下线；仅命中当前在线连接，未命中返回 false。 */
    revokeByInternalUid(internalUid: number, sId: number): boolean {
        if (!Number.isSafeInteger(internalUid) || internalUid < 1) return false
        const context = this.onlineByInternalUid.get(`${sId}:${internalUid}`)
        return context ? this.kickContext(context, ForceLogoutReason.Revoked) : false
    }

    /** 踢掉当前在线连接；返回 false 表示该 uid/sId 当前没有在线连接。 */
    kick(uid: string, sId: number, reason: ForceLogoutReasonType): boolean {
        const key = `${sId}:${uid}`
        const context = this.online.get(key)
        if (!context) return false
        return this.kickContext(context, reason)
    }

    private kickContext(context: LobbyConnectionContext, reason: ForceLogoutReasonType): boolean {
        this.removeOnline(context)
        this.forceLogout?.(
            context.connectionId,
            {
                code: reason === ForceLogoutReason.Banned ? 'ACCOUNT_BANNED' : 'AUTH_EPOCH_STALE',
                msg: FORCE_LOGOUT_MESSAGE[reason],
            },
            KICK_CLOSE_CODE[reason],
        )
        return true
    }

    private removeOnline(context: LobbyConnectionContext): void {
        const externalKey = onlineKey(context)
        if (this.online.get(externalKey)?.connectionId === context.connectionId) this.online.delete(externalKey)
        const internalKey = internalOnlineKey(context)
        if (this.onlineByInternalUid.get(internalKey)?.connectionId === context.connectionId) {
            this.onlineByInternalUid.delete(internalKey)
        }
    }
}

/** 身份服务的拒绝原因 → wire 错误码与关闭码；只有封号是强制下线。 */
function rejectionOf(reason: 'NOT_FOUND' | 'MISMATCH' | 'BANNED' | 'DEREGISTERED' | 'EXPIRED'): LobbyAuthRejection {
    if (reason === 'BANNED') {
        return new LobbyAuthRejection({
            code: 'ACCOUNT_BANNED',
            msg: FORCE_LOGOUT_MESSAGE.banned,
            closeCode: KICK_CLOSE_CODE[ForceLogoutReason.Banned],
            forceLogout: true,
        })
    }
    if (reason === 'DEREGISTERED') {
        return new LobbyAuthRejection({ code: 'AUTH_REQUIRED', msg: '账号已注销' })
    }
    return new LobbyAuthRejection({ code: 'AUTH_REQUIRED', msg: '认证失败' })
}

function onlineKey(context: LobbyConnectionContext): string {
    return `${context.sId}:${context.uid}`
}

function internalOnlineKey(context: LobbyConnectionContext): string {
    const internalUid = context.internalUid
    if (typeof internalUid !== 'number' || !Number.isSafeInteger(internalUid) || internalUid < 1) {
        throw new Error('native Lobby online context is missing a valid internal uid')
    }
    return `${context.sId}:${internalUid}`
}

function tokenDigest(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}
