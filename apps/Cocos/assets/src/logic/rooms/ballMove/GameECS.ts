/**
 * 游戏 ECS 世界：bitECS world + 玩家实体管理。
 * 由 BallMoveGameplay 驱动 update(dt) 与网络状态同步；渲染端只读组件数据。
 */
import { createWorld, addEntity, addComponent, removeEntity, type World } from "../../../lib/bitecs/index";
import type { IPlayerState } from "../../../shared/index";
import { PlayerModel } from "./GameComps";
import { playerLerpSystem } from "./GameSystems";

export class GameECS {
    // 单例：world 与 sessionId→eid 表挂在模块级单例上——场景重载若新建实例，
    // 单例跨场景复用；旧房间回调由 BallMoveRoom + GameplayContext identity guard 拒绝。
    private static _inst: GameECS | null = null;
    static get inst(): GameECS {
        if (!this._inst) this._inst = new GameECS();
        return this._inst;
    }

    private world: World = createWorld();
    private players = new Map<string, number>();

    update(dt: number): void {
        playerLerpSystem(this.world, dt);
    }

    /** 服务端 players.onAdd → 创建实体 */
    addPlayer(state: IPlayerState, isSelf: boolean): number {
        // Colyseus can replay an onAdd during a reconnect/bootstrap race.  The
        // collection key is the session id, so adding it twice must update the
        // existing entity instead of leaking a second bitECS entity that the
        // Map can no longer reach (and that clear() cannot remove).
        const existing = this.players.get(state.id);
        if (existing !== undefined) {
            this.syncPlayer(state);
            PlayerModel.isSelf[existing] = isSelf;
            return existing;
        }
        const eid = addEntity(this.world);
        addComponent(this.world, eid, PlayerModel);
        PlayerModel.id[eid] = state.id;
        PlayerModel.name[eid] = state.name;
        PlayerModel.hp[eid] = state.hp;
        PlayerModel.maxHp[eid] = state.maxHp;
        PlayerModel.alive[eid] = state.alive;
        PlayerModel.isSelf[eid] = isSelf;
        PlayerModel.x[eid] = PlayerModel.targetX[eid] = state.x;
        PlayerModel.y[eid] = PlayerModel.targetY[eid] = state.y;
        this.players.set(state.id, eid);
        return eid;
    }

    /** 服务端字段变化 → 更新实体（坐标只改 target，渲染坐标由插值系统追赶） */
    syncPlayer(state: IPlayerState): void {
        const eid = this.players.get(state.id);
        if (eid === undefined) return;
        PlayerModel.name[eid] = state.name;
        PlayerModel.hp[eid] = state.hp;
        PlayerModel.maxHp[eid] = state.maxHp;
        PlayerModel.alive[eid] = state.alive;
        PlayerModel.targetX[eid] = state.x;
        PlayerModel.targetY[eid] = state.y;
    }

    /** 服务端 players.onRemove → 销毁实体 */
    removePlayer(id: string): void {
        const eid = this.players.get(id);
        if (eid === undefined) return;
        this.players.delete(id);
        removeEntity(this.world, eid);
    }

    /** 遍历玩家实体（渲染用；cb 收 eid，字段从 PlayerModel store 按 eid 取） */
    forEachPlayer(cb: (eid: number) => void): void {
        this.players.forEach((eid) => cb(eid));
    }

    /** 本机玩家 eid（输入指向计算用），未进房/未同步到时返回 null */
    getSelfPlayer(): number | null {
        for (const eid of this.players.values()) {
            if (PlayerModel.isSelf[eid]) return eid;
        }
        return null;
    }

    clear(): void {
        this.players.forEach((eid) => removeEntity(this.world, eid));
        this.players.clear();
    }
}
