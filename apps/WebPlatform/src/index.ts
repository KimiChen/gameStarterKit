/**
 * WebPlatform 独立 HTTP entry（Fastify）——**仅 prod-split 用**（DUAL_MODE §2.7）。
 * dev/test 内嵌模式下 apps/server 直接 import `lib/`、不起本进程。
 *
 * 端点是 lib 的薄 HTTP 包（内部 business↔WebPlatform 契约）：
 * verify 返回**结果码**（业务侧 httpAccount 映射错误类，同 in-process 结果码边界）。
 * login / bindProfile / area/list 随 split 激活续接（此处先 verify/character/ban）。
 */
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { WEBPLATFORM_PORT } from "./config";
import { getPool } from "./lib/mysql";
import {
  accountExists, banAccount, characterHas, characterRegister, characterZones, revokeAccount, verifyToken,
} from "./lib";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/healthz", async () => {
    await getPool().query("SELECT 1");
    return { ok: true, service: "webplatform" };
  });

  // 校验（token 内嵌 uid = {uid}.{hex}）：返回结果码，业务侧映射错误类（09·G1）。
  app.post<{ Body: { token: string } }>("/verify", async (req) => {
    const token = req.body?.token ?? "";
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

  // TODO(split 激活续)：/login（rate-limit→code2session→accounts→issueToken）、/bindProfile、/bindPhone、/area/list。
  return app;
}

// 直接运行即起独立进程（prod-split）；被 import 时不自启（dev/test 内嵌只用 lib）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildServer()
    .listen({ port: WEBPLATFORM_PORT, host: "0.0.0.0" })
    .then((addr) => console.log(`[webplatform] listening ${addr}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
