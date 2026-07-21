/**
 * 示例 ECS 组件 —— bitECS 的组件就是 SoA store：每字段一条按 eid 索引的数组，
 * 数据直写直读（`PlayerModel.hp[eid]`），无 class/装饰器/注册调用。
 */

/** 玩家数据组件：镜像服务端同步状态 + 本地渲染插值坐标
 *  ⚠ removeEntity 回收 eid 后 SoA 数组保留旧值——新增字段必须同步在 GameECS.addPlayer
 *  全量赋值，否则复用 eid 读到前任残值（ballMoveEcs.test.ts 的「eid 复用防残值」用例把关）。 */
export const PlayerModel = {
    /** Colyseus sessionId */
    id: [] as string[],
    name: [] as string[],
    hp: [] as number[],
    maxHp: [] as number[],
    alive: [] as boolean[],
    /** 是否本机玩家 */
    isSelf: [] as boolean[],

    /** 渲染坐标（每帧向服务端坐标插值，见 playerLerpSystem） */
    x: [] as number[],
    y: [] as number[],
    /** 服务端最新坐标 */
    targetX: [] as number[],
    targetY: [] as number[],
};
