/**
 * dev 身份提供者（AUTH_PROVIDER=dev；铁律 12 的非生产显式例外——config.ts 的
 * 生产闸已拒 `dev + NODE_ENV=production`）。
 *
 * 与 `WebPlatformClient` 同接口的进程内开发实现：会话形状、组 sess 缓存、角色登记
 * marker 与真链路**逐语义一致**——dev 会话落本地 Redis（sess）与 MySQL 角色登记
 * （用户拍板 2026-09-02）， Lobby/GameRoom/角色修复链零改动。
 *
 * ⛔ 边界：这不是账号数据库、不模仿 WebPlatform 的账号语义（封禁/撤销/多区目录
 * 在 dev 下不成立，也不装假）；`devKey` 只是稳定派生 uid 的盐，token 是随机不透明串。
 * 生产环境的真实身份只走外部 HTTP 契约。
 */
import { createHash, randomBytes } from "node:crypto";
import { SESS_TTL_S } from "../core/infra/config";
import { kSess, kUser, zoneCtx } from "../core/infra/keys";
import { clientFor } from "../core/infra/redisRoute";
import { safeEqualHex, tokenHashOf, writeGroupSess } from "../core/auth/session";
import { AuthRequiredError } from "../core/errors";
import { markCharacterRegistrationReady } from "../player/characterState";
import type { WebPlatformClient } from "./webPlatformClient";

/** token → uid 索引键（verify 只有 token 入参；路由键固定 "devauth" 保证写读同端）。 */
const TOKEN_INDEX_ROUTE = "devauth";
const tokenIndexKey = (token: string): string =>
  `devauth:token:${createHash("sha256").update(token).digest("hex")}`;

export interface DevSession {
    readonly userId: string;
    readonly token: string;
    readonly issuedAtMs: number;
}

/** 由 devKey 稳定派生 uid：同一 devKey 永远是同一账号；不同 key 是不同账号。 */
export function devUidOf(devKey: string): string {
  return `dev-${createHash("sha256").update(`gono-devauth:${devKey}`).digest("hex").slice(0, 16)}`;
}

/**
 * dev 登录：签发不透明 token，写与真链路**同款**组 sess（`writeGroupSess`——
 * 顶号踢旧的语义一并复用），并留 token → uid 索引供 verify 反查。
 */
export async function issueDevSession(devKey: string, sId: number): Promise<DevSession> {
  const uid = devUidOf(devKey);
  const token = randomBytes(32).toString("base64url");
  const issuedAtMs = Date.now();
  const written = await writeGroupSess(uid, token, sId, "", issuedAtMs);
  if (written === "stale") {
    throw new AuthRequiredError("登录态已被更新，请重新登录");
  }
  await writeDevTokenIndex(token, uid, sId, issuedAtMs);
  return { userId: uid, token, issuedAtMs };
}

/** 写 token → uid 索引（verify 的反查面；dev 登录与测试发号共用同一写入点）。 */
export async function writeDevTokenIndex(
  token: string,
  uid: string,
  sId: number,
  issuedAtMs: number,
): Promise<void> {
  await zoneCtx.run({ sId }, async () => {
    await clientFor(TOKEN_INDEX_ROUTE).set(
      tokenIndexKey(token),
      JSON.stringify({ uid, sId, issuedAtMs }),
      "EX",
      SESS_TTL_S,
    );
  });
}

/** dev 身份提供者（组合同接口；生产永远不应装上它——config.ts 的 AUTH_PROVIDER 闸）。 */
export function createDevAuthProvider(): WebPlatformClient {
  return {
    async verify(accessToken, serverId) {
      const raw = await clientFor(TOKEN_INDEX_ROUTE).get(tokenIndexKey(accessToken));
      if (raw === null) {
        throw new AuthRequiredError("session 不存在或已过期");
      }
      let record: { uid?: unknown; sId?: unknown; issuedAtMs?: unknown };
      try {
        record = JSON.parse(raw) as { uid?: unknown; sId?: unknown; issuedAtMs?: unknown };
      } catch {
        throw new AuthRequiredError("session 记录损坏");
      }
      if (typeof record.uid !== "string" || typeof record.sId !== "number"
        || typeof record.issuedAtMs !== "number") {
        throw new AuthRequiredError("session 记录损坏");
      }
      if (record.sId !== serverId) {
        throw new AuthRequiredError("session 与区服不匹配");
      }
      // 组 sess 是准入的在线闸：索引只负责反查 uid，准入必须与 sess 当前 hash 一致
      // ——同账号换发新 token 后，旧 token 的索引仍在但 hash 已不匹配（顶号语义）。
      const tokenHash = await clientFor(record.uid).hget(kSess(record.uid, record.sId), "tokenHash");
      if (tokenHash === null || !safeEqualHex(tokenHash, tokenHashOf(accessToken))) {
        throw new AuthRequiredError("session 不存在或已过期");
      }
      return { userId: record.uid, issuedAtMs: record.issuedAtMs };
    },
    async registerCharacter(userId, serverId) {
      // 落 MySQL 角色登记（与真链路的 registerCharacter 语义对齐：ready marker）。
      await markCharacterRegistrationReady(userId, serverId);
    },
    async hasCharacter(userId, serverId) {
      // ⚠ 只能做**存储级直查**：经 ensureLive/thaw 的标准读取会回查本接口
      // （thaw 的「本区建过角没」判据调 webPlatformClient.hasCharacter），形成递归锁
      // ——dev 的角色存在性 = 本地 ready marker（与外部 registry 的语义对齐）。
      return zoneCtx.run({ sId: serverId }, async () => {
        const fields = await clientFor(userId).hmget(kUser(userId), "characterRegistration");
        return fields[0] === "ready";
      });
    },
  };
}
