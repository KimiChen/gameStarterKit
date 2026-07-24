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
    /**
     * 目标区服 sId（区服形态）。服务端 onAuth 进服硬闸校验 `sId ∈ 本进程/组 GROUP_ZONES`，
     * 不属于本组即拒（防串服）。缺省 = 单形态 / 大混服 / legacy，服务端不做区归属闸。
     * 详见 docs/DUAL_MODE.md §4.3（进服硬闸）/ §5.1（M11）。sId=0 保留大混服池。
     */
    sId?: number;
    /**
     * serverList 一致性哈希（/area/list 响应的 `h`）。进服带上供服务端校验选服列表新鲜度
     * （配置更新后逼客户端重拉，避免用陈旧列表被准入层拒连）。当前为预留字段。
     */
    listHash?: string;
}
