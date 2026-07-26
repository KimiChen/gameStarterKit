import "./env-setup"; // ⚠ 必须第一个 import

/**
 * split（ACCOUNT_MODE=http）鉴权：strict verify 懒填组 sess + 快路径陈旧重验回远程（M12c 2g / §2.7 / 2d）。
 * 真实 MySQL + Redis + 进程内起一个 WebPlatform Fastify（ephemeral 端口）当账号服务。
 *
 * 直接测 httpAccount（不切 ACCOUNT_MODE 全局）：
 *  1. 登录在 WebPlatform（MySQL token 记录，⛔ 组无 Redis sess）→ httpAccount.verify(strict) 远程 /verify + **懒填组 sess** → 快路径命中
 *  2. 快路径纯组缓存：⛔ 零 WebPlatform 回源（per-message 不打账号服务）
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
import { writeGroupSess } from "../../src/core/auth/session";
import { AuthRequiredError } from "../../src/core/errors";
import { kSess } from "../../src/core/infra/keys";
import { clientFor, closeRedis } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../../src/core/infra/mysql";
import { assertRedisUp, testUid } from "./helpers";

const uids: string[] = [];
let wp: FastifyInstance;
let base = "";
let verifyHits = 0; // WebPlatform /verify 命中数（证明快路径重验走远程，非本地 pool）
let raceUid: string | null = null;
let raceWinner: Awaited<ReturnType<typeof issueToken>> | null = null;

before(async () => {
  await assertRedisUp();
  wp = buildServer();
  wp.addHook("onRequest", async (req) => { if (req.url === "/verify") { verifyHits++; } });
  // 确定性制造 A1 准入竞态：/verify 已生成“旧 token 有效”的响应后、响应抵达网关前，
  // 权威换发更新 token 并先写组缓存。旧请求随后必须被 writeGroupSess fence 拒绝准入。
  wp.addHook("onSend", async (req, _reply, payload) => {
    if (req.url !== "/verify" || raceUid === null) { return payload; }
    const uid = raceUid;
    raceUid = null;
    const winner = await issueToken(uid, 0, null);
    await writeGroupSess(uid, winner.token, 0, "", winner.issuedAtMs);
    raceWinner = winner;
    return payload;
  });
  base = await wp.listen({ port: 0, host: "127.0.0.1" }); // ephemeral，返回 http://127.0.0.1:<port>
  process.env.WEBPLATFORM_BASE_URL = base; // httpAccount.post 每次现读（函数），指向本测起的 WebPlatform
});

after(async () => {
  await wp?.close();
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM login_audit WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM account_sessions WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await clientFor(u).unlink(kSess(u, 0));
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
  const { token } = await issueToken(uid, 0, null); // 写 accounts token_hash，⛔ 无 Redis
  await clientFor(uid).unlink(kSess(uid, 0));       // 确保组 sess 缺席
  return { uid, token };
}

test("组 sess 缺席 → verify(strict) 远程校验 + 懒填组 sess → 快路径命中", async () => {
  const { uid, token } = await makeSplitLogin("sv-ok");
  assert.equal(await clientFor(uid).exists(kSess(uid, 0)), 0, "登录在 WebPlatform，组 sess 缺席");

  const got = await httpAccount.verify(token, true, 0); // 建连点：远程 /verify + 懒填
  assert.equal(got, uid);

  const hash = await clientFor(uid).hget(kSess(uid, 0), "tokenHash");
  assert.equal(hash, createHash("sha256").update(token).digest("hex"), "组 sess 已懒填 tokenHash");
  assert.ok(await clientFor(uid).hget(kSess(uid, 0), "loginTs"), "组 sess 懒填完整（loginTs 等字段齐）");

  assert.equal(await httpAccount.verify(token, true, 0), uid,
    "同 token + 同 issuedAt 的第二条 strict 连接属于合法 unchanged，⛔ 不得误判 stale");
  assert.equal(await httpAccount.verify(token, false, 0), uid, "快路径命中组缓存");
});

test("strict 准入栅栏：远程校验后发生新登录，迟到旧 token ⛔ 不得完成进房", async () => {
  const { uid, token } = await makeSplitLogin("sv-race");
  raceWinner = null;
  raceUid = uid;

  await assert.rejects(
    httpAccount.verify(token, true, 0),
    AuthRequiredError,
    "remoteVerify 与缓存写之间被更新的旧 token 必须拒绝，而不是只 no-op 后仍返回 uid",
  );

  // 赋值发生在 Fastify onSend 异步回调里，TS 控制流看不到该副作用，显式恢复声明类型。
  const winner = raceWinner as Awaited<ReturnType<typeof issueToken>> | null;
  assert.ok(winner, "测试钩子已完成权威换发");
  const hash = await clientFor(uid).hget(kSess(uid, 0), "tokenHash");
  assert.equal(hash, createHash("sha256").update(winner.token).digest("hex"), "组缓存保持真正赢家");
  assert.equal(await httpAccount.verify(winner.token, false, 0), uid, "赢家快路径仍可用");
});

test("快路径纯组缓存：⛔ 零 WebPlatform 回源（per-message 不打账号服务，§2.7）", async () => {
  const { token } = await makeSplitLogin("sv-fast");
  await httpAccount.verify(token, true, 0); // 建连点：远程 /verify + 懒填组 sess
  const c0 = verifyHits;
  for (let i = 0; i < 5; i++) { await httpAccount.verify(token, false, 0); }
  assert.equal(verifyHits, c0, "快路径连打 5 次，WebPlatform /verify 命中数不变");
});

test("伪造 token → 远程 mismatch → AuthRequiredError，⛔ 不建组 sess", async () => {
  const { uid } = await makeSplitLogin("sv-forged");
  await clientFor(uid).unlink(kSess(uid, 0));
  const forged = `${uid}.${"0".repeat(48)}`;
  await assert.rejects(httpAccount.verify(forged, true, 0), AuthRequiredError);
  assert.equal(await clientFor(uid).exists(kSess(uid, 0)), 0, "校验失败不建组 sess");
});

test("真实封号/踢人（banAccount/revokeAccount → token_hash=NULL）→ strict verify 拒连、⛔ 不建 sess", async () => {
  // ⚠ 真实撤销路径都置 token_hash=NULL → verifyToken 先命中 hash 空判 mismatch（早于 status 判），
  //   故远程 reason=mismatch → AuthRequiredError（而非 ACCOUNT_BANNED）；封号在登录步另由 status 拦。
  const { uid: u1, token: t1 } = await makeSplitLogin("sv-ban");
  await banAccount(u1); // status=1 + token_hash=NULL
  await assert.rejects(httpAccount.verify(t1, true, 0), AuthRequiredError);
  assert.equal(await clientFor(u1).exists(kSess(u1, 0)), 0, "封号不建组 sess");

  const { uid: u2, token: t2 } = await makeSplitLogin("sv-revoke");
  await revokeAccount(u2); // token_hash=NULL（status 不变）
  await assert.rejects(httpAccount.verify(t2, true, 0), AuthRequiredError);
  assert.equal(await clientFor(u2).exists(kSess(u2, 0)), 0, "踢人不建组 sess");
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

test("split 撤销走接缝：httpAccount.ban/revoke → 远程写权威 + 回报命中（⛔ 不打本地组库）", async () => {
  const { uid, token } = await makeSplitLogin("sv-ban-seam");
  // ban：远程 UPDATE accounts（status=1 + token_hash=NULL），返回命中
  assert.equal(await httpAccount.ban(uid), true, "命中 → true（组侧据此决定是否踢在线）");
  await assert.rejects(httpAccount.verify(token, true, 0), AuthRequiredError, "封后建连即拒");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT a.status, s.token_hash FROM accounts a LEFT JOIN account_sessions s ON s.user_id = a.user_id AND s.server_id = 0 WHERE a.user_id = ?", [uid]);
  assert.equal(Number(rows[0].status), 1, "权威落在账号库（本测与游戏服共库，故可直查）");
  assert.equal(rows[0].token_hash, null);

  // 无此账号 → false（组侧据此**不踢**，避免无谓广播）
  assert.equal(await httpAccount.ban("u_nonexistent_x"), false, "未命中 → false");
  assert.equal(await httpAccount.revoke("u_nonexistent_x"), false);
});

test("split 选服目录走接缝：httpAccount.areaList → 远程 /area/list（⛔ 不打本地组库）", async () => {
  const r = await httpAccount.areaList(null);
  assert.ok(r.al.length > 0 && typeof r.h === "string", "远程目录可用");
  assert.deepEqual(r.ul, [], "匿名 ul 空");
});
