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
import { auditLogin, verifySession } from "../../src/core/auth/session";
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
    // `uni_<人>_<第几次>` → openid 每次都不同、unionid 恒定：模拟「同一个人换了 openid」
    // （appid/主体变更、存量导入）。⚠ 其余 code 一律**不返 unionid**，保持既有用例行为不变。
    const m = /^uni_([a-z]+)_/.exec(code);
    res.end(JSON.stringify(m
      ? { openid: `op_${run}_${code}`, unionid: `un_${run}_${m[1]}`, session_key: `sk_${code}` }
      : { openid: `op_${run}_${code}`, session_key: `sk_${code}` }));
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

test("审计 reason 超长必须钳制：⛔ 不能抛 ER_DATA_TOO_LONG 把封号/分叉审计弄丢", async () => {
  const s = await login("longreason");
  // ① 封号理由来自**运营输入**，长度不可控；而 banUser 末尾那句 auditLogin **无 catch** ⇒
  //    超长若抛错，会变成「权威已写 + 人已踢，接口却报失败」，运营以为没封上（实测 sql_mode
  //    含 STRICT_TRANS_TABLES：超长是抛 1406 而非截断）。
  const huge = "运营填的超长封号理由：" + "违规".repeat(300); // 611 字符，远超列宽
  await banUser(s.userId, huge);                              // ⛔ 不得抛
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT reason FROM login_audit WHERE user_id = ? AND event = 'ban'", [s.userId]);
  assert.equal(rows.length, 1, "封号审计必须落库（曾因超长整行写不进）");
  assert.ok(String(rows[0].reason).length <= 255, `reason 必须钳到组库列宽 255，实际 ${String(rows[0].reason).length}`);
  assert.ok(String(rows[0].reason).length > 64, "⛔ 组侧不该钳到 64：它写的是组库（bootstrap 保证 255），钳窄只丢运营填的封号理由");
  assert.ok(String(rows[0].reason).startsWith("运营填的超长封号理由："), "钳的是尾部，前缀信息保留");

  // ② 钳制发生在**写入侧**（两处 auditLogin 各一份）：split 下账号库没跑过加宽 DDL 时靠它兜底
  await auditLogin("login_diverged", s.userId, "x".repeat(1000), null, null); // ⛔ 不得抛
  const [d] = await getPool().query<RowDataPacket[]>(
    "SELECT CHAR_LENGTH(reason) AS n FROM login_audit WHERE user_id = ? AND event = 'login_diverged'", [s.userId]);
  // ⚠ 组侧钳到 **255**（组库列宽，schema.sql + db-bootstrap 保证），⛔ 不是 64：
  // 本文件的 auditLogin 用的是 MYSQL_URL 的**组库**、从不写账号库（那正是待办 W2 描述的事），
  // 所以"split 账号库可能还是旧列宽"这个理由对它不成立，钳窄只会白丢 login_diverged 的错误原文。
  assert.equal(Number(d[0].n), 255, "组侧钳到组库列宽 255");

  // ④ **接客户端 deviceId 的是 lib 那份 auditLogin**，不是组侧这份（组侧三个调用点全传 null）。
  //    未钳时的后果比 reason 更糟：token 已在 auditLogin 之前签发轮换 ⇒ 客户端收 500 拿不到
  //    新 token、审计也没有 = 又一条登录分叉。故机检要钉在 lib 那一份上。
  const { auditLogin: libAuditLogin } = await import("@game/webplatform/lib");
  await libAuditLogin("dev_login", s.userId, null, null, "d".repeat(200)); // ⛔ 不得抛
  const [dev] = await getPool().query<RowDataPacket[]>(
    "SELECT CHAR_LENGTH(device_id) AS n FROM login_audit WHERE user_id = ? AND event = 'dev_login'", [s.userId]);
  assert.equal(Number(dev[0].n), 64, "lib 侧 device_id 钳到列宽");

  // ③ ⛔ 不切断代理对。⚠ 理由**不是**"MySQL 会拒"——那句曾被写进注释/文档/commit 当成实测结论，
  //    实测其实是：孤代理在 Node→MySQL 的 utf8 编码里被替换成 U+FFFD，INSERT **照样成功**。
  //    所以钳制的失败形态是**静默内容损坏**，不切代理对是为了不产生这种损坏，⛔ 不是为了避免报错。
  await auditLogin("login_diverged", s.userId, "😀".repeat(200), null, null); // 400 个 UTF-16 单元
});

