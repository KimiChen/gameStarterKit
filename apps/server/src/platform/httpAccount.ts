/**
 * httpAccount：`AccountClient` 的 HTTP 实现（DUAL_MODE §2.7 split 模式）——走 WebPlatform 的 Fastify 端点。
 * config `ACCOUNT_MODE=http` 时 accountClient 选它；否则默认 inProcessAccount（dev/test 内嵌）。
 *
 * ⚠ verify 的**快路径（strict=false）仍读组 Redis 缓存**（per-message 不打 WebPlatform，§2.7）；
 * 只有 strict=true（建连权威校验）走 HTTP。组缓存 onAuth 懒填 = 2d（未做前 split 的 verify 快路径仍依赖登录写 sess）。
 */
import { AuthRequiredError, BannedError, EpochStaleError } from "../core/errors";
import { WEBPLATFORM_BASE_URL } from "../core/infra/config";
import { verifySession } from "../core/auth/session";
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

type VerifyResp = { ok: true; uid: string } | { ok: false; reason: string };

export const httpAccount: AccountClient = {
  async verify(token, strict) {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) { throw new AuthRequiredError("token 格式无效"); }
    const uid = token.slice(0, dot);
    if (!strict) {
      // 快路径：读组 Redis 缓存（不打 WebPlatform；per-message §2.7）
      await verifySession(uid, token);
      return uid;
    }
    // 建连：远程权威校验（WebPlatform verifyToken 结果码 → 映射错误类）
    const r = await post<VerifyResp>("/verify", { token });
    if (r.ok) { return r.uid; }
    if (r.reason === "banned") { throw new BannedError(); }
    if (r.reason === "stale") { throw new EpochStaleError(); }
    if (r.reason === "deregistered") { throw new AuthRequiredError("账号已注销"); }
    throw new AuthRequiredError(`token 校验失败(${r.reason})`);
  },
  character: {
    async register(uid, sId) { await post("/character/register", { uid, sId }); },
    async query(uid) { return (await post<{ zones: number[] }>("/character/query", { uid })).zones; },
    async has(uid, sId) { return (await post<{ has: boolean }>("/character/has", { uid, sId })).has; },
  },
  async accountExists(uid) { return (await post<{ exists: boolean }>("/account/exists", { uid })).exists; },
};
