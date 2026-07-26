/**
 * 登录编排（WebPlatform lib，DUAL_MODE §2.7）：限流(进程内) → code2session(wx) → 查/建 accounts(签发前查 status，G7)
 * → issueToken → last_login + 审计。**返回结果码**（跨包边界，业务侧/端点映射错误类）。
 * ⛔ 无 Redis、⛔ 不建游戏档（createUser 挪 onJoin 的 ensureCharacter）、⛔ 无跨存储补偿（已解耦）。
 */
import { LOGIN_RATE_CAPACITY, LOGIN_RATE_REFILL_PER_S } from "../config";
import { getPool, nextSeq } from "./mysql";
import type { ResultSetHeader, RowDataPacket } from "./mysql";
import { auditLogin, issueToken } from "./auth";
import { code2session } from "./wxClient";

export type LoginResult =
  // ⚠ `issuedAtMs`：权威侧签发时刻（严格递增），in-process 侧拿它做组缓存写入栅栏（A1）
  | { ok: true; uid: string; token: string; isNew: boolean; issuedAtMs: number }
  | { ok: false; reason: "banned" | "rate_limited" | "wx_invalid" | "wx_rate_limited" | "wx_unavailable" };

// 进程内登录限流令牌桶（per WebPlatform 实例；规模化靠前置 LB 按 IP，§2.7）。按真实 IP，⛔ 不共享桶连坐（G5）。
const buckets = new Map<string, { tokens: number; last: number }>();
/**
 * 桶表清扫阈值。⚠ 没有清扫时这张表**只增不减**：本服务当前无鉴权（W1，2026-07-26 定案为「边界交给
 * VPC + 安全组」⇒ 不再是上线阻断，但**风险是接受不是消失**：VPC 内任一机器都够得着本进程），
 * 直连者每次换一个 IP 就能永久占一格内存。**已满的桶不含任何信息**（与从未见过的 IP 等价），
 * 故删掉它是语义无损的 —— 这也是清扫条件只看"是否已回满"的原因。
 */
const RL_SWEEP_AT = 10_000;
/**
 * 两次清扫的最小间隔。⚠ **只有条目数阈值是不够的**：桶被消耗 1 个令牌后要
 * `1/LOGIN_RATE_REFILL_PER_S` 秒才回满，在此之前**一个都删不掉** ⇒ 攻击速率高到稳态表大小
 * 恒 ≥ 阈值时，`rateAllow` 会在**每个请求**上全表扫一遍（O(n) × n 次），把一个内存问题换成
 * 单线程事件循环上的 CPU 放大。加一道时间闸即可：清不动的时候就别反复清。
 */
const RL_SWEEP_MIN_INTERVAL_MS = 1_000;
let lastSweepAt = 0;
function sweepFullBuckets(now: number): void {
  lastSweepAt = now;
  for (const [ip, b] of buckets) {
    if (b.tokens + ((now - b.last) / 1000) * LOGIN_RATE_REFILL_PER_S >= LOGIN_RATE_CAPACITY) { buckets.delete(ip); }
  }
}
function rateAllow(ip: string): boolean {
  const now = Date.now();
  if (buckets.size >= RL_SWEEP_AT && now - lastSweepAt >= RL_SWEEP_MIN_INTERVAL_MS) { sweepFullBuckets(now); }
  let b = buckets.get(ip);
  if (!b) { b = { tokens: LOGIN_RATE_CAPACITY, last: now }; buckets.set(ip, b); }
  b.tokens = Math.min(LOGIN_RATE_CAPACITY, b.tokens + ((now - b.last) / 1000) * LOGIN_RATE_REFILL_PER_S);
  b.last = now;
  if (b.tokens < 1) { return false; }
  b.tokens -= 1;
  return true;
}

interface AccountRow extends RowDataPacket { user_id: string; status: number; unionid: string | null }

