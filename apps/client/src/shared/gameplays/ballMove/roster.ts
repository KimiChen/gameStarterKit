/**
 * ballMove 演示的开局人数（单一真源）。
 *
 * ⚠ 服务端 roster（`min` / `autoStart`）与客户端「等待另一名玩家（n/N）」提示都读它：
 * 这个数一旦两边不一致，玩家就会看到「已经够人了却不开局」或反过来。
 * ⛔ 别再在任何一侧写字面量 2（铁律 6：常量从 shared 导入）。
 */
export const BALL_MOVE_MIN_PLAYERS = 2;
