/**
 * 示例 ECS 组件与实体 —— 演示 Oops ECS 库的标准用法。
 */
import { ecs } from "../../../lib/ecs/ECS";
import { PLAYER_INIT_HP } from "../../../shared/index";

/** 玩家数据组件：镜像服务端同步状态 + 本地渲染插值坐标 */
@ecs.register("PlayerModel")
export class PlayerModelComp extends ecs.Comp {
    /** Colyseus sessionId */
    id = "";
    name = "";
    hp = PLAYER_INIT_HP;
    maxHp = PLAYER_INIT_HP;
    alive = true;
    /** 是否本机玩家 */
    isSelf = false;

    /** 渲染坐标（每帧向服务端坐标插值，见 PlayerLerpSystem） */
    x = 0;
    y = 0;
    /** 服务端最新坐标 */
    targetX = 0;
    targetY = 0;

    reset(): void {
        this.id = "";
        this.name = "";
        this.hp = PLAYER_INIT_HP;
        this.maxHp = PLAYER_INIT_HP;
        this.alive = true;
        this.isSelf = false;
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
    }
}

/** 玩家实体 */
@ecs.register("Player")
export class PlayerEntity extends ecs.Entity {
    // 与 @ecs.register("PlayerModel") 的注册名同名，addComponents 后自动赋值
    PlayerModel!: PlayerModelComp;

    protected init(): void {
        this.addComponents<ecs.Comp>(PlayerModelComp);
    }
}
