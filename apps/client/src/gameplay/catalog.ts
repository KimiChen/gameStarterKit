/**
 * gameplay catalog 稳定 façade（Non-intrusive §7.6 阶段 9 收敛后）。
 *
 * @deprecated 组合目录的真相已生成化：登记走 `catalog.generated.ts` 的
 * `registerGeneratedGameplays(registry, services)`（services 由 gameplay/services.ts
 * 组装）。本文件只保留零状态纯转发与类型 re-export，供既有导入面平滑过渡；
 * ⛔ 不得在此新增任何逐玩法字段（ballMoveJoiner/idleAdapter 之类）或状态——
 * 新增玩法 = 只新增 `gameplay/modes/<id>/` 模块文件 + 单源 schema/wire。
 */
import { registerGeneratedGameplays } from "./catalog.generated";
import type { AppGameplayRegistry, GameplayServicesContext } from "./services";

export type {
    AppGameplayRegistry,
    GameplayPresentationHost,
    GameplayServicesContext,
} from "./services";

/** @deprecated 请直接使用 registerGeneratedGameplays（generated 单源）。 */
export function registerDefaultGameplays(
    registry: AppGameplayRegistry,
    services: GameplayServicesContext,
): () => void {
    return registerGeneratedGameplays(registry, services);
}
