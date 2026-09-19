/**
 * POST /admin/world/transfers（MMO MF10-B3 运维只读面）：某区的交接行（缺省只列在途，includeFinal 连终态）。只读，⛔ 改任何行；鉴权走共享密钥头（同 /admin/kick / notice），
 * **未配置 `ADMIN_API_SECRET` 即端点关闭**（fail-closed）；生产也只应置于已鉴权反向代理之后。
 */
import type { RpcErrCode } from "@game/shared";
import { ADMIN_API_SECRET } from "../../core/infra/config";
import { safeSecretEqual } from "../../core/auth/session";
import { readAdminWorldTransfers } from "../../core/world/adminRead";
import { createGameEndpoint } from "../contract";

export default createGameEndpoint("AdminWorldTransfers", {
  method: "POST",
}, async (ctx) => {
  const secret = ADMIN_API_SECRET();
  if (!safeSecretEqual(ctx.headers?.get?.("x-admin-secret"), secret)) { // 恒时；未配 secret 即拒（fail-closed）
    throw ctx.error(401, { error: "AUTH_REQUIRED" satisfies RpcErrCode });
  }
  return readAdminWorldTransfers(ctx.body.sId, ctx.body.personaId, ctx.body.includeFinal === true);
});
