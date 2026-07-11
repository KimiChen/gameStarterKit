/**
 * 崩溃窗口测试 worker（10·M6 DoD）：
 *   p1 = 阶段 1（MySQL 事务）提交后 SIGKILL —— 钱已扣、intent durable、道具没发
 *   p2 = 阶段 2（redisApply）后、阶段 3（markOutboxDone）前 SIGKILL —— 道具已发、仍 pending
 * 用法: node --import tsx purchaseKill.ts <uid> <sku> <clientReqId> <p1|p2>
 */
import { acquireLease } from "../../../src/core/locks";
import { getShopSku } from "../../../src/economy/catalog";
import { deriveOpId, purchaseTx, redisApply } from "../../../src/economy/outbox";

const [uid, skuId, clientReqId, phase] = process.argv.slice(2);
const sku = getShopSku(skuId);
if (!sku) { console.error(`未知 sku: ${skuId}`); process.exit(2); }

const opId = deriveOpId(uid, "shop.purchase", clientReqId);
const lease = await acquireLease(uid);

const outcome = await purchaseTx(uid, lease.fence, sku, opId);
if (outcome !== "OK") { console.error(`phase1 非 OK: ${outcome}`); process.exit(2); }
if (phase === "p1") {
  console.log("PHASE1_DONE");
  process.kill(process.pid, "SIGKILL"); // 阶段 1 与 2 之间猝死
}

const r = await redisApply(uid, opId, sku.grants);
if (r !== "ok") { console.error(`phase2 非 ok: ${r}`); process.exit(2); }
console.log("PHASE2_DONE");
process.kill(process.pid, "SIGKILL");   // 阶段 2 与 3 之间猝死（outbox 仍 pending）
