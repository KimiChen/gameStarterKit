import type { GameplayPlugin, GameplayPluginFactory } from "./GameplayPlugin";

/**
 * 玩法登记点。注册表只负责 id → factory，不知道 room、网络或引擎。
 * 新玩法可以在自己的模块中调用 register，无需修改 Main、RoomClient 或 loader。
 */
export class GameplayRegistry<TRoom = unknown, TInput = unknown> {
    private readonly factories = new Map<string, GameplayPluginFactory<TRoom, TInput>>();

    register(
        id: string,
        factory: GameplayPluginFactory<TRoom, TInput>,
        options: { readonly replace?: boolean } = {},
    ): () => void {
        const key = normalizeId(id);
        if (typeof factory !== "function") {
            throw new TypeError("[GameplayRegistry] factory 必须是函数");
        }
        if (this.factories.has(key) && !options.replace) {
            throw new Error(`[GameplayRegistry] 玩法已登记：${key}`);
        }
        this.factories.set(key, factory);
        // 解绑只删除自己登记的 factory，避免旧模块清掉后来替换的实现。
        return () => {
            if (this.factories.get(key) === factory) this.factories.delete(key);
        };
    }

    has(id: string): boolean {
        return this.factories.has(normalizeId(id));
    }

    list(): readonly string[] {
        return [...this.factories.keys()].sort();
    }

    create(id: string): GameplayPlugin<TRoom, TInput> {
        const key = normalizeId(id);
        const factory = this.factories.get(key);
        if (!factory) throw new Error(`[GameplayRegistry] 未登记玩法：${key}`);
        const plugin = factory();
        if (!plugin || typeof plugin !== "object") {
            throw new TypeError(`[GameplayRegistry] 玩法 factory 未返回插件：${key}`);
        }
        if (plugin.id !== key) {
            throw new Error(`[GameplayRegistry] 插件 id 不匹配：登记 ${key}，实际 ${String(plugin.id)}`);
        }
        return plugin;
    }
}

function normalizeId(id: string): string {
    if (typeof id !== "string" || id.trim().length === 0) {
        throw new TypeError("[GameplayRegistry] 玩法 id 不能为空");
    }
    return id.trim();
}
