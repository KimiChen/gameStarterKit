import { assertExactKeys, boundedString, finiteInteger, isPlainRecord, type PlainRecord, WireValidationError } from "./http";

/**
 * 房间名定义 —— 双端共享。
 * 服务端 gameServer.define(RoomName.Game, ...) 与客户端 client.joinOrCreate(RoomName.Game)
 * 必须使用同一份常量，避免手写字符串不一致。
 */
export const RoomName = {
    /** 主玩法房间 */
    Game: "game",
    /** 网关大厅房（服务端框架 M5）：取数/排位/邮件走单一 rpc 消息通道（docs/SERVER.md §4 Lobby RPC） */
    Lobby: "lobby",
} as const;

export type RoomNameType = (typeof RoomName)[keyof typeof RoomName];

/**
 * 双端协议版本。房间 onAuth 以此挡「服务端已升协议、旧包还在跑」的旧客户端
 * （灰度/热更混跑期的部署自检）；HTTP /version 也回带它供启动期探测。
 * Schema 字段增删、消息名/语义变更时 +1，双端随 sync:shared 同步。
 *
 * 版本流水（新版本在上）：
 *   3 = WebPlatform 拆为独立 HTTP 服务：会话由外部 Public 契约签发，游戏服只做 Internal verify（提交 01fcbf5）。
 *   2 = M12e「会话按区」：单端语义作用域从账号收窄到 `(账号, 区)`。老包登录不带 `sId` ⇒ 拿到 s0 的 token，
 *       join `sId=1` 时 onAuth 去比 s1 的会话（不存在）⇒ 玩家看到「登录已过期」；bump 后旧包在 join 处
 *       被 `ProtocolMismatch` 明确拒掉（见 GameRoom.onAuth 注释）。
 *   1 = 首版。
 */
export const PROTOCOL_VERSION = 3;

/** 房间 join options（client.joinOrCreate 第二参）——双端契约。 */
export interface IRoomJoinOptions {
    /** 协议版本（PROTOCOL_VERSION）。缺省视为 1（首版客户端未带 v）。 */
    v?: number;
    /** WebPlatform Public API 签发的不透明 access token；缺失或伪造一律拒绝。 */
    token?: string;
    /**
     * 目标区服 sId（区服形态）。服务端 onAuth 进服硬闸校验 `sId ∈ 本进程/组 GROUP_ZONES`，
     * 不属于本组即拒（防串服）。缺省 = 单形态 / 大混服 / legacy，服务端不做区归属闸。
     * 详见 docs/DUAL_MODE.md §4.3（进服硬闸）/ §5.1（M11）。sId=0 保留大混服池。
     */
    sId?: number;
    /**
     * serverList 一致性哈希（WebPlatform `GET /v1/areas` 响应的 `hash`）。进服带上供服务端校验选服列表新鲜度
     * （配置更新后逼客户端重拉，避免用陈旧列表被准入层拒连）。当前为预留字段。
     */
    listHash?: string;
}

/**
 * Join options 的运行时校验。Colyseus 会把它们直接交给 onAuth，不能只依赖 TS
 * interface；未知字段、NaN/Infinity、越界区号及空 token 必须在进入连接流程前拒绝。
 */
export function validateRoomJoinOptions(input: unknown): IRoomJoinOptions {
    if (input === undefined) return {};
    if (!isPlainRecord(input)) throw new WireValidationError("ROOM_OPTIONS_OBJECT", "options");
    const value = input as PlainRecord;
    assertExactKeys(value, [], ["v", "token", "sId", "listHash"], "options");

    const out: IRoomJoinOptions = {};
    if (Object.prototype.hasOwnProperty.call(value, "v") && value.v !== undefined) {
        out.v = finiteInteger(value.v, "options.v", 1, 0xffff);
    }
    if (Object.prototype.hasOwnProperty.call(value, "token") && value.token !== undefined) {
        out.token = boundedString(value.token, "options.token", 1, 256);
    }
    if (Object.prototype.hasOwnProperty.call(value, "sId") && value.sId !== undefined) {
        out.sId = finiteInteger(value.sId, "options.sId", 0, 0xffff);
    }
    if (Object.prototype.hasOwnProperty.call(value, "listHash") && value.listHash !== undefined) {
        out.listHash = boundedString(value.listHash, "options.listHash", 1, 256);
    }
    return out;
}
