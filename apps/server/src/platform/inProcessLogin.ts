/**
 * 组网关侧登录入口 —— **薄委托**（M12c / DUAL_MODE §2.7）。
 *
 * 登录 orchestration（限流 → code2session → 查/建账号 → 签发 token）已下沉 WebPlatform lib
 * （`@game/webplatform/lib`，MySQL 权威、⛔ 无 Redis、返回**结果码**）。本文件只做两件网关侧的事：
 *   ① lib 结果码 reason → 网关错误类映射（07 边界）；
 *   ② 成功后写组侧 sess:{uid} 缓存（in-process 登录同进程即写；split 拆进程后由 onAuth 懒填）。
 *
 * 出参⛔禁含 openid / unionid / session_key（09·G8）。
 * 注：Arthur 的「存量账号绑定」（旧 deviceId → openid 回填）本项目无存量账号，未移植。
 */
import { devLogin as libDevLogin, verifyToken, wxLogin as libWxLogin, type LoginResult as LibLoginResult } from "@game/webplatform/lib";
import { AuthRequiredError, BannedError, BusyError, RateLimitedError, WxUnavailableError } from "../core/errors";
import { auditLogin, writeGroupSess } from "../core/auth/session";
import { withUserLock } from "../core/locks";
import { zoneCtx } from "../core/infra/keys";

export interface WxLoginInput { code: string; ip: string; deviceId?: string }

/** 登录出参（shared ILoginRes 服务端侧）：⛔ 禁含 openid/unionid/session_key（09·G8）。 */
export interface LoginResult { userId: string; token: string; isNew: boolean }

type LoginFailReason = Extract<LibLoginResult, { ok: false }>["reason"];

/** lib 结果码 reason → 网关错误类（HTTP/RPC 边界映射，07）。wx_unavailable → INTERNAL(500)。 */
function loginFail(reason: LoginFailReason): never {
  switch (reason) {
    case "banned": throw new BannedError();
    case "rate_limited": throw new RateLimitedError("登录过于频繁");
    case "wx_rate_limited": throw new RateLimitedError("wx api rate limited");
    case "wx_invalid": throw new AuthRequiredError("wx code invalid");
    case "wx_unavailable": throw new WxUnavailableError("wx unavailable");
    default: { const _exhaustive: never = reason; throw new Error(`未处理的登录失败码: ${String(_exhaustive)}`); }
  }
}

/**
 * 成功收尾：**回权威确认本次签发仍有效**，再写组侧 sess 缓存。
 *
 * ⚠ **并发登录定序**（同 uid 两次登录几乎同时）：MySQL 行锁把两次 `issueToken` 串起来、
 * 最后落库者是权威赢家；但两次 `writeGroupSess` 各写各的，**晚落地的早登录会用陈旧 hash
 * 覆盖缓存** ⇒ 缓存与权威分叉：**输家凭缓存继续玩，赢家每条 RPC 401 且被顶号广播踢掉**
 * （判别位 `exceptHash` 恰好保护的是输家）。
 *
 * 修法 = 把「回权威 + 写缓存」放进**同一把 per-uid 锁**串行：
 * - 锁内 `verifyToken` 识别出输家 ⇒ ⛔ 不写缓存、⛔ 不广播踢，向客户端报**可重试**错误（BUSY）；
 *   客户端重登即成为新的赢家（正常顶号语义）。
 * - 无论如何交错，最后一个持锁者读到的都是已结算的 MySQL 状态 ⇒ 两存储终态一致。
 *
 * ⚠ 复用**唯一那把** per-uid 锁（09·L1 禁第二把）；它是 per-zone 键、而登录本就与区无关，
 * 故显式 `sId=0`（区服部署下与各区玩法锁不同键，互不阻塞）。
 * ⚠ split 不走本路径（登录在 WebPlatform、缓存由 onAuth 回权威后懒填）。
 * ⛔ **但别读成「split 没有这类竞态」**（此处曾写"天然无此竞态"，是错的）：split 只是没有**本路径**
 * 这一条，它自己那条在 `platform/httpAccount.ts` —— `remoteVerify` 与 `writeGroupSess` 是**两个 await、
 * 中间可任意交错且无 fence**，迟到的旧写不仅覆盖缓存，还会因判别位是本次 newHash 而**反手踢掉合法的新登录端**，
 * 且快路径零回源 ⇒ 旧 token 一路放行到 sess TTL(3d)。登记见 todo.md「split 会话写入无 fence」。
 *
 * ⚠ **已知残留分叉：抢锁失败 / 写缓存失败**（in-process 独有，评审 [10]，决策=可观测不改结构）。
 * token 由 lib 在**进锁之前**就签发落库了，故本函数**非输家路径**上的任何抛错都留下：
 * MySQL=本次新 hash（客户端拿到的却是 409，**没人持有**＝幽灵 token）、组 sess=旧 hash、
 * 审计已记一行登录**成功**。后果：旧端在场连接走快路径（纯缓存比对）**继续放行**，但任何
 * 新建连走 strict 比对权威即被拒 ⇒「能玩到掉线为止，一掉线就登不回来」；且**没广播顶号踢**
 * （踢在 writeGroupSess 里，压根没跑到）。客户端重登即自愈（新登录重新换发并写缓存）。
 * 因此这里**补一行 `login_diverged` 审计**——线上出现时能从审计定位，而不是只看到一条成功。
 * ⛔ 输家路径不记（那是正常顶号语义、两存储一致，记了只会在每次顶号竞态刷噪音）。
 */
