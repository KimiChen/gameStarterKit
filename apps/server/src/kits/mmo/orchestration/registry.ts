/**
 * mmo kit 内部模块：编排模块注册表（docs/MMO.md §8.6 ③；MK4-B1）。按 packId 找模块；MK4-B2 起从 `../contributions.generated` 的贡献点
 * `orchestration` 收录（每 pack 恰一个模块，v1 ⛔ 多包叠加），启动期逐个 `defineOrchestration` 形状断言 + packId 对应已收录内容包，失败进程拒启。
 * MK4-B1：只有注入口（mode 选项 / 单测）；无贡献 ⇒ 该 pack 无编排（世界照常跑）。⛔ 插件不得 import 本文件。
 */
import { defineOrchestration, type OrchestrationModule } from "@game/shared/kits/mmo/api/orchestration/index";

const registered = new Map<string, OrchestrationModule>();

/** 登记一个模块（形状断言；同 packId 重复登记 ⇒ 抛）。 */
export function registerOrchestration(module: OrchestrationModule): () => void {
    const checked = defineOrchestration(module);
    if (registered.has(checked.packId)) throw new Error(`[mmo orchestration] pack "${checked.packId}" 已有编排模块（v1 一包一模块）`);
    registered.set(checked.packId, checked);
    return () => { if (registered.get(checked.packId) === checked) registered.delete(checked.packId); };
}

export function orchestrationFor(packId: string): OrchestrationModule | null {
    return registered.get(packId) ?? null;
}

export function registeredOrchestrations(): readonly OrchestrationModule[] {
    return [...registered.values()];
}
