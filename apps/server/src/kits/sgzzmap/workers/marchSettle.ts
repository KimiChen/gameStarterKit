/**
 * sgzzmap kit · marchSettle worker（kit.json workers[].entry）：
 * `KIT_WORKER_ZONES=<区> npm --workspace @game/server run worker -- sgzzmap:marchSettle`
 *
 * 一轮 = 一批到期行军的落地（按全区总序 (arrive_at, march_id)）。
 *
 * ⚠ 为什么必须有 worker 而不能只靠懒结算：行军到达会改**别人**的地块。
 * 懒结算要求「有人来读地图」，攻击方下线后防守方的地块状态会无限期停在过去。
 * 懒结算仍然保留做兜底（view 每次推进一批），worker 挂了地图也不会腐坏。
 *
 * ⚠ 框架已经把 pass 包在 withKitWorkerTx 里了：这里 ⛔ 不能再开 withKitTx
 * （实测会被「kit worker 事务内 ⛔ 另开 withKitTx」直接拒、整轮回滚）。
 * 所以把 worker 自己的 tx 递给 settleOnTx，⛔ 不走自开事务的 settleDueMarches。
 */
import { defineKitWorker, type KitTx } from "../../../core/infra/kitApi";
import { settleOnTx } from "../api/march/index";

export default defineKitWorker({
    idleMs: 1000,
    pass: async (tx, ctx) => {
        const { more } = await settleOnTx(tx as unknown as KitTx, ctx.sId);
        return { more };
    },
});
