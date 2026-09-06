import { ForceLogoutReason, type ForceLogoutReasonType } from "./coreErrors";

/**
 * LobbyRoom 服务端主动推送（LOBBY_MSG_PUSH 信封 {type,data}）的稳定 façade。
 *
 * 阶段 3 起推送全集由 registry.generated.ts 聚合：core 推送（ServerNotice/ForceLogout）
 * 声明在 coreErrors.ts，域推送（MailNew/GuildEvent）声明在各 domains/<域>.ts 的 pushes 段。
 * 新增一条域推送只改所属域文件 + `codegen:plugins`，⛔ 不再回到本文件登记四处。
 * 本文件保留强制下线的关闭码/文案（非 wire 聚合物）并 re-export 聚合名，兼容既有 import。
 */

export {
    ForceLogoutReason,
    validateForceLogoutPush,
    validateServerNoticePush,
    type ForceLogoutReasonType,
    type IForceLogoutPush,
    type IServerNoticePush,
} from "./coreErrors";
export { type IMailNewPush } from "./domains/mail";
export { type IGuildEventPush } from "./domains/guild";
export {
    LobbyPush,
    PUSH_RUNTIME_VALIDATORS,
    validateLobbyPush,
    validatePushData,
    type LobbyPushEnvelope,
    type LobbyPushMap,
    type LobbyPushType,
} from "./registry.generated";

/**
 * 踢人的 WebSocket 关闭码：**推送兜底**——连接已死推不到时，客户端仍能从 `onLeave(code)`
 * 判出「这是被踢，不是掉线」并给出正确提示。
 *
 * ⚠ **必须避开 Colyseus 保留码**（`@colyseus/shared-types` CloseCode）：
 * `4000 CONSENTED / 4001 SERVER_SHUTDOWN / 4002 WITH_ERROR / 4003 FAILED_TO_RECONNECT / 4010 MAY_TRY_RECONNECT`，
 * 以及其 ErrorCode 段 `4210–4217`。曾误用 4001–4003 ⇒ **每次优雅重启(4001)都会让全服玩家看到「账号已被封禁」
 * 并被清 token**、重连耗尽(4003)误判「强制下线」、解码失败(4002)误判「顶号」。
 * 故取 **49xx**（远离全部保留段）。`kick-close-code.test.ts` 机检不相交。
 */
export const KICK_CLOSE_CODE: Record<ForceLogoutReasonType, number> = {
    [ForceLogoutReason.Banned]: 4901,
    [ForceLogoutReason.Replaced]: 4902,
    [ForceLogoutReason.Revoked]: 4903,
};

/** 关闭码 → 原因（客户端 onLeave 兜底用；非踢人码返回 null = 普通掉线）。 */
export function forceLogoutReasonOf(code: number): ForceLogoutReasonType | null {
    for (const r of Object.values(ForceLogoutReason)) {
        if (KICK_CLOSE_CODE[r] === code) { return r; }
    }
    return null;
}

/** 强制下线提示文案（客户端可覆盖为多语言）。 */
export const ForceLogoutMessage: Record<ForceLogoutReasonType, string> = {
    [ForceLogoutReason.Banned]: "账号已被封禁",
    [ForceLogoutReason.Replaced]: "账号在其他设备登录，已下线",
    [ForceLogoutReason.Revoked]: "账号已被强制下线，请重新登录",
};
