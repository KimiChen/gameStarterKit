/**
 * mmo kit · `world` api 面（服务端，docs/MMO.md §7.2）：分线元数据只读（`readInstanceMeta`）。⛔ 不暴露 spawn / despawn / schedule
 * （编排面 MK4）。分线清单 `listInstances` 依赖框架 world_instance（kit 表闸外），随 kit-api 再导出后补（MK1）。
 * 插件只能 import 本门面；本面任何导出变化都要 bump `api.world.version`。
 */
import { defaultMmoTxRunner, type MmoTxRunner } from "../../host";
import { selectInstanceMeta } from "../../persistence/instances";
import { MMO_WORLD_MODE_ID } from "../../host";
import type { IInstanceMeta } from "@game/shared/kits/mmo/api/world/index";

export { MMO_WORLD_MODE_ID };
export type { IInstanceMeta };

/** 分线的 kit 语义元数据（pack / script rev）；框架侧不存在或本 kit 未登记 = null。 */
export function readInstanceMeta(sId: number, instanceId: string, line: number, run: MmoTxRunner = defaultMmoTxRunner): Promise<IInstanceMeta | null> {
    return run(sId, (tx) => selectInstanceMeta(tx, instanceId, line));
}
