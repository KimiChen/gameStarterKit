/**
 * 集成测试公共件：真实 Redis（⛔ 不 mock，10·M2 DoD），先 `npm run stack`（apps/server）起本地栈。
 * uid 带运行期前缀隔离，跑完 UNLINK 清理（09·R6）。
 */
import { kApplied, kBagAll, kFence, kLock, kUser } from "../../src/infra/keys";
import { clientFor } from "../../src/infra/redisRoute";

const runId = `t${Date.now().toString(36)}_${process.pid}`;
export const testUid = (name: string): string => `${runId}_${name}`;

export async function assertRedisUp(): Promise<void> {
  const ping = clientFor("probe").ping();
  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error("Redis 连不上——先跑 npm --workspace @game/server run stack")), 3000));
  await Promise.race([ping, timeout]);
}

export async function cleanupUser(uid: string): Promise<void> {
  await clientFor(uid).unlink(kUser(uid), kFence(uid), kApplied(uid), kLock(uid), ...kBagAll(uid));
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
