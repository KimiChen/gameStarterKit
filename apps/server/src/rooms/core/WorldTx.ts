/**
 * WorldTx（MMO MF7b-B2，docs/MMO.md §5.4 MF7b / §4.6 不变量 1）：世界形态的权威守卫受限事务——房间层的稳定入口。
 * 实现住在 kit-api 门面（`core/infra/kitApi.ts` 第 7 条 `withKitWorldTx`：与 withKitTx / withKitWorkerTx 同一套受限句柄构造、
 * 同一条 `withRcTx`），本文件只做房间层的再导出与类型汇总，⛔ 不复制 SQL：
 *  - 首句 `UPDATE world_instance SET write_seq = write_seq + 1 WHERE server_id = ? AND instance_id = ? AND authority_epoch = ?`，
 *    Rows matched 0 ⇒ `AuthorityLostError` 自动 ROLLBACK（旧 owner 的迟到写被存储边界拒；⛔ 不碰 checkpoint_rev，M18）；
 *  - 再逐 persona `assertControl`（升序锁序）；句柄 = KitTx 门面（表闸 / debit / credit / enqueueEffect / persona 门面）+ `writeSeq`
 *    + `appendWorldEvent(table, event)`（只许本 kit 的 role:"world-event" 表，框架固定列）。
 * 检查点 / 事件批的编排（同一世界事务里分线快照 + persona 快照 + 事件行 + `world_instance.checkpoint_rev` 推进）见 MF7b-B4
 * `WorldCheckpoint.ts`。⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
export {
    AuthorityLostError,
    assertWorldEventTable,
    withKitWorldTx as withWorldTx,
    worldEventTablesOfKit,
} from "../../core/infra/kitApi";
export type {
    KitWorldEventInput as WorldEventInput,
    KitWorldTx as WorldTx,
    KitWorldTxDeps as WorldTxDeps,
    KitWorldTxScope as WorldTxScope,
} from "../../core/infra/kitApi";
