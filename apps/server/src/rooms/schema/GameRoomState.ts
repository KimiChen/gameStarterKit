import { Schema, type, MapSchema } from "@colyseus/schema";
import { GamePhase, PLAYER_INIT_HP } from "@game/shared";

/**
 * 房间同步状态（@colyseus/schema v4）。
 *
 * ⚠ 字段增删时必须同步修改 shared/src/protocol/state.ts 中的纯数据镜像接口
 *   （IPlayerState / IGameRoomState），客户端依赖它做类型标注。
 */
export class PlayerState extends Schema {
    @type("string") id: string = "";
    @type("string") name: string = "";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") hp: number = PLAYER_INIT_HP;
    @type("number") maxHp: number = PLAYER_INIT_HP;
    @type("boolean") alive: boolean = true;

    // ---- 以下为服务端内部字段，未加 @type，不参与同步 ----

    /** 当前移动输入方向（已归一化） */
    dirX = 0;
    dirY = 0;
    /** 各技能上次释放时间戳（ms），用于冷却判断 */
    lastCastAt: Record<number, number> = {};
    /** 假数据：玩家等级，影响伤害公式 */
    level = 1;
}

export class GameRoomState extends Schema {
    /** 逻辑帧号 */
    @type("number") tick: number = 0;
    /** 房间阶段，取值见 shared 的 GamePhase */
    @type("string") phase: string = GamePhase.Waiting;
    /**
     * 本局唯一 id：进入 Playing 时生成一次、结算/证据链/去重复用同一 id
     * （服务端框架 M8a，09·K4）；Waiting 阶段为空串。additive 字段，客户端反射解码安全。
     */
    @type("string") matchId: string = "";
    /** key 为 sessionId */
    @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