async function finish(r: Extract<LibLoginResult, { ok: true }>): Promise<LoginResult> {
  let lost = false; // true = 输家（权威已属更晚的登录）⇒ 无分叉
  try {
    await zoneCtx.run({ sId: 0 }, () => withUserLock(r.uid, async () => {
      const v = await verifyToken(r.uid, r.token);
      if (!v.ok) {
        lost = true;
        throw new BusyError(`并发登录：本次签发已被更晚的登录取代（${v.reason}），请重试`);
      }
      // ⚠ 带上权威侧签发时刻做写入栅栏（A1）：in-process 虽有 per-uid 锁定序，但栅栏是**第二道**——
      // 锁只保证同进程/同键的串行，⛔ 保证不了"锁外迟到的写"（如锁超时后旧持有者继续跑完）。
      await writeGroupSess(r.uid, r.token, "", v.issuedAtMs);
    }));
  } catch (e) {
    if (!lost) {
      // ⛔ 审计失败不能盖掉原错误：那会把可重试的 409 变成 500（客户端不再重登 = 分叉不自愈）
      // ⛔ 不在这里裸 slice：`String(e).slice(n)` 按 UTF-16 码元切，切点落在代理对中间会静默变成
      // U+FFFD（且长度还够不着 clamp 的 255 上限 ⇒ clamp 原样放行，兜不住）。交给 auditLogin
      // 的 clamp 统一截：它不切代理对，且能多留 ~50 字错误原文——这行审计存在的全部意义就是那段原文。
      await auditLogin("login_diverged", r.uid, `权威已换发但组缓存未更新（客户端未拿到 token）：${String(e)}`, null, null)
        .catch((ae: unknown) => { console.error("[login] 分叉审计写入失败", r.uid, ae); });
    }
    throw e;
  }
  return { userId: r.uid, token: r.token, isNew: r.isNew };
}

/** wx-login：委托 lib（限流→code2session→查/建号→签发）→ 映射/写组缓存。 */
export async function wxLogin(input: WxLoginInput): Promise<LoginResult> {
  const r = await libWxLogin({ code: input.code, ip: input.ip, deviceId: input.deviceId ?? null });
  return r.ok ? finish(r) : loginFail(r.reason);
}

/** dev-login：委托 lib（devKey→openid `dev_<devKey>`，其余同真实链路）→ 映射/写组缓存。 */
export async function devLogin(devKey: string, ip: string, deviceId: string | null): Promise<LoginResult> {
  const r = await libDevLogin(devKey, ip, deviceId);
  return r.ok ? finish(r) : loginFail(r.reason);
}
