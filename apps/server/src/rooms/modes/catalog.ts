/**
 * 服务端玩法登记的稳定 façade（Non-intrusive §5.4/§8.2「改为 generated catalog 的稳定 façade」）。
 *
 * 登记全集来自 `catalog.generated.ts`：`codegen:gameplays` 按 manifest.wireExposed 发现
 * `modes/<id>/index.ts` 的 `register<Constant>GameMode` 并静态 import 聚合——新增玩法只新增
 * `modes/<id>/index.ts` 并重跑 codegen，⛔ 本文件不再逐玩法手写 import（受保护路径，
 * scripts/protected-paths.json gameplayFlow）。fixture 玩法（wireExposed:false）不进生产 registry。
 */
export {
    GENERATED_GAME_MODE_IDS,
    registerGeneratedGameModes as registerDefaultGameModes,
} from "./catalog.generated";
