/**
 * LobbyRoom 服务端主动推送（LOBBY_MSG_PUSH 信封 {type,data}）的类型化契约 —— 真源。
 * 服务端 websocket/push.ts 与客户端 WebSocketClient.onPush 都直接 import 本表。
 */

/** 推送类型名 */
export const LobbyPush = {
    /** 新邮件唤醒：⛔ 不承载邮件内容，客户端收到后走 mail.list 拉权威 */
    MailNew: "mail.new",
    /** 工会事件唤醒：只带 seq，客户端 seq 不连续时走 guild.getEvents 拉增量（唤醒式推送语义） */
    GuildEvent: "guild.event",
    /** 全服公告（尽力送达；重要公告应另走邮件等权威渠道） */
    ServerNotice: "server.notice",
    /**
     * 强制下线（服务端**关连接之前**先推这一条，带 reason）：客户端据此弹出正确提示并回登录页。
     * 三种来源：封号 / 顶号（换端登录）/ 强制下线。⚠ 推送是尽力而为——连接已死则推不到，
     * 客户端**必须**同时按 `onLeave` 的关闭码兜底（`KICK_CLOSE_CODE`），见 docs/DUAL_MODE.md §2.3。
     */
    ForceLogout: "auth.forceLogout",
} as const;

export interface IMailNewPush {
    mailId: number;
}

/** 工会事件唤醒载荷：⛔ 不承载事件内容（丢推送/断线/离线三种情况统一走拉取自愈）。
 *  guildId 必带——seq 是**工会内**命名空间，不带身份的话换会后客户端水位跨会污染，
 *  高 seq 会 → 低 seq 会的切换会让唤醒被当迟到全部忽略（事件流静默失聪）。 */
export interface IGuildEventPush {
    seq: number;
    guildId: number;
}

export interface IServerNoticePush {
    text: string;
}

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

export interface IForceLogoutPush {
    reason: ForceLogoutReasonType;
}

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

/** 推送类型名 → data 形状（客户端 WebSocketClient.onPush 的类型域） */
export interface LobbyPushMap {
    [LobbyPush.MailNew]: IMailNewPush;
    [LobbyPush.GuildEvent]: IGuildEventPush;
    [LobbyPush.ServerNotice]: IServerNoticePush;
    [LobbyPush.ForceLogout]: IForceLogoutPush;
}
