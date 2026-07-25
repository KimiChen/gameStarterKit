/**
 * `AccountClient` 的**内嵌实现**（in-process 模式，DUAL_MODE §2.7 / [WEBPLATFORM.md](../../../../docs/WEBPLATFORM.md)）。
 *
 * 直接 import `@game/webplatform/lib`（MySQL-only）——**只有本目录（`platform/`）允许这么做**：
 * split 下游戏服的池被注入给 lib（`core/infra/mysql.ts` 的 `useServerPool`），直调即打在**组游戏库**上，
 * 而 accounts/char_registry 在**账号库** ⇒ 静默错误（`affectedRows=0`、空集）。接缝就是防这个，
 * 由 `test/lib-import-ban.test.ts` 机检。⚠ 本文件的每个函数都**只在 in-process 模式被选中**（见 accountClient）。
 */
import {
  accountExists, areaList, banAccount, characterHas, characterRegister, characterZones,
  revokeAccount, verifyToken,
} from "@game/webplatform/lib";
import { AuthRequiredError, BannedError } from "../core/errors";
import { verifySession } from "../core/auth/session";
import type { AccountClient } from "./accountClient";

/**
 * 严格校验（建立连接时）：回源 MySQL 权威（token_hash 匹配 + status + 过期）。
 * 拦截 Redis failover 后从旧副本「复活」的被撤销会话（02·P1）——权威 hash 已 NULL/换发即拒。
 * lib 返回**结果码**（跨包不抛业务错误），本处做「结果码 → 错误类」映射（07）。
 */
export async function verifySessionStrict(uid: string, token: string): Promise<void> {
  const r = await verifyToken(uid, token);
  if (r.ok) { return; }
  if (r.reason === "banned") { throw new BannedError(); } // 封号 → ACCOUNT_BANNED（07）
  if (r.reason === "deregistered") { throw new AuthRequiredError("账号已注销"); }
  throw new AuthRequiredError(`token 校验失败(${r.reason})`); // not_found / mismatch / expired
}

/** 网关入口：token 反查 uid（09·G1）+ 校验。strict 用于建立连接，快路径用于每 RPC。 */
export async function verifyBearer(token: string, strict = false): Promise<string> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) { throw new AuthRequiredError("token 格式无效"); }
  const uid = token.slice(0, dot);
  if (strict) { await verifySessionStrict(uid, token); } else { await verifySession(uid, token); }
  return uid;
}

/** 内嵌实现：全部委托 `@game/webplatform/lib`（与游戏服共库，故直调正确）。 */
export const inProcessAccount: AccountClient = {
  verify: (token, strict) => verifyBearer(token, strict),
  character: {
    register: (uid, sId) => characterRegister(uid, sId),
    query: (uid) => characterZones(uid),
    has: (uid, sId) => characterHas(uid, sId),
  },
  accountExists: (uid) => accountExists(uid),
  ban: (uid) => banAccount(uid),
  revoke: (uid) => revokeAccount(uid),
  areaList: (token) => areaList(token),
};
