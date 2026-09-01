/**
 * RoomProfile 注册表（Non-intrusive §6.2）：`(mode, profileId) → {startPolicy, accessPolicy}`。
 *
 * - profile id 的全集真源是 generated catalog（`GAMEPLAY_CATALOG[mode].profiles`，来自
 *   manifest.json）；本表只把 id 映射到 policy 组合——校验 `id ∈ catalog.profiles`，
 *   catalog 声明了却没有 policy 定义、或 policy 定义了 catalog 未声明的 id 都 fail-fast；
 * - "default" = auto + matchmaking：ballMove/idle 现状行为零变；
 * - "private" = owner-ready + invite-code：由 fixture mode（privateFixture）驱动测试，
 *   任何 mode 以后声明同名 profile 即获得同一组合（不复制 mode，§6.2）；
 * - 启用 owner-ready / invite profile 的 mode 必须在 state.json 声明对应 fragment
 *   （ownerReady / inviteRoom）——启动期断言（§6.2/§4.6），`assertRoomProfilesConfigured`
 *   在组合根与测试里对整个 catalog 跑一遍。
 */
import { GAMEPLAY_CATALOG } from "@game/shared";
import { ROOM_STATE_FRAGMENTS } from "../schema/GameRoomState";
import { AUTO_START_POLICY, OWNER_READY_START_POLICY, type StartPolicy } from "./StartPolicy";
import { INVITE_CODE_ACCESS_POLICY, MATCHMAKING_ACCESS_POLICY, type AccessPolicy } from "./AccessPolicy";

export interface RoomProfile {
    readonly id: string;
    readonly mode: string;
    readonly startPolicy: StartPolicy;
    readonly accessPolicy: AccessPolicy;
}

export const DEFAULT_ROOM_PROFILE_ID = "default";

/**
 * profile id → policy 组合。TS 手写（§9 阶段 8 明确 registry 形态）；键集必须与全 catalog
 * 声明的 profile id 并集一致（多/少都在断言里炸）。
 */
const PROFILE_POLICIES: Readonly<Record<string, {
    readonly startPolicy: StartPolicy;
    readonly accessPolicy: AccessPolicy;
}>> = Object.freeze({
    [DEFAULT_ROOM_PROFILE_ID]: {
        startPolicy: AUTO_START_POLICY,
        accessPolicy: MATCHMAKING_ACCESS_POLICY,
    },
    "private": {
        startPolicy: OWNER_READY_START_POLICY,
        accessPolicy: INVITE_CODE_ACCESS_POLICY,
    },
});

type CatalogEntry = {
    readonly profiles: readonly string[];
};

function catalogEntry(mode: string): CatalogEntry | null {
    const entry = (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, CatalogEntry>>>)[mode];
    return entry ?? null;
}

function fragmentsOf(mode: string): readonly string[] {
    return (ROOM_STATE_FRAGMENTS as Readonly<Partial<Record<string, readonly string[]>>>)[mode] ?? [];
}

/** policy 组合所需 fragment 的启动期断言（§6.2：启用 owner-ready/invite profile 时必须存在）。 */
function assertProfileFragments(profile: RoomProfile): void {
    const fragments = fragmentsOf(profile.mode);
    if (profile.startPolicy.kind === "owner-ready" && !fragments.includes("ownerReady")) {
        throw new Error(
            `[RoomProfile] mode ${profile.mode} 的 profile "${profile.id}" 需要 ownerReady state fragment：`
            + `在 apps/shared/schema/gameplays/${profile.mode}/state.json 声明 "fragments": ["ownerReady", …]`,
        );
    }
    if (profile.accessPolicy.kind === "invite-code" && !fragments.includes("inviteRoom")) {
        throw new Error(
            `[RoomProfile] mode ${profile.mode} 的 profile "${profile.id}" 需要 inviteRoom state fragment：`
            + `在 apps/shared/schema/gameplays/${profile.mode}/state.json 声明 "fragments": […, "inviteRoom"]`,
        );
    }
}

/**
 * 解析 `(mode, profileId)`。未知 mode、id ∉ catalog.profiles、catalog 声明了但本表没有
 * policy 定义、fragment 缺失都抛（fail-fast；join 侧把它映射为拒绝）。
 */
export function resolveRoomProfile(mode: string, profileId: string): RoomProfile {
    const entry = catalogEntry(mode);
    if (!entry) {
        throw new Error(`[RoomProfile] 未知 mode：${mode}（不在 GAMEPLAY_CATALOG）`);
    }
    if (!entry.profiles.includes(profileId)) {
        throw new Error(`[RoomProfile] mode ${mode} 未声明 profile "${profileId}"（manifest.profiles=${JSON.stringify(entry.profiles)}）`);
    }
    const policies = PROFILE_POLICIES[profileId];
    if (!policies) {
        throw new Error(
            `[RoomProfile] profile "${profileId}" 在 catalog 声明但没有 policy 定义——先在 rooms/core/RoomProfile.ts 登记`,
        );
    }
    const profile: RoomProfile = {
        id: profileId,
        mode,
        startPolicy: policies.startPolicy,
        accessPolicy: policies.accessPolicy,
    };
    assertProfileFragments(profile);
    return profile;
}

/** mode 是否声明了某 profile（join validation 的存在性快查，不抛）。 */
export function modeDeclaresProfile(mode: string, profileId: string): boolean {
    return catalogEntry(mode)?.profiles.includes(profileId) ?? false;
}

/**
 * 启动期全量断言（组合根 `registerDefaultGameModes` 后调用 + 测试直调）：
 *  - catalog 里每个 (mode, profile) 都能 resolve（policy 存在 + fragment 存在 + 不等式已由
 *    config 加载期断言覆盖）；
 *  - PROFILE_POLICIES 没有悬空 id（定义了却没有任何 mode 声明——防误拼写静默失效）。
 */
export function assertRoomProfilesConfigured(): void {
    const declared = new Set<string>();
    for (const [mode, entry] of Object.entries(GAMEPLAY_CATALOG as Readonly<Record<string, CatalogEntry>>)) {
        for (const profileId of entry.profiles) {
            declared.add(profileId);
            resolveRoomProfile(mode, profileId);
        }
    }
    for (const profileId of Object.keys(PROFILE_POLICIES)) {
        if (!declared.has(profileId)) {
            throw new Error(`[RoomProfile] policy 定义了 profile "${profileId}"，但没有任何 mode 在 manifest.profiles 声明它`);
        }
    }
}
