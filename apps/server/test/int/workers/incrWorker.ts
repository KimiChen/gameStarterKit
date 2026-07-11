/**
 * 跨实例串行测试的子进程 worker：对同一 uid 做 N 次 read-modify-write 自增。
 * 用法: node --import tsx incrWorker.ts <uid> <count>
 * BUSY 按客户端契约处理：同一操作退避重试（07 错误码表）。
 */
import { BusyError } from "../../../src/core/errors";
import { withUser } from "../../../src/core/uow";
import { closeRedis } from "../../../src/infra/redisRoute";

const [uid, countStr] = process.argv.slice(2);
const count = Number(countStr);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function incrOnce(): Promise<void> {
  for (;;) {
    try {
      await withUser(uid, async (uow) => {
        const { n } = await uow.loadFields(["n"]);
        uow.set("n", String(Number(n ?? "0") + 1));
      });
      return;
    } catch (e) {
      if (e instanceof BusyError) { await sleep(20 + Math.random() * 30); continue; }
      throw e;
    }
  }
}

for (let i = 0; i < count; i++) { await incrOnce(); }
await closeRedis();
process.exit(0);
