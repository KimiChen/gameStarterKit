/**
 * WorldMode（MMO MF4，docs/MMO.md §4.5）：世界形态玩法的服务端契约与登记表。
 *
 * MF4-B2 先落**登记表**（生成的 `modes/catalog.generated.ts` 按 manifest `kind:"world"` 分出 `registerGeneratedWorldModes`，
 * ⛔ 不混进 GameRoom 的 gameModeRegistry）；十个钩子的契约本体与无头 WorldRuntime 随 MF4-B5 落地。⛔ 不继承 GameMode（D13）。
 */

/** 世界玩法的最小身份（B5 扩成完整 WorldMode 契约；registry 只按 id 登记 factory）。 */
export interface WorldModeLike {
    readonly id: string;
}

export type WorldModeFactory<TMode extends WorldModeLike = WorldModeLike> = () => TMode;

export class WorldModeRegistry<TMode extends WorldModeLike = WorldModeLike> {
    private readonly factories = new Map<string, WorldModeFactory<TMode>>();

    /** 同 id 二次登记即 throw（组合根的重复装配是配置错误，⛔ 不静默覆盖）；返回注销函数。 */
    register(id: string, factory: WorldModeFactory<TMode>): () => void {
        if (typeof id !== "string" || id.length === 0) throw new TypeError("[WorldModeRegistry] id 必须非空");
        if (typeof factory !== "function") throw new TypeError(`[WorldModeRegistry] ${id} 的 factory 必须是函数`);
        if (this.factories.has(id)) throw new Error(`[WorldModeRegistry] world mode 重复登记：${id}`);
        this.factories.set(id, factory);
        return () => {
            if (this.factories.get(id) === factory) this.factories.delete(id);
        };
    }

    has(id: string): boolean {
        return this.factories.has(id);
    }

    ids(): readonly string[] {
        return [...this.factories.keys()];
    }

    /** 建一个 mode 实例；factory 返回的 id 必须与登记 id 一致（fail-closed）。 */
    create(id: string): TMode {
        const factory = this.factories.get(id);
        if (!factory) throw new Error(`[WorldModeRegistry] 未登记的 world mode：${id}`);
        const mode = factory();
        if (!mode || typeof mode !== "object" || mode.id !== id) {
            throw new TypeError(`[WorldModeRegistry] ${id} 的 factory 返回了 id 不一致的 mode`);
        }
        return mode;
    }
}

/** 生产 world mode 登记表（WorldRoom 的组合根；MF4-B6 的 WorldRoom 从这里 create）。 */
export const worldModeRegistry = new WorldModeRegistry();
