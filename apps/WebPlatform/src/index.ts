/**
 * WebPlatform 独立 HTTP entry（Fastify）——**仅 prod-split 用**（DUAL_MODE §2.7）。
 * dev/test 内嵌模式下 apps/server 直接 import `lib/`、不起本进程。
 *
 * 端点（login / verify / ban / character.* / bindProfile）随 2b-2-iii 逐个挂上（包 lib）；
 * 此处先建 Fastify 骨架 + 健康检查。
 */
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { WEBPLATFORM_PORT } from "./config";
import { getPool } from "./lib/mysql";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });
  app.get("/healthz", async () => {
    await getPool().query("SELECT 1");
    return { ok: true, service: "webplatform" };
  });
  // TODO(2b-2-iii)：login / verify / ban / character.* / bindProfile 端点（Fastify + zod，包 lib）
  return app;
}

// 直接运行即起独立进程（prod-split）；被 import 时不自启（dev/test 内嵌只用 lib）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildServer()
    .listen({ port: WEBPLATFORM_PORT, host: "0.0.0.0" })
    .then((addr) => console.log(`[webplatform] listening ${addr}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
