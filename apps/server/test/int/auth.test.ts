/**
 * M3 DoD 集成测试（10·M3）——真实 MySQL + Redis，微信 code2session 用本地 mock HTTP 服务：
 *  1. 新号建档 + 出参不含 openid/session_key（09·G8）
 *  2. 同 openid 再登录找回同一 user_id
 *  3. 封号后：存量 token 立即失效 + 重新 wx-login 被拒（09·G7）
 *  4. failover 复活会话被 token_epoch 拦（verifySessionStrict）
 *  5. 登录限流独立严格档
 *（Arthur 的「存量账号绑定」用例未移植：本项目无旧账号体系）
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { banUser, verifySession, verifySessionStrict } from "../../src/core/auth/session";
import { _resetBreaker } from "../../src/core/auth/wxClient";
import { wxLogin } from "../../src/core/auth/wxLogin";
import { AuthRequiredError, BannedError, EpochStaleError, RateLimitedError } from "../../src/core/errors";
import { activeLruBucketOf, kActiveLru, kRl, kSess, kUser } from "../../src/core/infra/keys";
import { clientFor, clientForKey, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { RowDataPacket } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, testUid } from "./helpers";

const run = testUid("wx"); // openid 前缀，保证跨运行不撞 UNIQUE(openid)
let mockWx: Server;
const createdUids: string[] = [];
const usedIps: string[] = [];
let ipSeq = 0;
const freshIp = (): string => { const ip = `10.9.${(ipSeq / 250) | 0}.${ipSeq++ % 250 + 1}`; usedIps.push(ip); return ip; };

before(async () => {
  await assertRedisUp();
  process.env.WX_APPID = "test-appid";
  process.env.WX_SECRET = "test-secret";
  _resetBreaker();
  // mock code2session：code=bad_* → 40029；否则 openid = op_{run}_{code}
  mockWx = createServer((req, res) => {
    const code = new URL(req.url ?? "/", "http://x").searchParams.get("js_code") ?? "";
    res.setHeader("content-type", "application/json");
    if (code.startsWith("bad_")) { res.end(JSON.stringify({ errcode: 40029, errmsg: "invalid code" })); return; }
    res.end(JSON.stringify({ openid: `op_${run}_${code}`, session_key: `sk_${code}` }));
  });
  await new Promise<void>((r) => mockWx.listen(0, "127.0.0.1", r));
  const addr = mockWx.address();
  process.env.WX_CODE2SESSION_URL = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/sns/jscode2session`;
});

after(async () => {
  mockWx?.close();
  const pool = getPool();
  for (const u of createdUids) {
    await pool.execute("DELETE FROM login_audit WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await cleanupUser(u);
    await clientFor(u).unlink(kSess(u));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  await pool.execute("DELETE FROM login_audit WHERE user_id IS NULL AND created_at > NOW() - INTERVAL 1 HOUR AND reason LIKE 'code2session:%'");
  for (const ip of usedIps) { await clientForKey(kRl(`login:${ip}`)).unlink(kRl(`login:${ip}`)); }
  await closeRedis();
  await closeMysql();
});

const login = async (code: string) => {
  const s = await wxLogin({ code, ip: freshIp() });
  if (!createdUids.includes(s.userId)) { createdUids.push(s.userId); }
  return s;
};

test("新号 wx-login：建号 + 出参只有 userId/token/isNew（09·G8）", async () => {
  const s = await login("alice");
  assert.match(s.userId, /^u_\d+$/);
  assert.deepEqual(Object.keys(s).sort(), ["isNew", "token", "userId"]); // ⛔ openid/unionid/session_key 不下发
  assert.equal((s as { isNew?: boolean }).isNew, true, "新建账号 isNew=true（shared ILoginRes 契约）");
  // Redis 档已建（建号合法创建点），fence/ver/schemaVersion 齐
  const h = await clientFor(s.userId).hmget(kUser(s.userId), "fence", "ver", "schemaVersion", "stamina");
  assert.deepEqual(h, ["0", "0", "1", "30"]);
  // 活跃索引已积累（冷档候选，08）
  const b = activeLruBucketOf(s.userId);
  assert.ok(await indexClientFor(b).zscore(kActiveLru(b), s.userId));
  // 审计行在
  const [audit] = await getPool().query<RowDataPacket[]>(
    "SELECT event FROM login_audit WHERE user_id = ? ORDER BY id DESC LIMIT 1", [s.userId]);
  assert.equal(audit[0].event, "wx_login");
  // token 可验
  await verifySession(s.userId, s.token);
  await verifySessionStrict(s.userId, s.token);
});

test("同 openid 再登录 → 同一 user_id；无效 code → AUTH_REQUIRED", async () => {
  const a = await login("bob");
  const b = await login("bob"); // mock 对同 code 返回同 openid
  assert.equal(a.userId, b.userId);
  await assert.rejects(login("bad_x"), AuthRequiredError);
  // 旧 token 已被轮换（单端互踢，待 M0 多端拍板）
  await assert.rejects(verifySession(a.userId, a.token), AuthRequiredError);
  await verifySession(b.userId, b.token);
});

test("封号：存量 token 立即失效 + 重新 wx-login 被 403 拒（09·G7）", async () => {
  const s = await login("carol");
  await banUser(s.userId, "test-ban");
  await assert.rejects(verifySession(s.userId, s.token), AuthRequiredError); // ① sess 已删，立即失效
  await assert.rejects(login("carol"), BannedError);                        // ② 签发前 SELECT status 拦住
});

test("failover 复活会话被 token_epoch 拦（verifySessionStrict）", async () => {
  const s = await login("frank");
  // 模拟：MySQL epoch 已 +1（踢人已写权威），但 sess 因 failover 从旧副本复活（未被删）
  await getPool().execute("UPDATE accounts SET token_epoch = token_epoch + 1 WHERE user_id = ?", [s.userId]);
  await verifySession(s.userId, s.token); // 快路径看不出（sess 还在）
  await assert.rejects(verifySessionStrict(s.userId, s.token), EpochStaleError); // 严格路径拦住
  await assert.rejects(verifySession(s.userId, s.token), AuthRequiredError);     // 且就地清除了复活会话
});

test("登录限流：同 IP 超容量 → RATE_LIMITED（独立严格档）", async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i++) { await wxLogin({ code: "grace", ip }); } // 容量 5
  await assert.rejects(wxLogin({ code: "grace", ip }), RateLimitedError);
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT user_id FROM accounts WHERE openid = ?", [`op_${run}_grace`]);
  if (rows.length > 0 && !createdUids.includes(rows[0].user_id as string)) { createdUids.push(rows[0].user_id as string); }
});
