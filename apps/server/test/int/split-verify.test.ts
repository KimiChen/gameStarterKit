import "./env-setup"; // ⚠ 必须第一个 import

/**
 * split（ACCOUNT_MODE=http）鉴权：strict verify 懒填组 sess + 快路径陈旧重验回远程（M12c 2g / §2.7 / 2d）。
 * 真实 MySQL + Redis + 进程内起一个 WebPlatform Fastify（ephemeral 端口）当账号服务。
 *
 * 直接测 httpAccount（不切 ACCOUNT_MODE 全局）：
 *  1. 登录在 WebPlatform（MySQL token 记录，⛔ 组无 Redis sess）→ httpAccount.verify(strict) 远程 /verify + **懒填组 sess** → 快路径命中
 *  2. verifiedAt 陈旧 → 快路径**回 WebPlatform 权威重验**（⛔ 不打本地组 pool——split 账号库独立，本地无该行会误踢）
 *  3. 真实封号/踢人（banAccount/revokeAccount → token_hash=NULL）→ strict verify 拒连、⛔ 不建 sess
 *  4. 门户登录路径契约：POST ApiPath.DevLogin → ILoginRes{userId,token,isNew}（对齐客户端 portalRequest，⛔ G8 无 openid）
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { ApiPath } from "@game/shared";
import { buildServer } from "@game/webplatform";
import { banAccount, issueToken, revokeAccount } from "@game/webplatform/lib";
import { httpAccount } from "../../src/platform/httpAccount";
import { AuthRequiredError } from "../../src/core/errors";
import { kSess } from "../../src/core/infra/keys";
import { clientFor, closeRedis } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { ResultSetHeader } from "../../src/core/infra/mysql";
import { assertRedisUp, testUid } from "./helpers";

const uids: string[] = [];
let wp: FastifyInstance;
let base = "";
let verifyHits = 0; // WebPlatform /verify 命中数（证明快路径重验走远程，非本地 pool）

before(async () => {
  await assertRedisUp();
  wp = buildServer();
  wp.addHook("onRequest", async (req) => { if (req.url === "/verify") { verifyHits++; } });
  base = await wp.listen({ port: 0, host: "127.0.0.1" }); // ephemeral，返回 http://127.0.0.1:<port>
  process.env.WEBPLATFORM_BASE_URL = base; // httpAccount.post 每次现读（函数），指向本测起的 WebPlatform
});

after(async () => {
  await wp?.close();
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM login_audit WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM revocation_log WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await clientFor(u).unlink(kSess(u));
  }
  await closeRedis();
  await closeMysql();
});

/** 造 split 登录态：accounts 行 + MySQL token 记录（issueToken），**⛔ 不写组 sess**（模拟登录发生在 WebPlatform）。 */
async function makeSplitLogin(name: string): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO accounts (user_id, openid) VALUES (?, ?)", [uid, `op_${uid}`]);
  const token = await issueToken(uid, 0, null); // 写 accounts token_hash，⛔ 无 Redis
  await clientFor(uid).unlink(kSess(uid));       // 确保组 sess 缺席
  return { uid, token };
}

test("组 sess 缺席 → verify(strict) 远程校验 + 懒填组 sess → 快路径命中", async () => {
  const { uid, token } = await makeSplitLogin("sv-ok");
  assert.equal(await clientFor(uid).exists(kSess(uid)), 0, "登录在 WebPlatform，组 sess 缺席");

  const got = await httpAccount.verify(token, true); // 建连点：远程 /verify + 懒填
  assert.equal(got, uid);

  const hash = await clientFor(uid).hget(kSess(uid), "tokenHash");
  assert.equal(hash, createHash("sha256").update(token).digest("hex"), "组 sess 已懒填 tokenHash");
  const verifiedAt = await clientFor(uid).hget(kSess(uid), "verifiedAt");
  assert.ok(verifiedAt && Date.now() - Number(verifiedAt) < 5_000, "verifiedAt 为懒填时刻");

  assert.equal(await httpAccount.verify(token, false), uid, "快路径命中组缓存");
});

test("快路径 verifiedAt 陈旧 → 回 WebPlatform 权威重验（⛔ 不打本地 pool）", async () => {
  const { uid, token } = await makeSplitLogin("sv-reverify");
  await httpAccount.verify(token, true); // 懒填 sess（verifiedAt=now）
  const c0 = verifyHits;
  await httpAccount.verify(token, false);
  assert.equal(verifyHits, c0, "verifiedAt 新鲜：快路径不打 WebPlatform");
  // 造陈旧 verifiedAt（> AUTH_REVERIFY_TTL_S）→ 快路径应回 WebPlatform 重验（+1 次 /verify）
  await clientFor(uid).hset(kSess(uid), "verifiedAt", String(Date.now() - 61_000));
  assert.equal(await httpAccount.verify(token, false), uid);
  assert.equal(verifyHits, c0 + 1, "verifiedAt 陈旧：快路径回 WebPlatform 远程重验（非本地组 pool）");
});

test("伪造 token → 远程 mismatch → AuthRequiredError，⛔ 不建组 sess", async () => {
  const { uid } = await makeSplitLogin("sv-forged");
  await clientFor(uid).unlink(kSess(uid));
  const forged = `${uid}.${"0".repeat(48)}`;
  await assert.rejects(httpAccount.verify(forged, true), AuthRequiredError);
  assert.equal(await clientFor(uid).exists(kSess(uid)), 0, "校验失败不建组 sess");
});

test("真实封号/踢人（banAccount/revokeAccount → token_hash=NULL）→ strict verify 拒连、⛔ 不建 sess", async () => {
  // ⚠ 真实撤销路径都置 token_hash=NULL → verifyToken 先命中 hash 空判 mismatch（早于 status/epoch 判），
  //   故远程 reason=mismatch → AuthRequiredError（而非 ACCOUNT_BANNED/EPOCH_STALE）；封号在登录步另由 status 拦。
  const { uid: u1, token: t1 } = await makeSplitLogin("sv-ban");
  await banAccount(u1); // status=1 + epoch+1 + token_hash=NULL
  await assert.rejects(httpAccount.verify(t1, true), AuthRequiredError);
  assert.equal(await clientFor(u1).exists(kSess(u1)), 0, "封号不建组 sess");

  const { uid: u2, token: t2 } = await makeSplitLogin("sv-revoke");
  await revokeAccount(u2); // epoch+1 + token_hash=NULL
  await assert.rejects(httpAccount.verify(t2, true), AuthRequiredError);
  assert.equal(await clientFor(u2).exists(kSess(u2)), 0, "踢人不建组 sess");
});

test("门户登录路径契约：POST ApiPath.DevLogin → ILoginRes{userId,token,isNew}（客户端 portalRequest 打的正是此路径/形态）", async () => {
  const res = await fetch(`${base}${ApiPath.DevLogin}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ devKey: testUid("svp").slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, "") }),
  });
  assert.equal(res.status, 200, "路径命中（曾误挂 /dev-login 与 ApiPath 不符 → 404）");
  const body = await res.json() as { userId: string; token: string; isNew: boolean; openid?: string };
  uids.push(body.userId);
  assert.match(body.userId, /^u_\d+$/);
  assert.ok(/\.[0-9a-f]{48}$/.test(body.token) && typeof body.isNew === "boolean", "ILoginRes 形态");
  assert.equal(body.openid, undefined, "⛔ G8：出参无 openid");
});
