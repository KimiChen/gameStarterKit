import type { Node } from "cc";
import type { MmoWorldEntityView, MmoWorldInput, MmoWorldViewModel } from "../../../../logic/rooms/mmoWorld/MmoWorldGameplay";
import type { IMmoScriptStateSource } from "../orchestration/index";

export type { MmoWorldEntityView, MmoWorldInput, MmoWorldViewModel };

export interface IMmoHudContext extends IMmoScriptStateSource {
    /** 独立 HUD 层。工厂只往这个节点挂载；世界实体与触摸由 kit 保持。 */
    readonly host: Node;
    readonly packId: string;
    readonly mapId: string;
    readonly width: number;
    readonly height: number;
    readonly dispatchInput: (input: MmoWorldInput) => void;
}

export interface IMmoHud {
    mount(): void;
    render(model: MmoWorldViewModel): void;
    unmount(): void;
}

export interface IMmoHudModule { create(context: IMmoHudContext): IMmoHud }

/** 模块入口保持纯 TS，load 内字面量动态 import 真正 View；不会把 cc / FGUI 拉进静态依赖图。 */
export interface IMmoHudContribution {
    readonly packId: string;
    load(): Promise<IMmoHudModule>;
}

/** 结构与唯一性校验，不允许插件覆盖别的内容包 HUD。 */
export function resolveHudContribution(packId: string, entries: readonly { readonly pluginId: string; readonly value: unknown }[], owners: ReadonlyMap<string, string>): IMmoHudContribution | null {
    const modules = new Map<string, IMmoHudContribution>();
    for (const entry of entries) {
        const value = entry.value as Partial<IMmoHudContribution> | null;
        if (!value || typeof value.packId !== "string" || typeof value.load !== "function") throw new TypeError(`[mmo content] 插件 ${entry.pluginId} 的 hud 贡献非法`);
        if (owners.get(value.packId) !== entry.pluginId) throw new TypeError(`[mmo content] 插件 ${entry.pluginId} 的 hud 必须属于其自有内容包 ${value.packId}`);
        if (modules.has(value.packId)) throw new TypeError(`[mmo content] 内容包 ${value.packId} 存在重复 hud 贡献`);
        modules.set(value.packId, value as IMmoHudContribution);
    }
    return modules.get(packId) ?? null;
}
