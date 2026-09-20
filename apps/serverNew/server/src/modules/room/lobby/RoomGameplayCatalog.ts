import { GAMEPLAY_CATALOG } from '../../../../generated/lobby-contract/gameplays/catalog.generated'

/**
 * `room.prepareCreate` / `room.resolve` 的玩法目录校验。
 *
 * 目录真源是 shared 的 `gameplays/catalog.generated.ts`（编译进
 * `generated/lobby-contract/gameplays/`），⛔ 不在 serverNew 抄第二份 mode / profile 清单。
 *
 * 唯一需要额外声明的是 **profile → accessPolicy 的对应关系**：shared 的 catalog 只声明
 * `profiles` 与 `stateFragments`，而「哪个 profile 是邀请码私房」是 GameRoom 侧的产品策略
 * （`apps/server/src/rooms/core/RoomProfile.ts` 的 `PROFILE_POLICIES`，三项：default/dropIn =
 * matchmaking、private = invite-code）。这里只登记它的 **invite-code 子集**，并用两条
 * 来自 catalog 的断言把它钉住，防止它悄悄漂移成一份没人能验证的名单：
 *
 *  1. 登记了却没有任何 mode 声明 ⇒ 悬空（拼错 profile id 会静默失效）；
 *  2. 声明 invite-code 的 mode 必须在 state.json 里带 `inviteRoom` fragment —— 与 GameRoom 侧
 *     `assertProfileFragments` 同一条约束，用 catalog 自身的字段独立复核。
 */

/** profile → invite-code 的登记（GameRoom `PROFILE_POLICIES` 的 invite-code 子集）。 */
export const INVITE_CODE_PROFILE_IDS: ReadonlySet<string> = new Set(['private'])

/** 邀请码私房必需的状态 fragment（GameRoom 侧 `assertProfileFragments` 同值）。 */
export const INVITE_ROOM_STATE_FRAGMENT = 'inviteRoom'

export interface RoomInviteTarget {
    readonly mode: string
    readonly modeVersion: number
    readonly profile: string
}

interface CatalogEntry {
    readonly modeVersion: number
    readonly profiles: readonly string[]
    readonly stateFragments: readonly string[]
}

function catalogEntry(mode: string): CatalogEntry | null {
    return (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, CatalogEntry>>>)[mode] ?? null
}

/** mode 是否在 catalog 里声明了该 profile（resolve 侧的存在性快查，不抛）。 */
export function isRoomProfileDeclared(mode: string, profile: string): boolean {
    return catalogEntry(mode)?.profiles.includes(profile) ?? false
}

/**
 * `room.prepareCreate` 的目录闸：mode 存在、profile 已声明、modeVersion 与 catalog 一致、
 * 且该 profile 确实是 invite-code 私房。任一条不满足按 `INVALID_PAYLOAD` 拒绝（fail-closed，
 * ⛔ 不降级为「未知 mode 也照样建房」）。
 *
 * 错误文案与 GameRoom 侧 `privateRoomRpc.ts` 的 `handleRoomPrepareCreate` 保持一致：客户端
 * 对同一类拒绝应当拿到同一段文案，否则迁移前后同一个包会出现两种提示。
 */
export function resolveInviteRoomTarget(mode: string, profile: string, modeVersion: number): RoomInviteTarget {
    const entry = catalogEntry(mode)
    if (!entry || !entry.profiles.includes(profile)) {
        throw invalidPayload('未知玩法或未声明的 profile')
    }
    if (modeVersion !== entry.modeVersion) {
        throw invalidPayload('玩法版本与服务端不一致，请更新客户端')
    }
    if (!INVITE_CODE_PROFILE_IDS.has(profile)) {
        throw invalidPayload('该 profile 不是邀请码私房')
    }
    if (!entry.stateFragments.includes(INVITE_ROOM_STATE_FRAGMENT)) {
        // catalog 与 GameRoom 策略不一致：声明了 invite-code 的 profile 却没带 inviteRoom fragment。
        throw invalidPayload('profile 不可用')
    }
    return { mode, modeVersion, profile }
}

/**
 * 装配期全量断言（`RoomNativeLobbyRoutes.register()` 调用，fail-closed）：
 * 登记项不得悬空、声明 invite-code 的 mode 必须带 `inviteRoom` fragment。
 * ⛔ 不要把它降级成运行期警告——策略表与 catalog 漂移必须挡在启动阶段。
 */
export function assertInviteProfilesDeclared(): void {
    const declared = new Set<string>()
    for (const [mode, entry] of Object.entries(GAMEPLAY_CATALOG as Readonly<Record<string, CatalogEntry>>)) {
        for (const profile of entry.profiles) {
            if (!INVITE_CODE_PROFILE_IDS.has(profile)) continue
            declared.add(profile)
            if (!entry.stateFragments.includes(INVITE_ROOM_STATE_FRAGMENT)) {
                throw new Error(
                    `[room] mode ${mode} 的 profile "${profile}" 登记为 invite-code，但 catalog 未声明 ` +
                        `"${INVITE_ROOM_STATE_FRAGMENT}" fragment——与 GameRoom 侧策略漂移，拒绝启动`,
                )
            }
        }
    }
    for (const profile of INVITE_CODE_PROFILE_IDS) {
        if (!declared.has(profile)) {
            throw new Error(
                `[room] 登记了 invite-code profile "${profile}"，但没有任何 mode 在 catalog 的 profiles 里声明它`,
            )
        }
    }
}

function invalidPayload(msg: string): { code: string; msg: string } {
    return { code: 'INVALID_PAYLOAD', msg }
}
