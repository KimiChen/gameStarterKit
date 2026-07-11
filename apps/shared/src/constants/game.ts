/**
 * 游戏常量 —— 双端共享。
 */

/** 服务端逻辑帧率（次/秒） */
export const TICK_RATE = 20;

/** 单个逻辑帧时长（ms） */
export const TICK_MS = 1000 / TICK_RATE;

/** 房间最大人数 */
export const MAX_PLAYERS = 4;

/** 玩家基础移动速度（逻辑单位/秒） */
export const PLAYER_MOVE_SPEED = 200;

/** 玩家初始生命值 */
export const PLAYER_INIT_HP = 100;

/** 逻辑地图尺寸（逻辑单位）；当前取值让战场完整落在 750x1624 竖屏设计分辨率内 */
export const MAP_WIDTH = 700;
export const MAP_HEIGHT = 1500;

/** 体力上限（服务端框架建号初始体力 = 满；user:{uid} 的 stamina 字段） */
export const STAMINA_MAX = 30;

/** 房间阶段 */
export const GamePhase = {
    /** 等待玩家 */
    Waiting: "waiting",
    /** 对局进行中 */
    Playing: "playing",
    /** 结算 */
    Settle: "settle",
} as const;

export type GamePhaseType = (typeof GamePhase)[keyof typeof GamePhase];
