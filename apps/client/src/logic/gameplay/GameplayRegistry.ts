import type { GameplayPlugin, GameplayPluginFactory } from "./GameplayPlugin";
import type { GameplayRoomJoiner } from "./RoomController";
import { validateGameplayModeId } from "../../shared/index";

/** Optional transport capability owned by one registered gameplay module. */
export interface GameplayRegistrationOptions<TRoom = unknown> {
    readonly replace?: boolean;
    /**
     * Joiner used by `RoomController.startRegistered`. Keeping it beside the
     * factory prevents the composition root from maintaining a second id →
     * transport map when a new gameplay is added.
     */
    readonly joiner?: GameplayRoomJoiner<TRoom>;
}

interface GameplayRegistration<TRoom, TInput> {
    readonly factory: GameplayPluginFactory<TRoom, TInput>;
    readonly joiner?: GameplayRoomJoiner<TRoom>;
}

export interface ResolvedGameplay<TRoom, TInput> {
    readonly plugin: GameplayPlugin<TRoom, TInput>;
    readonly joiner?: GameplayRoomJoiner<TRoom>;
}

export interface StartableGameplay<TRoom, TInput> {
    readonly plugin: GameplayPlugin<TRoom, TInput>;
    readonly joiner: GameplayRoomJoiner<TRoom>;
}

/**
 * 玩法登记点。注册表只负责 id → factory，不知道 room、网络或引擎。
 * 新玩法可以在自己的模块中调用 register，无需修改 Main、RoomClient 或 loader。
 */
export class GameplayRegistry<TRoom = unknown, TInput = unknown> {
    private readonly registrations = new Map<string, GameplayRegistration<TRoom, TInput>>();

    register(
        id: string,
        factory: GameplayPluginFactory<TRoom, TInput>,
        options: GameplayRegistrationOptions<TRoom> = {},
    ): () => void {
        const key = normalizeId(id);
        if (typeof factory !== "function") {
            throw new TypeError("[GameplayRegistry] factory 必须是函数");
        }
        if (options.joiner !== undefined
            && (!options.joiner || typeof options.joiner.join !== "function")) {
            throw new TypeError("[GameplayRegistry] joiner.join 必须是函数");
        }
        if (this.registrations.has(key) && !options.replace) {
            throw new Error(`[GameplayRegistry] 玩法已登记：${key}`);
        }
        const registration: GameplayRegistration<TRoom, TInput> = {
            factory,
            ...(options.joiner ? { joiner: options.joiner } : {}),
        };
        this.registrations.set(key, registration);
        // 比较本次 registration 身份；即便 replace 复用了同一个 factory，旧
        // disposer 也不能删除后来登记的 joiner/factory 对。
        return () => {
            if (this.registrations.get(key) === registration) this.registrations.delete(key);
        };
    }

    has(id: string): boolean {
        return this.registrations.has(normalizeId(id));
    }

    list(): readonly string[] {
        return [...this.registrations.keys()].sort();
    }

    /** Return the module-owned joiner, if this registration supplies one. */
    getJoiner(id: string): GameplayRoomJoiner<TRoom> | undefined {
        return this.registrations.get(normalizeId(id))?.joiner;
    }

    create(id: string): GameplayPlugin<TRoom, TInput> {
        return this.resolve(id).plugin;
    }

    /** Require transport before invoking the factory, so a failed start leaks no plugin instance. */
    resolveForStart(id: string): StartableGameplay<TRoom, TInput> {
        const key = normalizeId(id);
        const registration = this.registrations.get(key);
        if (!registration) throw new Error(`[GameplayRegistry] 未登记玩法：${key}`);
        if (!registration.joiner) {
            throw new TypeError(`[GameplayRegistry] 登记玩法未提供 room joiner：${key}`);
        }
        return {
            plugin: createPlugin(key, registration.factory),
            joiner: registration.joiner,
        };
    }

    /** Snapshot factory and joiner from one registration before invoking user factory code. */
    resolve(id: string): ResolvedGameplay<TRoom, TInput> {
        const key = normalizeId(id);
        const registration = this.registrations.get(key);
        if (!registration) throw new Error(`[GameplayRegistry] 未登记玩法：${key}`);
        const plugin = createPlugin(key, registration.factory);
        return {
            plugin,
            ...(registration.joiner ? { joiner: registration.joiner } : {}),
        };
    }
}

function createPlugin<TRoom, TInput>(
    key: string,
    factory: GameplayPluginFactory<TRoom, TInput>,
): GameplayPlugin<TRoom, TInput> {
    const plugin = factory();
    if (!plugin || typeof plugin !== "object") {
        throw new TypeError(`[GameplayRegistry] 玩法 factory 未返回插件：${key}`);
    }
    if (plugin.id !== key) {
        throw new Error(`[GameplayRegistry] 插件 id 不匹配：登记 ${key}，实际 ${String(plugin.id)}`);
    }
    return plugin;
}

function normalizeId(id: string): string {
    try {
        return validateGameplayModeId(id, "gameplay.id");
    } catch {
        throw new TypeError("[GameplayRegistry] 玩法 id 必须是规范的 1..64 字符标识");
    }
}
