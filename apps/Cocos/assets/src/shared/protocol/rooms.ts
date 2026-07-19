/**
 * 房间名定义 —— 双端共享。
 * 服务端 gameServer.define(RoomName.Game, ...) 与客户端 client.joinOrCreate(RoomName.Game)
 * 必须使用同一份常量，避免手写字符串不一致。
 */
export const RoomName = {
    /** 主玩法房间 */
    Game: "game",
    /** 网关大厅房（服务端框架 M5）：取数/排位/邮件走单一 rpc 消息通道（docs/server/03） */
    Lobby: "lobby",
} as const;

export type RoomNameType = (typeof RoomName)[keyof typeof RoomName];

/**
 * 双端协议版本。房间 onAuth 以此挡「服务端已升协议、旧包还在跑」的旧客户端
 * （灰度/热更混跑期的部署自检）；HTTP /version 也回带它供启动期探测。
 * Schema 字段增删、消息名/语义变更时 +1，双端随 sync:shared 同步。
 */
export const PROTOCOL_VERSION = 1;

/** 房间 join options（client.joinOrCreate 第二参）——双端契约。 */
export interface IRoomJoinOptions {
    /** 协议版本（PROTOCOL_VERSION）。缺省视为 1（首版客户端未带 v）。 */
    v?: number;
    /** 框架 token（wx-login 签发；mock token / 缺省按游客进玩法房） */
    token?: string;
}
