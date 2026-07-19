/**
 * 示例 ECS 系统 —— bitECS 的系统是普通函数：query 出实体集，直读写 store。
 */
import { query, type World } from "../../../lib/bitecs/index";
import { lerp } from "../../../shared/index";
import { PlayerModel } from "./GameComps";

/**
 * 渲染坐标插值系统：把玩家的渲染坐标 (x, y) 平滑逼近服务端坐标 (targetX, targetY)，
 * 消除 20fps 状态快照带来的瞬移感。插值函数 lerp 来自双端共享的纯逻辑库。
 */
export function playerLerpSystem(world: World, dt: number): void {
    const k = Math.min(1, dt * 12);
    for (const eid of query(world, [PlayerModel])) {
        PlayerModel.x[eid] = lerp(PlayerModel.x[eid], PlayerModel.targetX[eid], k);
        PlayerModel.y[eid] = lerp(PlayerModel.y[eid], PlayerModel.targetY[eid], k);
    }
}