test("审计 ip 非法必须归一成 NULL：⛔ 不能让 INET6_ATON 抛 1411 把审计整行弄丢", async () => {
  const s = await login("badip");
  // ⚠ ip 与 deviceId **同源**（都来自客户端可写的 XFF），但此前只校验了 deviceId。
  //    `INSERT … INET6_ATON(?)` 在 STRICT_TRANS_TABLES 下遇非法串是**抛 1411**、不是写 NULL，
  //    而抛点在 issueToken **之后** ⇒ 权威 token_hash 已轮换成没人持有的值 + 客户端 500 + 零审计。
  //    `X-Forwarded-For: unknown` 就能打；LB 附端口（1.2.3.4:5678）则是部署级必现。
  // ⚠ 不含 " 1.2.3.4" 与 "1.2.3.4:5678"：前者的前后空白刻意容忍、后者刻意剥端口，两者归一后都是
  //   **合法 IP** ⇒ 属于"被救回来"而不是"非法"（下面 goodip 段正面钉它们）。判据同表见
  //   test/auth-primitives.test.ts —— ⛔ 别把"救回来"和"归成 NULL"混进同一个清单。
  const bad = ["unknown", "for=1.2.3.4", "", "::1%eth0", "1.2.3.4/24", "1.2.3.4, 5.6.7.8"];
  for (const ip of bad) {
    await auditLogin("login_diverged", s.userId, `badip:${ip}`, ip, null); // ⛔ 不得抛
  }
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT ip FROM login_audit WHERE user_id = ? AND reason LIKE 'badip:%'", [s.userId]);
  assert.equal(rows.length, bad.length, "非法 ip 不得让审计整行写不进");
  assert.ok(rows.every((r) => r.ip === null), "非法 ip 落 NULL（列可空，⛔ 别为了写它而丢整行）");

  // ⛔ 合法 ip 必须原样落库（别把归一写成"一律 NULL"那种假修）
  await auditLogin("login_diverged", s.userId, "goodip:v4", "203.0.113.9", null);
  await auditLogin("login_diverged", s.userId, "goodip:v6", "2001:db8::1", null);
  // 带端口的形态**剥端口后**应当保住真实 IP，⛔ 不是丢成 NULL
  await auditLogin("login_diverged", s.userId, "goodip:port", "203.0.113.10:443", null);
  const [good] = await getPool().query<RowDataPacket[]>(
    "SELECT reason, INET6_NTOA(ip) AS ip FROM login_audit WHERE user_id = ? AND reason LIKE 'goodip:%' ORDER BY id", [s.userId]);
  assert.deepEqual(good.map((r) => r.ip), ["203.0.113.9", "2001:db8::1", "203.0.113.10"]);
});

