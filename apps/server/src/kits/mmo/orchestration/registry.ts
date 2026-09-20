/**
 * mmo kit 内部模块：编排模块注册表（docs/MMO.md §8.6 ③；MK4-B1 / B2）。按 packId 找模块；贡献点 `orchestration`（`../contributions.generated`，
 * 插件 module 贡献、按插件 id 排序）在首次访问时逐个 `defineOrchestration` 形状断言并登记（每 pack 恰一个模块，v1 ⛔ 多包叠加）；
 * `assertOrchestrationsResolvable(packIds)` 由登记 world mode 的组合根调：模块的 packId 必须对应已收录内容包，失败进程拒启。
 * 无贡献 ⇒ 该 pack 无编排（世界照常跑）。⛔ 插件不得 import 本文件。
 */
import { defineOrchestration, type OrchestrationModule } from "@game/shared/kits/mmo/api/orchestration/index";
import { KIT_CONTRIBUTIONS } from "../contributions.generated";

const registered = new Map<string, OrchestrationModule>();
let contributedLoaded = false;

/** 贡献点 `orchestration` 的填充（module 贡献的导出值）。 */
export function contributedOrchestrations(): readonly { readonly pluginId: string; readonly value: unknown }[] {
    return (KIT_CONTRIBUTIONS as { readonly orchestration: readonly { readonly pluginId: string; readonly value: unknown }[] }).orchestration;
}

function loadContributed(): void {
    if (contributedLoaded) return;
    contributedLoaded = true;
    for (const entry of contributedOrchestrations()) {
        try { registerOrchestration(entry.value as OrchestrationModule); } catch (error) { contributedLoaded = false; throw new Error(`[mmo orchestration] 插件 ${entry.pluginId} 的编排模块不合法：${error instanceof Error ? error.message : String(error)}`); }
    }
}

/** 登记一个模块（形状断言；同 packId 重复登记 ⇒ 抛）。 */
export function registerOrchestration(module: OrchestrationModule): () => void {
    const checked = defineOrchestration(module);
    if (registered.has(checked.packId)) throw new Error(`[mmo orchestration] pack "${checked.packId}" 已有编排模块（v1 一包一模块）`);
    registered.set(checked.packId, checked);
    return () => { if (registered.get(checked.packId) === checked) registered.delete(checked.packId); };
}

export function orchestrationFor(packId: string): OrchestrationModule | null {
    loadContributed();
    return registered.get(packId) ?? null;
}

export function registeredOrchestrations(): readonly OrchestrationModule[] {
    loadContributed();
    return [...registered.values()];
}

/** 启动期交叉核对：每个已登记模块的 packId 必须是已收录内容包；否则抛（组合根拒启）。 */
export function assertOrchestrationsResolvable(packIds: Iterable<string>): void {
    const known = new Set(packIds);
    for (const module of registeredOrchestrations()) {
        if (!known.has(module.packId)) throw new Error(`[mmo orchestration] 模块 packId "${module.packId}" 不对应任何已收录内容包（${[...known].join(", ") || "无"}）`);
    }
}
