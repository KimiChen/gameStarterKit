import type {
    IGetProfileRes,
    IUserView,
    IUpdateProfileReq,
} from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { canonicalJsonString } from '../../../../generated/lobby-contract/protocol/lobbyRpc'
import { recordObjectActionSync, RedisInstance } from '@arthropoda/game-engine'

type NativeLobbyUserProfile = IUserView & {
    nickname: string
    avatarId: number
    province: string
}

/** user 域自身的持久化视图；登录建档先登记外部角色，再用 HSETNX 原子创建默认档。 */
export class NativeLobbyUserStore {
    private static readonly profilesKey = 'nativeLobby:user:profile:v1'
    private static readonly updateOperationsKey = 'nativeLobby:user:update-operation:v1'

    constructor(private readonly registerCharacter: (uid: string, sId: number) => Promise<void>) {}

    async ensure(uid: string, sId: number): Promise<void> {
        const redis = RedisInstance.getCenterRedis()
        const field = userField(uid, sId)
        if (await redis.hGet(NativeLobbyUserStore.profilesKey, field)) return
        // 角色权威先写外部身份服务，避免本服先宣告 ready 而身份服务没有角色记录。
        await this.registerCharacter(uid, sId)
        await redis.hSetNX(NativeLobbyUserStore.profilesKey, field, JSON.stringify(defaultProfile(uid)))
    }

    async require(uid: string, sId: number): Promise<IUserView> {
        const profile = await this.read(uid, sId)
        if (!profile) throw { code: 'USER_DATA_LOST', msg: '角色档案不存在' }
        return viewOf(profile)
    }

    async getPublic(uid: string, sId: number): Promise<IGetProfileRes['profile']> {
        const profile = await this.read(uid, sId)
        if (!profile) return null
        return {
            uid: profile.uid,
            nickname: profile.nickname,
            avatarId: profile.avatarId,
            province: profile.province,
            star: profile.star,
            maxRound: profile.maxRound,
            wins: profile.wins,
            losses: profile.losses,
        }
    }

    async setGuildId(uid: string, sId: number, guildId: number): Promise<void> {
        const redis = RedisInstance.getCenterRedis()
        const field = userField(uid, sId)
        const current = await this.read(uid, sId)
        if (!current) throw { code: 'USER_DATA_LOST', msg: '角色档案不存在' }
        if (current.guildId === guildId) return
        await redis.hSet(
            NativeLobbyUserStore.profilesKey,
            field,
            JSON.stringify({ ...current, guildId, ver: current.ver + 1 }),
        )
        recordObjectActionSync({
            versions: { nativeUser: current.ver + 1 },
            nativeUser: syncViewOf({ ...current, guildId, ver: current.ver + 1 }),
        })
    }

    async update(uid: string, sId: number, request: IUpdateProfileReq): Promise<void> {
        const redis = RedisInstance.getCenterRedis()
        const field = userField(uid, sId)
        const current = await this.read(uid, sId)
        if (!current) throw { code: 'USER_DATA_LOST', msg: '角色档案不存在' }
        const operationField = `${field}:${request.clientReqId}`
        const fingerprint = canonicalJsonString(request)
        const prior = await redis.hGet(NativeLobbyUserStore.updateOperationsKey, operationField)
        if (prior) {
            if (prior !== fingerprint) throw { code: 'OPERATION_CONFLICT', msg: '请求幂等标识已用于不同参数' }
            return
        }
        const next: NativeLobbyUserProfile = {
            ...current,
            ...(request.nickname === undefined ? {} : { nickname: request.nickname }),
            ...(request.avatarId === undefined ? {} : { avatarId: request.avatarId }),
            ...(request.province === undefined ? {} : { province: request.province }),
            ...(request.musicOn === undefined ? {} : { musicOn: request.musicOn }),
            ...(request.sfxOn === undefined ? {} : { sfxOn: request.sfxOn }),
            ver: current.ver + 1,
        }
        // ObjectAction 已按内部 uid 串行；先落档，再保存成功结果，失败不会回报写成功。
        await redis.hSet(NativeLobbyUserStore.profilesKey, field, JSON.stringify(next))
        await redis.hSet(NativeLobbyUserStore.updateOperationsKey, operationField, fingerprint)
        recordObjectActionSync({
            versions: { nativeUser: next.ver },
            nativeUser: syncViewOf(next),
        })
    }

    private async read(uid: string, sId: number): Promise<NativeLobbyUserProfile | null> {
        const raw = await RedisInstance.getCenterRedis().hGet(NativeLobbyUserStore.profilesKey, userField(uid, sId))
        if (!raw) return null
        try {
            const value = JSON.parse(raw) as NativeLobbyUserProfile
            return isProfile(value, uid) ? value : null
        } catch {
            return null
        }
    }
}

function userField(uid: string, sId: number): string {
    return `${sId}:${uid}`
}

function defaultProfile(uid: string): NativeLobbyUserProfile {
    return {
        uid,
        nickname: '',
        avatarId: -1,
        province: '',
        star: 0,
        maxRound: 0,
        wins: 0,
        losses: 0,
        stamina: 0,
        lastStaminaRecoverAt: 0,
        musicOn: true,
        sfxOn: true,
        guildId: 0,
        ver: 0,
    }
}

function viewOf(profile: NativeLobbyUserProfile): IUserView {
    // 公开视图＝私档全部字段去掉三个私有项；用显式删除而不是 `_` 前缀解构，
    // 避免与命名规则冲突，也避免新增字段时被静默漏掉。
    const view: Partial<NativeLobbyUserProfile> = { ...profile }
    delete view.nickname
    delete view.avatarId
    delete view.province
    return view as IUserView
}

/**
 * `user.getInfo` 的公开契约不能泄漏个人资料字段；而 nativeUser 是当前登录者自己的
 * 同步模块，必须带回本次写入的完整已提交档案，不能复用公开视图。
 */
function syncViewOf(profile: NativeLobbyUserProfile): NativeLobbyUserProfile {
    return { ...profile }
}

function isProfile(value: NativeLobbyUserProfile, uid: string): boolean {
    return value?.uid === uid && Number.isSafeInteger(value.ver) && value.ver >= 0
}
