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

/** 推送类型名 → data 形状（客户端 WebSocketClient.onPush 的类型域） */
export interface LobbyPushMap {
    [LobbyPush.MailNew]: IMailNewPush;
    [LobbyPush.GuildEvent]: IGuildEventPush;
    [LobbyPush.ServerNotice]: IServerNoticePush;
}
