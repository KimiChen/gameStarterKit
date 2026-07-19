/**
 * 房间状态的纯数据镜像接口 —— 双端共享。
 *
 * 服务端使用 @colyseus/schema 定义真正的 Schema 状态类（见 server/src/rooms/schema/）；
 * Schema 类依赖 @colyseus/schema 运行时，不能放进零依赖的 shared 包。
 * 客户端通过 colyseus.js 的反射握手解码状态，无需 Schema 类，
 * 本文件的接口只用来给客户端的 room.state 提供类型标注。
 *
 * ⚠ 服务端 Schema 字段增删时，必须同步修改本文件。
 */

export interface IPlayerState {
    /** Colyseus sessionId */
    id: string;
    name: string;
    /** 逻辑坐标 */
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    /** 是否已准备/存活等演示用标记 */
    alive: boolean;
}

export interface IGameRoomState {
    /** 逻辑帧号 */
    tick: number;
    /** 房间阶段，取值见 constants/game.ts 的 GamePhase */
    phase: string;
    /**
     * 本局唯一 id：进入 Playing 时生成一次、结算/证据链/去重全部复用同一 id
     * （服务端框架 M8a，09·K4）；Waiting 阶段为空串。
     */
    matchId: string;
    /** key 为 sessionId */
    players: Map<string, IPlayerState>;
}
