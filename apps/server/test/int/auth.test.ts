/**
 * M3 DoD 集成测试（10·M3）——真实 MySQL + Redis，微信 code2session 用本地 mock HTTP 服务：
 *  1. 新号建档 + 出参不含 openid/session_key（09·G8）
 *  2. 同 openid 再登录找回同一 user_id
 *  3. 封号后：存量 token 立即失效 + 重新 wx-login 被拒（09·G7）
 *  4. failover 复活会话被权威 token_hash 拦（verifySessionStrict）
 *  5. 登录限流独立严格档
 *（Arthur 的「存量账号绑定」用例未移植：本项目无旧账号体系）
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { verifySession } from "../../src/core/auth/session";
import { banUser } from "../../src/core/auth/ban";
import { verifySessionStrict } from "../../src/platform/inProcessAccount";
import { _resetBreaker } from "@game/webplatform/lib";
import { wxLogin } from "../../src/platform/inProcessLogin";
import { AuthRequiredError, BannedError, RateLimitedError } from "../../src/core/errors";
import { activeLruBucketOf, kActiveLru, kLock, kRl, kSess, kUser, zoneCtx } from "../../src/core/infra/keys";
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
  // 登录只建 accounts 行、⛔ 不建游戏档（DUAL_MODE §2.7：基础档改由 onJoin 的 ensureCharacter 建）
  assert.equal(await clientFor(s.userId).exists(kUser(s.userId)), 0, "登录不建游戏档（挪到 onJoin 建角）");
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

test("封号 = 下次登不上：权威即拒 + 重新 wx-login 被 403 拒（09·G7 / M12d §2.3）", async () => {
  const s = await login("carol");
  await banUser(s.userId, "test-ban");
  // ① 权威（status=1 + token_hash=NULL）：建连级 strict 校验即拒（在线连接由 GM 踢收敛，§2.3 SOP）
  await assert.rejects(verifySessionStrict(s.userId, s.token), AuthRequiredError);
  await assert.rejects(login("carol"), BannedError);                        // ② 签发前 SELECT status 拦住
});

test("failover 复活会话被权威 token_hash 拦（verifySessionStrict）", async () => {
  const s = await login("frank");
  // 模拟：权威已撤销（token_hash=NULL），但 sess 因 failover 从旧副本复活（未被删）
  await getPool().execute("UPDATE accounts SET token_hash = NULL WHERE user_id = ?", [s.userId]);
  await verifySession(s.userId, s.token); // 快路径看不出（纯缓存比对，sess 还在）
  await assert.rejects(verifySessionStrict(s.userId, s.token), AuthRequiredError); // 严格路径回权威拦住
});

test("快路径纯缓存：账号侧撤销后组 sess 未清 → 快路径仍放行（故封号 SOP 必须踢，§2.3）", async () => {
  const s = await login("reverify");
  await verifySession(s.userId, s.token);
  // 账号侧撤销（token_hash=NULL）但组 sess 未动：快路径 ⛔ 不回权威，**依然放行**——
  // 这正是「封号必须由 GM 工具踢在线」的原因（缺踢则在场连接活到 sess TTL，无自动收敛）。
  await getPool().execute("UPDATE accounts SET token_hash = NULL WHERE user_id = ?", [s.userId]);
  await verifySession(s.userId, s.token);
  // 权威路径（建连 onAuth / 重新登录）仍即时拒
  await assert.rejects(verifySessionStrict(s.userId, s.token), AuthRequiredError);
});

test("抢锁失败 → 权威/缓存分叉，但留下 login_diverged 审计（评审 [10]，决策=可观测不改结构）", async () => {
  const { createHash } = await import("node:crypto");
  const s1 = await login("divergent");
  const lockKey = zoneCtx.run({ sId: 0 }, () => kLock(s1.userId)); // 登录显式 sId=0（与区无关）
  // 模拟**另一实例**正持着这把锁（真实成因：该号正在 freeze/thaw，看门狗按秒续租）。
  // LOCK_TTL 5s > 登录抢锁预算 ~350–500ms（LOCK_RETRY_MAX=3）⇒ 本次登录必吃 BusyError。
  await clientFor(s1.userId).set(lockKey, "999999", "PX", 5000, "NX");
  try {
    await assert.rejects(login("divergent"), (e: unknown) => /BUSY|busy/i.test(String((e as Error)?.name ?? "")
      + String(e)), "抢锁失败必须是可重试 BUSY（客户端重登即自愈）");

    // ① 分叉确已发生：token 由 lib 在**进锁之前**签发落库，故权威已换发、组缓存还是旧的
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT token_hash FROM accounts WHERE user_id = ?", [s1.userId]);
    const cached = await clientFor(s1.userId).hget(kSess(s1.userId), "tokenHash");
    assert.equal(cached, createHash("sha256").update(s1.token).digest("hex"), "组缓存仍是旧 token 的 hash");
    assert.notEqual(rows[0].token_hash, cached, "权威已换发到那个**没人持有**的幽灵 token ⇒ 与缓存分叉");

    // ② 后果如文档所述：旧端在场连接（快路径纯缓存）继续放行，但新建连（strict 比权威）被拒
    await verifySession(s1.userId, s1.token);
    await assert.rejects(verifySessionStrict(s1.userId, s1.token), AuthRequiredError);

    // ③ 因此必须留痕——否则审计里只有一条「登录成功」，线上无从发现
    const [audit] = await getPool().query<RowDataPacket[]>(
      "SELECT reason FROM login_audit WHERE user_id = ? AND event = 'login_diverged'", [s1.userId]);
    assert.equal(audit.length, 1, "抢锁失败必须补一行 login_diverged 审计");
    assert.match(String(audit[0].reason), /权威已换发但组缓存未更新/);
  } finally {
    await clientFor(s1.userId).unlink(lockKey);
  }

  // ④ 客户端重登即自愈（新登录重新换发 + 写缓存 ⇒ 两存储回到一致）
  const s2 = await login("divergent");
  const [after] = await getPool().query<RowDataPacket[]>(
    "SELECT token_hash FROM accounts WHERE user_id = ?", [s2.userId]);
  assert.equal(await clientFor(s2.userId).hget(kSess(s2.userId), "tokenHash"), after[0].token_hash, "重登后一致");
});

test("输家路径 ⛔ 不记 login_diverged（正常顶号语义、两存储一致，记了只会刷噪音）", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => wxLogin({ code: "noise", ip: freshIp() })));
  const won = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ userId: string }>[];
  const uid = won[0].value.userId;
  if (!createdUids.includes(uid)) { createdUids.push(uid); }
  const [audit] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM login_audit WHERE user_id = ? AND event = 'login_diverged'", [uid]);
  assert.equal(Number(audit[0].n), 0, "并发登录的输家是干净的，⛔ 不该产出分叉审计");
});

test("登录限流：同 IP 超容量 → RATE_LIMITED（独立严格档）", async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i++) { await wxLogin({ code: "grace", ip }); } // 容量 5
  await assert.rejects(wxLogin({ code: "grace", ip }), RateLimitedError);
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT user_id FROM accounts WHERE openid = ?", [`op_${run}_grace`]);
  if (rows.length > 0 && !createdUids.includes(rows[0].user_id as string)) { createdUids.push(rows[0].user_id as string); }
});

test("并发登录定序：N 个同账号登录并发 → 两存储终态一致（⛔ 缓存不被陈旧 hash 覆盖）", async () => {
  const { createHash } = await import("node:crypto");
  const N = 6;
  const results = await Promise.allSettled(
    Array.from({ length: N }, () => wxLogin({ code: "race", ip: freshIp() })));
  const won = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ userId: string; token: string }>[];
  assert.ok(won.length >= 1, "至少一个成功");
  const uid = won[0].value.userId;
  if (!createdUids.includes(uid)) { createdUids.push(uid); }

  // 核心不变式：MySQL 权威 hash === Redis 组缓存 hash（曾经会分叉：输家覆盖赢家）
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT token_hash FROM accounts WHERE user_id = ?", [uid]);
  const cached = await clientFor(uid).hget(kSess(uid), "tokenHash");
  assert.equal(cached, rows[0].token_hash, "缓存与权威一致（⛔ 无分叉）");

  // 且那个 hash 必属于某个成功返回的 token（不是幽灵值）
  const owners = won.filter((r) => createHash("sha256").update(r.value.token).digest("hex") === cached);
  assert.equal(owners.length, 1, "终态 hash 恰属于其中一个成功登录");
  // 失败的那些必须是**可重试的 BUSY**（⛔ 不能是 500/内部错）
  for (const r of results.filter((x) => x.status === "rejected") as PromiseRejectedResult[]) {
    assert.match(String(r.reason), /BUSY|并发登录|busy/i, `失败必须是可重试 BUSY，实际：${String(r.reason)}`);
  }
});
