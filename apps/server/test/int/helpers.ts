/**
 * 集成测试公共件：真实 Redis（⛔ 不 mock，10·M2 DoD），先 `npm run stack`（apps/server）起本地栈。
 * uid 带运行期前缀隔离，跑完 UNLINK 清理（09·R6）。
 */
import { writeGroupSess } from "../../src/core/auth/session";
import { writeDevTokenIndex } from "../../src/platform/devAuthProvider";
import { kApplied, kAppliedPayload, kArchiveProof, kBagAll, kFence, kLock, kUser } from "../../src/core/infra/keys";
import { clientFor } from "../../src/core/infra/redisRoute";
import { kitUserKeyEntries } from "../../src/core/archive/archiveScripts";
import { SERVER_KIT_CATALOG } from "../../src/kits/catalog.generated";
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";
import { AuthRequiredError } from "../../src/core/errors";
import {
  installWebPlatformClientForTests,
  type WebPlatformClient,
} from "../../src/platform/webPlatformClient";

const runId = `t${Date.now().toString(36)}_${process.pid}`;
export const testUid = (name: string): string => `${runId}_${name}`;

interface FakeSession {
  userId: string;
  serverId: number;
  issuedAtMs: number;
}

const fakeSessions = new Map<string, FakeSession>();
const latestToken = new Map<string, string>();
const fakeCharacters = new Map<string, Set<number>>();
const userServerKey = (userId: string, serverId: number): string =>
  JSON.stringify([userId, serverId]);

/**
 * 集成测试的内存 WebPlatform 权威替身。它只通过明确 test delegate 接缝安装，不进入生产默认路径：
 * - token 按 `(userId,serverId)` 保持最后签发者胜；
 * - character register/has 对应独立 WebPlatform 的幂等 PUT/GET 语义。
 */
export const fakeWebPlatformClient: WebPlatformClient = {
  async verify(accessToken, serverId) {
    const session = fakeSessions.get(accessToken);
    if (!session
      || session.serverId !== serverId
      || latestToken.get(userServerKey(session.userId, serverId)) !== accessToken) {
      throw new AuthRequiredError("fake WebPlatform token 无效");
    }
    return { userId: session.userId, issuedAtMs: session.issuedAtMs };
  },
  async registerCharacter(userId, serverId) {
    let zones = fakeCharacters.get(userId);
    if (!zones) {
      zones = new Set<number>();
      fakeCharacters.set(userId, zones);
    }
    zones.add(serverId);
  },
  async hasCharacter(userId, serverId) {
    return fakeCharacters.get(userId)?.has(serverId) ?? false;
  },
};

/** 本 helper 所在测试进程的 facade 安装；进程级隔离结束即销毁，显式句柄供专测恢复语义。 */
export const restoreFakeWebPlatformClient =
  installWebPlatformClientForTests(fakeWebPlatformClient);

export async function assertRedisUp(): Promise<void> {
  const ping = clientFor("probe").ping();
  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error("Redis 连不上——先跑 npm --workspace @game/server run stack")), 3000));
  await Promise.race([ping, timeout]);
}

/** 清理 per-user 全部框架键 + 目录声明的 kit per-user 键（测试注入 fixture 目录时传 `catalog`）。 */
export async function cleanupUser(
  uid: string,
  catalog: readonly ServerKitCatalogEntry[] = SERVER_KIT_CATALOG,
): Promise<void> {
  await clientFor(uid).unlink(
    kUser(uid), kFence(uid), kArchiveProof(uid), kApplied(uid), kAppliedPayload(uid), kLock(uid), ...kBagAll(uid),
    ...kitUserKeyEntries(uid, catalog).map((entry) => entry.key),
  );
  fakeCharacters.delete(uid);
  for (const [token, session] of fakeSessions) {
    if (session.userId === uid) { fakeSessions.delete(token); }
  }
  for (const key of latestToken.keys()) {
    const parsed = JSON.parse(key) as [string, number];
    if (parsed[0] === uid) { latestToken.delete(key); }
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let lastIssuedAtMs = 0;

/**
 * 造完整测试会话：同一不透明 token 同步写入内存 WebPlatform fake、游戏组 sess cache
 * 与 dev provider 的 token 索引，因而既能通过 LobbyRoom/GameRoom strict onAuth
 * （fake delegate 或 AUTH_PROVIDER=dev 两条路径任选），也能覆盖每消息本地快路径。
 */
export async function issueSession(
  uid: string, _sessionKey: string | null = null, gwNode = "", sId = 0,
): Promise<{ userId: string; token: string }> {
  lastIssuedAtMs = Math.max(Date.now(), lastIssuedAtMs + 1);
  const issuedAtMs = lastIssuedAtMs;
  const token = `test_${uid}_${sId}_${issuedAtMs}`;
  const cached = await writeGroupSess(uid, token, sId, gwNode, issuedAtMs);
  if (cached === "stale") {
    throw new Error(`测试会话 issuedAt 栅栏拒绝 uid=${uid} sId=${sId}`);
  }
  fakeSessions.set(token, { userId: uid, serverId: sId, issuedAtMs });
  // dev provider（AUTH_PROVIDER=dev，非生产缺省）的 verify 走 token 索引——
  // import app.config 的 int 用例会装上它；写索引对 fake delegate 路径无副作用。
  await writeDevTokenIndex(token, uid, sId, issuedAtMs);
  latestToken.set(userServerKey(uid, sId), token);
  return { userId: uid, token };
}
