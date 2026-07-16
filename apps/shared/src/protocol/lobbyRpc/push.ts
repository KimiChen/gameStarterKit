/**
 * LobbyRoom 服务端主动推送（LOBBY_MSG_PUSH 信封 {type,data}）的类型化契约。
 *
 * 服务端 gateway/push.ts 是框架文件（Arthur 回流件），仍用字面量 "mail.new"——
 * 值必须与本表逐字节一致，由 test/lobby-rpc-contract.test.ts 扫源兜底。
 */

/** 推送类型名 */
export const LobbyPush = {
    /** 新邮件唤醒：⛔ 不承载邮件内容，客户端收到后走 mail.list 拉权威 */
    MailNew: "mail.new",
} as const;

export interface IMailNewPush {
    mailId: number;
}

/** 推送类型名 → data 形状（客户端 LobbyClient.onPush 的类型域） */
export interface LobbyPushMap {
    [LobbyPush.MailNew]: IMailNewPush;
}
