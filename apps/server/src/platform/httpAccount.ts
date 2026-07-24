/**
 * httpAccount：`AccountClient` 的 HTTP 实现（DUAL_MODE §2.7 split 模式）——走 WebPlatform 的 Fastify 端点。
 * config `ACCOUNT_MODE=http` 时 accountClient 选它；否则默认 inProcessAccount（dev/test 内嵌）。
 *
 * ⚠ verify 的**快路径（strict=false）仍读组 Redis 缓存**（per-message 不打 WebPlatform，§2.7）；
 * 只有 strict=true（建连权威校验）走 HTTP。组缓存 onAuth 懒填 = 2d（未做前 split 的 verify 快路径仍依赖登录写 sess）。
 */
import { AuthRequiredError, BannedError, EpochStaleError } from "../core/errors";
import { WEBPLATFORM_BASE_URL } from "../core/infra/config";
import { verifySession, writeGroupSess } from "../core/auth/session";
import type { AccountClient } from "./accountClient";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WEBPLATFORM_BASE_URL()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { throw new Error(`webplatform ${path} → HTTP ${res.status}`); }
  return await res.json() as T;
}

type VerifyResp = { ok: true; uid: string; epoch: number } | { ok: false; reason: string };

/** WebPlatform /verify 结果码 → 组网关错误类（与 verifySessionStrict 同映射，09·G1/07）。 */
function mapVerifyReason(reason: string): never {
  if (reason === "banned") { throw new BannedError(); }
  if (reason === "stale") { throw new EpochStaleError(); }
  if (reason === "deregistered") { throw new AuthRequiredError("账号已注销"); }
  throw new AuthRequiredError(`token 校验失败(${reason})`); // not_found / mismatch / expired
}

/** 远程权威校验（WebPlatform /verify，MySQL 权威）；ok 返回 {uid, epoch}，否则映射错误类抛。 */
async function remoteVerify(token: string): Promise<{ uid: string; epoch: number }> {
  const r = await post<VerifyResp>("/verify", { token });
  if (r.ok) { return { uid: r.uid, epoch: r.epoch }; }
  mapVerifyReason(r.reason);
}

export const httpAccount: AccountClient = {
  async verify(token, strict) {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) { throw new AuthRequiredError("token 格式无效"); }
    const uid = token.slice(0, dot);
    if (!strict) {
      // 快路径：读组 Redis 缓存（per-message 不打 WebPlatform，§2.7）。verifiedAt 陈旧时**回 WebPlatform 权威**重验
      // ——⛔ 绝不用 verifySession 默认的本地 verifySessionStrict：split 账号库是 WebPlatform 独立库，本地组库
      // 没有该 accounts 行，本地重验会在 AUTH_REVERIFY_TTL_S 后把每个在连用户误踢。
      await verifySession(uid, token, async (_u, t) => { await remoteVerify(t); });
      return uid;
    }
    // 建连：远程权威校验 → 懒填组 sess:{uid}（§2.7 / 2d：strict 是连接建立点；LobbyRoom.onAuth 是首个 strict 点）。
    // ⚠ in-process 走 inProcessAccount（登录已写 sess），到不了这。
    const { uid: vuid, epoch } = await remoteVerify(token);
    await writeGroupSess(vuid, token, epoch);
    return vuid;
  },
  character: {
    async register(uid, sId) { await post("/character/register", { uid, sId }); },
    async query(uid) { return (await post<{ zones: number[] }>("/character/query", { uid })).zones; },
    async has(uid, sId) { return (await post<{ has: boolean }>("/character/has", { uid, sId })).has; },
  },
  async accountExists(uid) { return (await post<{ exists: boolean }>("/account/exists", { uid })).exists; },
};
