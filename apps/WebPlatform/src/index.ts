/**
 * WebPlatform 独立 HTTP entry（Fastify）——**仅 prod-split 用**（DUAL_MODE §2.7）。
 * dev/test 内嵌模式下 apps/server 直接 import `lib/`、不起本进程。
 *
 * 端点是 lib 的薄 HTTP 包（内部 business↔WebPlatform 契约）：
 * verify 返回**结果码**（业务侧 httpAccount 映射错误类，同 in-process 结果码边界）。
 * login / bindProfile / area/list 随 split 激活续接（此处先 verify/character/ban）。
 */
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ApiPath, type ILoginRes } from "@game/shared";
import { AUTH_DEV_ENABLED, WEBPLATFORM_PORT } from "./config";
import { getPool } from "./lib/mysql";
import {
  accountExists, areaList, banAccount, characterHas, characterRegister, characterZones,
  devLogin, type LoginResult, revokeAccount, verifyToken, wxLogin,
} from "./lib";

/** 真实 IP 取 XFF **最右段**（可信 LB append 真实对端；最左段客户端可伪造，绕登录限流，09·G5）。 */
const realIp = (req: FastifyRequest): string => {
  const xff = (req.headers["x-forwarded-for"] as string | undefined) ?? "";
  return xff.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? req.ip;
};

/**
 * lib 登录结果码 → **客户端契约**（成功回 shared `ILoginRes{userId,token,isNew}`；失败 reply.code+错误码），
 * 与 in-process apps/server http/account/{wxLogin,devLogin}.ts **同契约**（客户端 portalRequest 二形态无感）。
 * ⛔ 出参禁含 openid/unionid/session_key/epoch（09·G8）。
 */
function loginReply(r: LoginResult, reply: FastifyReply): ILoginRes | { error: string } {
  if (r.ok) { return { userId: r.uid, token: r.token, isNew: r.isNew }; }
  const [status, code]: [number, string] =
    r.reason === "banned" ? [403, "ACCOUNT_BANNED"]
    : r.reason === "rate_limited" || r.reason === "wx_rate_limited" ? [429, "RATE_LIMITED"]
    : r.reason === "wx_invalid" ? [401, "AUTH_REQUIRED"]
    : [500, "INTERNAL"]; // wx_unavailable
  reply.code(status);
  return { error: code };
}

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/healthz", async () => {
    await getPool().query("SELECT 1");
    return { ok: true, service: "webplatform" };
  });

  // 校验（token 内嵌 uid = {uid}.{hex}）：返回结果码，业务侧映射错误类（09·G1）。
  app.post<{ Body: { token: string } }>("/verify", async (req) => {
    const token = typeof req.body?.token === "string" ? req.body.token : ""; // Fastify 泛型仅编译期，运行期防非串
    const dot = token.lastIndexOf(".");
    if (dot <= 0) { return { ok: false as const, reason: "mismatch" as const }; }
    const uid = token.slice(0, dot);
    const r = await verifyToken(uid, token);
    return r.ok ? { ok: true as const, uid, epoch: r.epoch, status: r.status } : r;
  });

  // 角色/足迹注册表（存在性权威）。
  app.post<{ Body: { uid: string; sId: number } }>("/character/register", async (req) => {
    await characterRegister(req.body.uid, req.body.sId);
    return { ok: true };
  });
  app.post<{ Body: { uid: string } }>("/character/query", async (req) => {
    return { zones: await characterZones(req.body.uid) };
  });
  app.post<{ Body: { uid: string; sId: number } }>("/character/has", async (req) => {
    return { has: await characterHas(req.body.uid, req.body.sId) };
  });
  app.post<{ Body: { uid: string } }>("/account/exists", async (req) => {
    return { exists: await accountExists(req.body.uid) };
  });

  // 撤销（封号 / 踢人）。
  app.post<{ Body: { uid: string } }>("/ban", async (req) => {
    await banAccount(req.body.uid);
    return { ok: true };
  });
  app.post<{ Body: { uid: string } }>("/revoke", async (req) => {
    await revokeAccount(req.body.uid);
    return { ok: true };
  });

  // 登录（split：客户端 portalRequest 直连 WebPlatform）：路径 = 单源 ApiPath（铁律 6，与 in-process 端点一致）；
  // lib 全链（限流→code2session→查/建号→签发）→ loginReply 映射成客户端契约。组 sess 由网关 onAuth 懒填（2g）。
  app.post<{ Body: { code?: string; deviceId?: string } }>(ApiPath.WxLogin, async (req, reply) => {
    const r = await wxLogin({ code: String(req.body?.code ?? ""), ip: realIp(req), deviceId: req.body?.deviceId ?? null });
    return loginReply(r, reply);
  });
  app.post<{ Body: { devKey?: string; deviceId?: string } }>(ApiPath.DevLogin, async (req, reply) => {
    if (!AUTH_DEV_ENABLED) { reply.code(404); return { error: "NOT_FOUND" }; }
    const r = await devLogin(String(req.body?.devKey ?? ""), realIp(req), req.body?.deviceId ?? null);
    return loginReply(r, reply);
  });

  // 选服目录（登录前展示，无鉴权；token 可选、best-effort 回填 ul）。返回 IAreaListRes（al/ul/isOps/h）。
  // ⚠ Fastify 无运行期 body 校验（`Body` 泛型仅编译期）：token 若非字符串，lib 内 lastIndexOf 会抛→500，
  // 破坏 best-effort ⛔不抛 契约。就地收敛成 string|null（对齐 in-process 端点的 zod）。
  app.post<{ Body: { token?: string } }>("/area/list", async (req) => {
    return areaList(typeof req.body?.token === "string" ? req.body.token : null);
  });

  // TODO(split 激活续)：/bindProfile、/bindPhone。
  return app;
}

// 直接运行即起独立进程（prod-split）；被 import 时不自启（dev/test 内嵌只用 lib）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildServer()
    .listen({ port: WEBPLATFORM_PORT, host: "0.0.0.0" })
    .then((addr) => console.log(`[webplatform] listening ${addr}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
