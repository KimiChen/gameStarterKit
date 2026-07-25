/**
 * 集成测试公共件：真实 Redis（⛔ 不 mock，10·M2 DoD），先 `npm run stack`（apps/server）起本地栈。
 * uid 带运行期前缀隔离，跑完 UNLINK 清理（09·R6）。
 */
import { issueToken } from "@game/webplatform/lib";
import { writeGroupSess } from "../../src/core/auth/session";
import { kApplied, kBagAll, kFence, kLock, kUser } from "../../src/core/infra/keys";
import { clientFor } from "../../src/core/infra/redisRoute";

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

/**
 * 造合成会话（**测试专用**）：lib 签发 token 写 MySQL 权威 + 写组 sess 缓存。
 * ⚠ 生产登录不走这里——登录编排在 WebPlatform lib，组侧只 `writeGroupSess`（见 platform/inProcessLogin）。
 * ⚠ 直调 lib 仅测试可以（测试恒 in-process、与游戏服共库）；生产代码一律走 `account.*` 接缝。
 */
export async function issueSession(uid: string, sessionKey: string | null = null, gwNode = ""):
  Promise<{ userId: string; token: string }> {
  const token = await issueToken(uid, sessionKey);
  await writeGroupSess(uid, token, gwNode);
  return { userId: uid, token };
}