test("unionid 空串 ⛔ 不得当成身份：不同 openid 的人不能串成同一个账号", async () => {
  const { loginByOpenid } = await import("@game/webplatform/lib");
  // ⚠ code2session 返回 `unionid: ""` 时，若判据是 `!== null`，第一个人会把空串写进 accounts，
  //    之后**任何** openid 未命中的玩家都会 `WHERE unionid = ''` 命中那一行 ⇒ 以别人的身份登录
  //    并把原主人顶下线，且 isNew=false 让它看起来像"老号正常回归"。
  // ⚠ 用**完整** testUid（含 runId）：`.slice(-8)` 会把唯一前缀整个切掉、只剩固定的名字段，
  //   于是每次跑都复用同一批 openid ⇒ 一旦某轮中途抛错留下脏行，之后每轮都在读上一轮的残留。
  const tag = testUid("uniempty");
  const a = await loginByOpenid(`op_A_${tag}`, "", null, "10.8.0.1", null, "dev_login");
  if (a.ok) { createdUids.push(a.uid); } // ⛔ 先登记再断言：中途抛错也要能被 after() 清掉
  const b = await loginByOpenid(`op_B_${tag}`, "", null, "10.8.0.2", null, "dev_login");
  if (b.ok) { createdUids.push(b.uid); }
  assert.ok(a.ok && b.ok, "两次登录都应成功");
  assert.notEqual(a.ok && a.uid, b.ok && b.uid, "⛔ 不同 openid 必须是不同账号（空串不是身份）");
  assert.equal(b.ok && b.isNew, true, "第二个人是真新号，⛔ 不是「找回」别人的号");

  // ⚠ 更狠的一面：空串还**绝不能写进 accounts**。`uk_unionid` 上只容得下一行空串 ⇒ 第一个人
  //   写进去之后，之后每个新用户的 INSERT 都 1062，而恢复路径两个键都回读不到 ⇒ 原样抛 ⇒
  //   **新用户全部登不上**。所以断言落库值必须是 NULL，⛔ 不是 ''。
  const [accs] = await getPool().query<RowDataPacket[]>(
    "SELECT unionid FROM accounts WHERE user_id IN (?, ?)", [a.ok ? a.uid : "", b.ok ? b.uid : ""]);
  assert.equal(accs.length, 2);
  assert.ok(accs.every((r) => r.unionid === null), "空串必须归一成 NULL 入库（⛔ 不能落 ''）");

  // ⚠ **纯空白串同理**：`accounts.unionid` 是 ascii_bin，MySQL 的 PAD SPACE 语义下 '   ' 与 ''
  //   在 uk_unionid 上等价 ⇒ 判据若只看 `length > 0`，空白串会把刚堵掉的串号形态原样重演。
  const c = await loginByOpenid(`op_C_${tag}`, "   ", null, "10.8.0.3", null, "dev_login");
  if (c.ok) { createdUids.push(c.uid); }
  assert.ok(c.ok && c.isNew, "空白 unionid 的第三个人仍是新号（⛔ 不得命中前两个）");
  const [c3] = await getPool().query<RowDataPacket[]>(
    "SELECT unionid FROM accounts WHERE user_id = ?", [c.ok ? c.uid : ""]);
  assert.equal(c3[0].unionid, null, "空白串同样必须归一成 NULL");
});

test("unionid 回填：绑开放平台前建的号，之后 openid 变更仍能找回（⛔ 不产生同人双号）", async () => {
  const { loginByOpenid } = await import("@game/webplatform/lib");
  // ⚠ 小游戏的 unionid 只有绑了开放平台才下发，绑定发生在运营中途是常态 ⇒ 绑定前建的号 unionid 恒 NULL。
  //    只查不回填的话，等这些号 openid 真变了（appid/主体变更——正是按 unionid 找回所针对的场景），
  //    openid 查不到、unionid 也查不到（旧行是 NULL）⇒ 建第二个号：玩家丢档 + isNew 又变回 true。
  const tag = testUid("unifill"); // ⚠ 完整 id，理由同上一条用例
  const uni = `UNI_${tag}`;
  // ① 首登：还没绑开放平台，无 unionid
  const first = await loginByOpenid(`op1_${tag}`, null, null, "10.8.1.1", null, "dev_login");
  if (first.ok) { createdUids.push(first.uid); } // ⛔ 先登记再断言
  assert.ok(first.ok);
  // ② 绑定后同 openid 再登：应把 unionid 补进那一行
  const second = await loginByOpenid(`op1_${tag}`, uni, null, "10.8.1.2", null, "dev_login");
  assert.ok(second.ok && first.ok && second.uid === first.uid, "同 openid 仍是同一账号");
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT unionid FROM accounts WHERE user_id = ?", [first.ok ? first.uid : ""]);
  assert.equal(rows[0].unionid, uni, "⛔ 回填必须发生，否则下一步的 openid 变更就会丢档");
  // ③ 主体变更导致 openid 变了：靠回填进去的 unionid 找回同一个号
  const third = await loginByOpenid(`op2_${tag}`, uni, null, "10.8.1.3", null, "dev_login");
  assert.ok(third.ok && first.ok && third.uid === first.uid, "openid 变更后仍是同一账号（⛔ 不建第二个号）");
  assert.equal(third.ok && third.isNew, false, "⛔ isNew 不得再变回 true（首登奖励/首充判据会重复触发）");
  // ④ 回填是**增量**：⛔ 不覆盖已有值（这与"不改写 openid"是两条不同的纪律，别混）
  const fourth = await loginByOpenid(`op1_${tag}`, `OTHER_${tag}`, null, "10.8.1.4", null, "dev_login");
  assert.ok(fourth.ok);
  const [after] = await getPool().query<RowDataPacket[]>(
    "SELECT unionid FROM accounts WHERE user_id = ?", [first.ok ? first.uid : ""]);
  assert.equal(after[0].unionid, uni, "已有 unionid ⛔ 不得被后来的值覆盖");
});

