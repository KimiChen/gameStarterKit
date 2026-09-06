/**
 * Lobby RPC core descriptor（阶段 3）：通用错误码 + core 推送（ServerNotice/ForceLogout）。
 *
 * `codegen:plugins` 语法读取本文件与 `domains/*.ts` 生成 `registry.generated.ts`；
 * 领域错误码（如 shop 的 INSUFFICIENT_BALANCE）归各域 descriptor，⛔ 不登记在这里。
 * 登记新 core 错误码顺序：此处 CORE_RPC_ERROR_CODES → 服务端 core/errors.ts 的 ERR_MAP 映射
 * → 按 docs/SERVER.md §13 登记点复核。
 */
import { assertExactKeys, boundedString, type RuntimeValidator, WireValidationError } from "../http";
import { defineLobbyPush } from "./defineDomain";
import { pushRecord } from "./primitives";

/** core 通用错误码（鉴权/限流/载荷/路由/幂等/内部错误；聚合进 registry 的 RPC_ERR_CODES）。 */
export const CORE_RPC_ERROR_CODES = [
    "AUTH_REQUIRED",
    "AUTH_EPOCH_STALE",
    "ACCOUNT_BANNED",
    "RATE_LIMITED",
    "INVALID_PAYLOAD",
    "UNKNOWN_TYPE",
    "BUSY",
    "STALE_FENCE",
    "IN_PROGRESS",
    "THAWING",
    "USER_DATA_LOST",
    "INTERNAL",
    // ── 阶段 4（幂等 v2，Non-intrusive §6.11/§6.12）新增；不上历史钉，按 core 声明序追加 ──
    /** 同 clientReqId 携带了不同 canonical payload（客户端缺陷：⛔ 不得换 payload 复用旧 ID）。 */
    "OPERATION_CONFLICT",
    /** 操作确定执行过，但通用结果缓存不可得（done-oversize 墓碑 / 契约版本升级 fail-closed）；按领域收据查询恢复。 */
    "OPERATION_RESULT_EXPIRED",
] as const;

/**
 * 聚合顺序钉：`RPC_ERR_CODES` 的历史登记顺序（= 拆分前 envelope.ts 数组的字节顺序，
 * docs/SERVER.md §13 的登记表顺序）。生成器先按此表排序，未上钉的新码（新域贡献）
 * 追加在表后（按域名排序、域内声明序）——**新增域错误码不需要动本表**。
 * 钉里引用了不存在于任何 descriptor 的码时生成器拒绝（防钉表漂移）。
 */
export const RPC_ERR_CODE_ORDER = [
    "AUTH_REQUIRED",
    "AUTH_EPOCH_STALE",
    "ACCOUNT_BANNED",
    "RATE_LIMITED",
    "INVALID_PAYLOAD",
    "UNKNOWN_TYPE",
    "INSUFFICIENT_BALANCE",
    "BUSY",
    "STALE_FENCE",
    "IN_PROGRESS",
    "GRANTING",
    "THAWING",
    "USER_DATA_LOST",
    "ORDER_MISMATCH",
    "INTERNAL",
] as const;

/**
 * 强制下线原因（单源；服务端踢人 / 客户端提示文案 / 关闭码三处共用）。
 * - `banned`   账号被封禁（GM 封号 SOP，DUAL_MODE §2.3）
 * - `replaced` **顶号**：账号在其他设备登录（单端语义——一个账号同时只有一个有效 token）
 * - `revoked`  运营强制下线（账号未封，可重新登录）
 */
export const ForceLogoutReason = {
    Banned: "banned",
    Replaced: "replaced",
    Revoked: "revoked",
} as const;
export type ForceLogoutReasonType = (typeof ForceLogoutReason)[keyof typeof ForceLogoutReason];

export interface IServerNoticePush {
    text: string;
}

export interface IForceLogoutPush {
    reason: ForceLogoutReasonType;
}

export const validateServerNoticePush: RuntimeValidator<IServerNoticePush> = (input) => {
    const value = pushRecord(input, "push.data");
    assertExactKeys(value, ["text"], [], "push.data");
    return { text: boundedString(value.text, "push.data.text", 1, 4096) };
};

export const validateForceLogoutPush: RuntimeValidator<IForceLogoutPush> = (input) => {
    const value = pushRecord(input, "push.data");
    assertExactKeys(value, ["reason"], [], "push.data");
    if (value.reason !== ForceLogoutReason.Banned
        && value.reason !== ForceLogoutReason.Replaced
        && value.reason !== ForceLogoutReason.Revoked) {
        throw new WireValidationError("PUSH_REASON", "push.data.reason");
    }
    return { reason: value.reason as ForceLogoutReasonType };
};

/** core 推送 descriptor（域外通用推送；域推送在各 domain 的 pushes 段声明）。 */
export const CORE_LOBBY_PUSHES = [
    defineLobbyPush("ServerNotice", "server.notice", validateServerNoticePush),
    defineLobbyPush("ForceLogout", "auth.forceLogout", validateForceLogoutPush),
] as const;