/**
 * 「这个 unionid 能不能用来找回同一个人」。⛔ 空串不算。
 *
 * ⚠ 判据必须是**非空**而不是 `!== null`：`WHERE unionid = ''` 会命中**第一个**写进空串的账号，
 * 于是任何 openid 未命中的玩家都以那个人的身份登录（并把他顶下线）。产地 `wxClient.ts` 已用
 * `|| null` 收敛一次，这里是第二道 —— `loginByOpenid` 是导出函数，⛔ 不能假设调用方都干净。
 * ⚠ **先 trim 再判**（与同层的 `normalizeIp` 一致）：`accounts.unionid` 是 `ascii_bin`，MySQL 的
 * PAD SPACE 语义下 `'   '` 与 `''` 在 `uk_unionid` 上**等价** ⇒ 只判 `length > 0` 的话，纯空白串
 * 会原样通过三道归一、当身份键去查去写，把刚堵掉的串号形态用另一个值重演一遍。
 */
const usableUnionid = (u: string | null): u is string => u !== null && u.trim().length > 0;

/**
 * 建号：seq 发 user_id（同连接纪律在 nextSeq，09·DB2）→ accounts 行。⛔ 不建游戏档。
 *
 * 返回 `created` 标明**本次是否真的新建**：1062 恢复回读到的是**已存在的号**（并发赢家 / 同人换 openid），
 * 调用方据此定 `isNew` —— ⛔ 恒 true 会让首登奖励/首充判据对老号反复触发。
 */
async function createAccount(openid: string, rawUnionid: string | null): Promise<{ row: AccountRow; created: boolean }> {
  // ⚠ 第三道：空串**绝不能进 INSERT**（`uk_unionid` 只容一行空串 ⇒ 之后每个新用户都 1062 且恢复
  // 回读不到 ⇒ 新用户全部登不上）。本函数也可能被将来的调用方直接用到，故自己也归一。
  const unionid = usableUnionid(rawUnionid) ? rawUnionid : null;
  const uid = `u_${await nextSeq("user_id")}`;
  try {
    await getPool().execute<ResultSetHeader>(
      "INSERT INTO accounts (user_id, openid, unionid) VALUES (?,?,?)", [uid, openid, unionid]);
  } catch (e) {
    if ((e as { errno?: number }).errno === 1062) {
      // 撞唯一键 → 回读复用（发出去的 seq 号作废安全，只需单调）。
      // ⚠ accounts 有**两个**唯一键，两个都要兜，只兜 openid 会让另一个键的冲突落到下方 throw ⇒ 500：
      //   `uk_openid`  —— 并发建号对方赢了（常态路径）；
      //   `uk_unionid` —— 本人已有行但 openid 不同（appid/主体变更、存量导入、微信侧异常）。
      //     unionid 在同一开放平台主体下标识**同一个人**，复用该行即正确的账号连续性。
      //     ⛔ 不顺手改写该行 openid：静默重写身份列的风险高于多走一次本恢复路径。
      // 顺序：openid 更精确故先查；两键皆未命中说明撞的不是这两个键 ⇒ 原样抛，不吞。
      const [byOpenid] = await getPool().query<AccountRow[]>(
        "SELECT user_id, status, unionid FROM accounts WHERE openid = ?", [openid]);
      if (byOpenid.length > 0) { return { row: byOpenid[0], created: false }; }
      if (unionid !== null) {
        const [byUnionid] = await getPool().query<AccountRow[]>(
          "SELECT user_id, status, unionid FROM accounts WHERE unionid = ?", [unionid]);
        if (byUnionid.length > 0) { return { row: byUnionid[0], created: false }; }
      }
    }
    throw e;
  }
  return { row: { user_id: uid, status: 0, unionid } as AccountRow, created: true };
}

