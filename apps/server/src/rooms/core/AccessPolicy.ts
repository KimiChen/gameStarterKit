/**
 * AccessPolicy（Non-intrusive §6.2）：房间准入方式的判别联合。
 *
 * invite-code 的四个时间/配额参数取值在 `core/infra/config.ts` 冻结（产品可改数值），
 * 不等式约束（renewIntervalMs ≤ leaseTtlMs/3、leaseTtlMs < waitingDeadlineMs 等，
 * §6.7 第 6 条）在 config 加载期断言，⛔ 不允许留到运行时才暴露。
 */
import {
    INVITE_CODE_COOLDOWN_MS,
    INVITE_LEASE_TTL_MS,
    INVITE_MAX_ROOMS_PER_UID,
    INVITE_RENEW_INTERVAL_MS,
    INVITE_WAITING_DEADLINE_MS,
} from "../../core/infra/config";

export type AccessPolicy =
    | { readonly kind: "matchmaking" }
    | {
        readonly kind: "invite-code";
        readonly leaseTtlMs: number;
        readonly renewIntervalMs: number;
        readonly waitingDeadlineMs: number;
        readonly codeCooldownMs: number;
        readonly maxConcurrentRoomsPerUid: number;
    };

export const MATCHMAKING_ACCESS_POLICY: AccessPolicy = Object.freeze({ kind: "matchmaking" });

export const INVITE_CODE_ACCESS_POLICY: AccessPolicy = Object.freeze({
    kind: "invite-code",
    leaseTtlMs: INVITE_LEASE_TTL_MS,
    renewIntervalMs: INVITE_RENEW_INTERVAL_MS,
    waitingDeadlineMs: INVITE_WAITING_DEADLINE_MS,
    codeCooldownMs: INVITE_CODE_COOLDOWN_MS,
    maxConcurrentRoomsPerUid: INVITE_MAX_ROOMS_PER_UID,
} as const);
