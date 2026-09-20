/**
 * mmo kit · `movement` api 面（服务端，docs/MMO.md §7.2；MK1-B1）：权威积分器 = shared 面的 `resolveMove`（mode 每固定步调，碰撞候选来自
 * 内容包 collision 网格）+ `teleportWithin`（内部 / 编排命令：钳图 + 拒落在阻挡格）。插件只能 import 本门面；本面任何导出变化都要 bump `api.movement.version`。
 */
import { applyIntent, clampToMap, parseCollisionGrid, resolveMove, type CollisionGrid, type IMapSize, type IVec2, type MoveResult, type MoveState } from "@game/shared/kits/mmo/api/movement/index";

export { applyIntent, parseCollisionGrid, resolveMove };
export type { CollisionGrid, IMapSize, IVec2, MoveResult, MoveState };

/** 瞬移到图内某点：钳图；落在阻挡格 ⇒ null（调用方决定回退到出生点 / 拒绝）。 */
export function teleportWithin(pos: IVec2, size: IMapSize, grid: CollisionGrid | null): IVec2 | null {
    const clamped = clampToMap(pos, size);
    return grid && grid.blocked(clamped.x, clamped.y) ? null : clamped;
}