test("换过 openid 的老号：按 unionid 找回 → isNew=false 且 ⛔ 不烧 seq（评审 P2）", async () => {
  const seqOf = async (): Promise<number> => {
    const [r] = await getPool().query<RowDataPacket[]>("SELECT val FROM seq WHERE name = 'user_id'");
    return Number(r[0].val);
  };
  // ① 首登：真新号
  const first = await login("uni_alice_1");
  assert.equal(first.isNew, true, "首登是新号");

  // ② 同一个人换了 openid（unionid 不变）再登：必须找回同一账号，且**不是新号**
  const seqBefore = await seqOf();
  const again = await login("uni_alice_2");
  assert.equal(again.userId, first.userId, "按 unionid 找回同一账号");
  assert.equal(again.isNew, false,
    "⛔ 恒 isNew=true 会让首登奖励/首充判据对老号反复触发（此前 isNew 在 unionid 回读之前就算好了）");

  // ③ 且不再走「发一条注定失败的 INSERT」那条路：seq 不该被烧
  assert.equal(await seqOf(), seqBefore, "⛔ 老号登录不得消耗 user_id 发号（此前每次登录烧一个）");

  // ④ 再登一次仍然稳定（本次没改写 accounts.openid，故走的仍是 unionid 分支——钉住这个已知形态）
  const third = await login("uni_alice_3");
  assert.equal(third.userId, first.userId);
  assert.equal(third.isNew, false);
  assert.equal(await seqOf(), seqBefore, "多次重复登录也不烧 seq");
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

test("unionid 回填撞 uk_unionid：⛔ 不能只留 console —— 必须落 login_dual_account 审计", async () => {
  // ⚠ 评审逮到的静默分叉：上一版把 backfillUnionid 的异常"一律吞"（为了不把本可成功的登录打成 500），
  //   连 1062 也吞成了纯 console.warn。而 1062 恰恰意味着**同一微信身份已经落成两个 uid**：
  //   真实资产分叉（首登奖励重发、充值/存档劈成两半）且**永不自愈**——后续每次登录都撞同一个键。
  // ⚠ 纯**顺序三步**即可复现，⛔ 不需要并发（同事原话说的是并发竞态，实测顺序就够）。
  const { loginByOpenid } = await import("@game/webplatform/lib");
  const tag = `dual${Date.now().toString(36)}`;
  const uni = `UNI_${tag}`;
  // ① 甲：一开始就带 unionid 建号 ⇒ 占住 uk_unionid
  const a = await loginByOpenid(`opA_${tag}`, uni, null, "10.8.2.1", null, "dev_login");
  assert.ok(a.ok, "甲建号成功");
  if (a.ok) { createdUids.push(a.uid); }
  // ② 乙：绑开放平台**之前**注册（unionid=NULL），是另一个 uid
  const b = await loginByOpenid(`opB_${tag}`, null, null, "10.8.2.2", null, "dev_login");
  assert.ok(b.ok, "乙建号成功");
  if (b.ok) { createdUids.push(b.uid); }
  assert.notEqual(a.ok && a.uid, b.ok && b.uid, "两个 uid（同一个人的两个号，正是要被发现的状态）");
  // ③ 乙绑定后带着**同一个** unionid 再登：回填 UPDATE 撞甲占住的 uk_unionid → 1062
  const b2 = await loginByOpenid(`opB_${tag}`, uni, null, "10.8.2.3", null, "dev_login");
  assert.ok(b2.ok, "⛔ 登录本身必须照常成功（回填是锦上添花，异常一律吞）");

  const [audit] = await getPool().query<RowDataPacket[]>(
    "SELECT reason FROM login_audit WHERE user_id = ? AND event = 'login_dual_account'",
    [b.ok ? b.uid : ""]);
  assert.equal(audit.length, 1, "⛔ 必须留下 login_dual_account 审计行（只 console 在生产等于没有）");
  assert.match(String(audit[0].reason), /uk_unionid/, "reason 要说清是撞了哪个键");
  assert.doesNotMatch(String(audit[0].reason), new RegExp(uni), "⛔ 不得写 unionid 明文（09·G8），只留前缀");
});
