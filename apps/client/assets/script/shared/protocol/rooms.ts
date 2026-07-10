/**
 * 房间名定义 —— 双端共享。
 * 服务端 gameServer.define(RoomName.Game, ...) 与客户端 client.joinOrCreate(RoomName.Game)
 * 必须使用同一份常量，避免手写字符串不一致。
 */
export const RoomName = {
    /** 主玩法房间 */
    Game: "game",
    /** 大厅（预留） */
    Lobby: "lobby",
} as const;

export type RoomNameType = (typeof RoomName)[keyof typeof RoomName];