/**
 * 把 `unionid` 补进一个还没有它的已有行（**纯增量**，`WHERE unionid IS NULL` 保证不覆盖）。
 *
 * ⚠ 为什么必须补：小游戏的 unionid **只有绑了开放平台才下发**，而绑定发生在运营中途是常态 ⇒
 * 绑定之前建的号 `accounts.unionid` 永远是 NULL。等这些号的 openid 真变了（appid/主体变更——
 * 正是按 unionid 回读所针对的那个场景），openid 查不到、unionid 也查不到（旧行是 NULL）⇒
 * 建**第二个账号**：玩家丢档，且 `isNew` 又变回 true（首登奖励/首充判据再触发一次）。
 * ⚠ 这与「⛔ 不顺手改写命中行的 openid」**不是一回事**，别当成同一条决策撤掉：
 * 改写 openid 是**覆盖身份列**（有静默改身份的风险），补一个 NULL 是**增量**，无覆盖。
 */
async function backfillUnionid(uid: string, unionid: string): Promise<void> {
  try {
    await getPool().execute<ResultSetHeader>(
      "UPDATE accounts SET unionid = ? WHERE user_id = ? AND unionid IS NULL", [unionid, uid]);
  } catch (e) {
    // ⚠ **一律吞掉，⛔ 不 rethrow**：本函数是锦上添花（补一个可空列），而调用点在主干上裸 await
    // ⇒ 任何 rethrow 都会把一次**本来能成功**的老号登录打成 500。曾经只吞 1062，剩下的抛出去，
    // 那条缝是真能走到的：unionid 超 64 字符 → 1406、非 ascii → 1366（列是 VARCHAR(64) ascii），
    // 而这两种情况下账号是 openid 命中的老号、后续步骤根本不碰 unionid，本可正常登录；更糟的是
    // 该列仍为 NULL ⇒ **此后每次登录都再撞一次**，那个用户就永久登不上了。
    const errno = (e as { errno?: number }).errno;
    console.warn(`[login] unionid 回填失败（errno=${String(errno)}，⛔ 不影响本次登录，需人工跟进）`, uid);
    // ⚠ **1062 必须留 durable 痕迹**（评审逮到：上一版"一律吞"把它也吞成了纯 console）：
    // 1062 = 该 unionid 已被**另一行**占用 ⇒ 同一个微信身份**确实已经落成两个 uid**（本行 uid 与
    // 占用者），是真实资产分叉：首登奖励重发、充值/存档劈成两半，且**永不自愈**——后续每次登录
    // 都走同一条路、撞同一个键、再吞一次。console 在生产里等于没有（E3 观测出口还没做）。
    // ⛔ 只对 1062 写：1406/1366 是上游给了畸形 unionid（无双号事实），写了只会淹掉真信号。
    // 形状抄 inProcessLogin 的 login_diverged：`.catch()` 兜住（审计失败⛔不能反过来弄坏登录）、
    // 长度交给 auditLogin 的 clamp（⛔ 不在这里裸 slice）。
    // ⛔ 不写 unionid 明文（09·G8 禁出参含 openid/unionid，审计同理）——只留可对账的前 8 位。
    if (errno === 1062) {
      await auditLogin("login_dual_account", uid,
        `unionid 回填撞 uk_unionid：同一微信身份已存在另一个 uid（unionid 前缀 ${unionid.slice(0, 8)}…）`,
        null, null)
        .catch((ae: unknown) => { console.error("[login] 双号审计写入失败", uid, ae); });
    }
  }
}

