/**
 * 示例 ECS 系统。
 */
import { ecs } from "../lib/ecs/ECS";
import { lerp } from "../shared/index";
import { PlayerModelComp } from "./GameComps";

/**
 * 渲染坐标插值系统：把玩家的渲染坐标 (x, y) 平滑逼近服务端坐标 (targetX, targetY)，
 * 消除 20fps 状态快照带来的瞬移感。插值函数 lerp 来自双端共享的纯逻辑库。
 */
export class PlayerLerpSystem extends ecs.ComblockSystem implements ecs.ISystemUpdate {
    filter(): ecs.IMatcher {
        return ecs.allOf(PlayerModelComp);
    }

    update(e: ecs.Entity): void {
        const m = e.get(PlayerModelComp);
        const k = Math.min(1, this.dt * 12);
        m.x = lerp(m.x, m.targetX, k);
        m.y = lerp(m.y, m.targetY, k);
    }
}
