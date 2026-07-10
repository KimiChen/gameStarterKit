/**
 * 游戏 ECS 世界：根系统驱动 + 玩家实体管理。
 * 由 Main.ts 每帧调用 update(dt)；由网络层的状态回调调用 add/sync/remove。
 */
import { ecs } from "../lib/ecs/ECS";
import type { IPlayerState } from "../shared/index";
import { PlayerEntity, PlayerModelComp } from "./GameComps";
import { PlayerLerpSystem } from "./GameSystems";

export class GameECS {
    // 必须是单例：ecs 的组/系统注册是模块级全局状态，每次 new PlayerLerpSystem()
    // 都会创建新 matcher 并向 ECSModel 注册一个无法移除的 group 回调，重复初始化会累积泄漏
    private static _inst: GameECS | null = null;
    static get inst(): GameECS {
        if (!this._inst) this._inst = new GameECS();
        return this._inst;
    }

    readonly root = new ecs.RootSystem();
    private players = new Map<string, PlayerEntity>();
    private inited = false;

    init(): void {
        if (this.inited) return;
        this.inited = true;
        this.root.add(new PlayerLerpSystem());
        this.root.init();
    }

    update(dt: number): void {
        this.root.execute(dt);
    }

    /** 服务端 players.onAdd → 创建实体 */
    addPlayer(state: IPlayerState, isSelf: boolean): PlayerEntity {
        const e = ecs.getEntity<PlayerEntity>(PlayerEntity);
        const m = e.PlayerModel;
        m.id = state.id;
        m.name = state.name;
        m.hp = state.hp;
        m.maxHp = state.maxHp;
        m.alive = state.alive;
        m.isSelf = isSelf;
        m.x = m.targetX = state.x;
        m.y = m.targetY = state.y;
        this.players.set(state.id, e);
        return e;
    }

    /** 服务端字段变化 → 更新实体（坐标只改 target，渲染坐标由插值系统追赶） */
    syncPlayer(state: IPlayerState): void {
        const e = this.players.get(state.id);
        if (!e) return;
        const m = e.PlayerModel;
        m.name = state.name;
        m.hp = state.hp;
        m.maxHp = state.maxHp;
        m.alive = state.alive;
        m.targetX = state.x;
        m.targetY = state.y;
    }

    /** 服务端 players.onRemove → 销毁实体 */
    removePlayer(id: string): void {
        const e = this.players.get(id);
        if (!e) return;
        this.players.delete(id);
        e.destroy();
    }

    /** 遍历存活玩家（渲染用） */
    forEachPlayer(cb: (m: PlayerModelComp) => void): void {
        this.players.forEach((e) => cb(e.PlayerModel));
    }

    /** 本机玩家（输入指向计算用），未进房/未同步到时返回 null */
    getSelfPlayer(): PlayerModelComp | null {
        for (const e of this.players.values()) {
            if (e.PlayerModel.isSelf) return e.PlayerModel;
        }
        return null;
    }

    clear(): void {
        this.players.forEach((e) => e.destroy());
        this.players.clear();
    }
}
