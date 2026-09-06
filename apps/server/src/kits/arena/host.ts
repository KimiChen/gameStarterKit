/**
 * arena kit 内部模块：本 kit 的宿主接线——RPC 端点要的 `currentZoneId` 与只读奖杯数，全部经 kit-api 门面
 * （`../../core/infra/kitApi`）取得，⛔ 本 kit 的服务端代码不 import core/infra 其他模块、不 import ioredis / mysql2
 * （apps/server/test/kit-import-boundary.test.ts 按 import 说明符钉住；K1 再换成路径级机检）。
 * 奖杯读侧走 `readKitUserField`（HGET `kKitUser("arena","stats",uid)` 的 `trophies` 字段）；写侧只有 outbox effect
 * `kit:arena:trophy`（docs/KIT.md §5 写侧契约），⛔ 本 kit 从不 HSET 它。
 * ⛔ 插件不得 import 本文件。
 */
import { currentZoneId, readKitUserField } from "../../core/infra/kitApi";

export const ARENA_KIT_ID = "arena";
/** kit.json `userKeys` 里登记的 per-user 键名与 `effects.trophy.field`（同一真源：apps/kits/arena/kit.json）。 */
export const ARENA_STATS_KEY = "stats";
export const ARENA_TROPHIES_FIELD = "trophies";

export { currentZoneId };

/** 本人奖杯数（缺席 = 0；形状异常按 0 处理并交给上层告警，⛔ 不抛：只读路径不该让整张棋盘读失败）。 */
export async function readArenaTrophies(uid: string, read: typeof readKitUserField = readKitUserField): Promise<number> {
  const raw = await read(ARENA_KIT_ID, ARENA_STATS_KEY, uid, ARENA_TROPHIES_FIELD, { zone: "per-zone" });
  if (raw === null) return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