/** 按 openid 登录（dev 直连 / wx 经 code2session 后的公共段）。签发前必查 status（G7）。 */
export async function loginByOpenid(
  openid: string, rawUnionid: string | null, sessionKey: string | null,
  ip: string, deviceId: string | null, auditKind: string, sId: number,
): Promise<LoginResult> {
  // ⚠ **入口处一次性归一，⛔ 不在每个用到的地方各判各的**：空串既不能用来查（会命中别人的号），
  // 也**绝不能写进 accounts** —— `uk_unionid` 上只容得下一行空串，第一个人写进去之后，
  // 之后**每一个新用户**的 INSERT 都 1062，而恢复路径两个键都回读不到 ⇒ 原样抛 ⇒ **新用户全都登不上**。
  // （产地 `wxClient.ts` 已用 `|| null` 收敛一次；本函数是导出的，⛔ 不能假设调用方都干净。）
  const unionid = usableUnionid(rawUnionid) ? rawUnionid : null;
  const [rows] = await getPool().query<AccountRow[]>(
    "SELECT user_id, status, unionid FROM accounts WHERE openid = ?", [openid]);
  let account = rows[0];
  let isNew = false;
  // openid 命中但该行还没 unionid ⇒ 补上（见 backfillUnionid：只查不写的话，绑开放平台之前
  // 建的号在 openid 变更时会丢档）。⚠ 放在 issueToken **之前**：万一抛错也还没签发 token，
  // 是干净的 500，⛔ 不会留下"权威已轮换、客户端没拿到"的幽灵 token。
  if (account !== undefined && account.unionid === null && unionid !== null) {
    await backfillUnionid(account.user_id, unionid);
  }
  // ⚠ **openid 没查到 ≠ 新号**：同一开放平台主体下 `unionid` 标识**同一个人**，openid 变更
  // （appid/主体变更、存量导入、微信侧异常）时该账号仍在。此前只在 INSERT 撞 1062 的**异常路径**里
  // 才按 unionid 回读，而 `isNew` 早在那之前就按 openid 算好了 ⇒ 老号每次登录都：烧一个 seq 号、
  // 发一条注定失败的 INSERT、回读旧账号，并**恒返回 isNew:true**（首登奖励/首充判据会反复触发）。
  // 提到正常路径来查即同时解决三者；1062 恢复保留为**并发**兜底（见 createAccount）。
  if (account === undefined && unionid !== null) {
    const [byUnionid] = await getPool().query<AccountRow[]>(
      "SELECT user_id, status, unionid FROM accounts WHERE unionid = ?", [unionid]);
    account = byUnionid[0];
  }
  if (account === undefined) {
    const created = await createAccount(openid, unionid);
    account = created.row;
    isNew = created.created; // ⛔ 不能恒 true：并发下 1062 恢复回读到的是**别人刚建的同一个号**
  }
  if (Number(account.status) !== 0) {
    await auditLogin("fail", account.user_id, "banned", ip, deviceId);
    return { ok: false, reason: "banned" };
  }
  const { token, issuedAtMs } = await issueToken(account.user_id, sId, sessionKey);
  await getPool().execute<ResultSetHeader>(
    "UPDATE accounts SET last_login_at = NOW(3) WHERE user_id = ?", [account.user_id]);
  await auditLogin(auditKind, account.user_id, null, ip, deviceId);
  return { ok: true, uid: account.user_id, token, isNew, issuedAtMs };
}

export interface WxLoginInput {
  code: string; ip: string; deviceId?: string | null;
  /** 要登录的区（M12e：单端语义作用域 = `(账号, 区)`）。缺省 0 = 大混服/单形态。 */
  sId?: number;
}

/** wx-login：限流 → code2session → loginByOpenid。⚠ 限流在 code2session **之前**（否则刷子先烧微信配额，G5）。 */
export async function wxLogin(input: WxLoginInput): Promise<LoginResult> {
  if (!rateAllow(input.ip)) { return { ok: false, reason: "rate_limited" }; }
  const wx = await code2session(input.code);
  if (!wx.ok) {
    await auditLogin("fail", null, `code2session:${wx.reason}`, input.ip, input.deviceId ?? null);
    return { ok: false, reason: wx.reason };
  }
  return loginByOpenid(wx.openid, wx.unionid, wx.sessionKey, input.ip, input.deviceId ?? null, "wx_login", input.sId ?? 0);
}

/** dev-login：限流 → devKey 映射 openid（`dev_<devKey>`）→ loginByOpenid。 */
export async function devLogin(devKey: string, ip: string, deviceId: string | null, sId = 0): Promise<LoginResult> {
  if (!rateAllow(ip)) { return { ok: false, reason: "rate_limited" }; }
  return loginByOpenid(`dev_${devKey}`, null, null, ip, deviceId, "dev_login", sId);
}
