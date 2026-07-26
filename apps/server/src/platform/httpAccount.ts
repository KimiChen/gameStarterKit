/**
 * httpAccount：`AccountClient` 的 HTTP 实现（DUAL_MODE §2.7 split 模式）——走 WebPlatform 的 Fastify 端点。
 * config `ACCOUNT_MODE=http` 时 accountClient 选它；否则默认 inProcessAccount（dev/test 内嵌）。
 *
 * ⚠ verify 的**快路径（strict=false）仍读组 Redis 缓存**（per-message 不打 WebPlatform，§2.7）；
 * 只有 strict=true（建连权威校验）走 HTTP。组缓存 onAuth 懒填 = 2d（未做前 split 的 verify 快路径仍依赖登录写 sess）。
 */
import type { IAreaListRes } from "@game/shared";
import { AuthRequiredError, BannedError } from "../core/errors";
import { WEBPLATFORM_BASE_URL, WEBPLATFORM_TIMEOUT_MS } from "../core/infra/config";
import { verifySession, writeGroupSess } from "../core/auth/session";
import type { AccountClient } from "./accountClient";

/**
 * 内部 HTTP 调用（组网关 → WebPlatform）。**必须带超时**：本函数在 `onAuth`（建连）与建角路径上，
 * ⛔ 无超时时 WebPlatform 黑洞（网络分区/进程僵死）会把每个 join 无限挂住 —— 连接堆积到网关被拖垮。
 * ⚠ 仍缺：重试/熔断/响应 schema/服务间鉴权（W1 配套）——见 docs/WEBPLATFORM.md §4。
 */
async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${WEBPLATFORM_BASE_URL()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEBPLATFORM_TIMEOUT_MS),
    });
  } catch (e) {
    // 超时/连不上：⛔ 不当成"校验失败"（那会把账号服务故障误报成用户 token 无效）
    throw new Error(`webplatform ${path} 不可达（${WEBPLATFORM_TIMEOUT_MS}ms 超时或连接失败）: ${String(e)}`);
  }
  if (!res.ok) { throw new Error(`webplatform ${path} → HTTP ${res.status}`); }
  return await res.json() as T;
}

type VerifyResp = { ok: true; uid: string; issuedAtMs?: number } | { ok: false; reason: string };

/** WebPlatform /verify 结果码 → 组网关错误类（与 verifySessionStrict 同映射，09·G1/07）。 */
function mapVerifyReason(reason: string): never {
  if (reason === "banned") { throw new BannedError(); }
  if (reason === "deregistered") { throw new AuthRequiredError("账号已注销"); }
  throw new AuthRequiredError(`token 校验失败(${reason})`); // not_found / mismatch / expired
}

/** 远程权威校验（WebPlatform /verify，MySQL 权威）；ok 返回 uid，否则映射错误类抛。 */
/** ⚠ 连 `issuedAtMs` 一起回：它是 `writeGroupSess` 的写入栅栏判据（A1）。
 *  `?? 0` 兜住"门户是旧版本、响应里还没有这个字段"的滚动升级窗口——0 会被栅栏判成"最旧"，
 *  ⇒ 已有更新值时**不覆盖**（安全侧），首次写入（无已存值）仍照常。 */
async function remoteVerify(token: string): Promise<{ uid: string; issuedAtMs: number }> {
  const r = await post<VerifyResp>("/verify", { token });
  if (r.ok) { return { uid: r.uid, issuedAtMs: Number(r.issuedAtMs ?? 0) }; }
  mapVerifyReason(r.reason);
}

export const httpAccount: AccountClient = {
  async verify(token, strict) {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) { throw new AuthRequiredError("token 格式无效"); }
    const uid = token.slice(0, dot);
    if (!strict) {
      // 快路径：纯读组 Redis 缓存（per-message ⛔ 不打 WebPlatform，§2.7）。在线撤销由 GM 踢承担（§2.3 SOP）。
      await verifySession(uid, token);
      return uid;
    }
    // 建连：远程权威校验 → 懒填组 sess:{uid}（§2.7 / 2d：strict 是连接建立点；LobbyRoom.onAuth 是首个 strict 点）。
    // ⚠ in-process 走 inProcessAccount（登录已写 sess），到不了这。
    const { uid: vuid, issuedAtMs } = await remoteVerify(token);
    await writeGroupSess(vuid, token, "", issuedAtMs);
    return vuid;
  },
  character: {
    async register(uid, sId) { await post("/character/register", { uid, sId }); },
    async query(uid) { return (await post<{ zones: number[] }>("/character/query", { uid })).zones; },
    async has(uid, sId) { return (await post<{ has: boolean }>("/character/has", { uid, sId })).has; },
  },
  async accountExists(uid) { return (await post<{ exists: boolean }>("/account/exists", { uid })).exists; },
  // 撤销：远程写权威并回报是否命中；**踢在线不在此处**——由调用方（core/auth/ban.ts）在本组发起
  // （游戏服持 coord Redis），WebPlatform 刻意不广播（WEBPLATFORM.md §5）。
  async ban(uid) { return (await post<{ banned: boolean }>("/ban", { uid })).banned; },
  async revoke(uid) { return (await post<{ revoked: boolean }>("/revoke", { uid })).revoked; },
  async areaList(token) { return await post<IAreaListRes>("/area/list", { token }); },
};
