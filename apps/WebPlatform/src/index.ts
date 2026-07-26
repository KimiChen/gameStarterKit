/**
 * WebPlatform 独立 HTTP entry（Fastify）——**仅 prod-split 用**（DUAL_MODE §2.7）。
 * dev/test 内嵌模式下 apps/server 直接 import `lib/`、不起本进程。
 *
 * 端点是 lib 的薄 HTTP 包（内部 business↔WebPlatform 契约）：
 * verify 返回**结果码**（业务侧 httpAccount 映射错误类，同 in-process 结果码边界）。
 * login / bindProfile / area/list 随 split 激活续接（此处先 verify/character/ban）。
 */
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ApiPath, type ILoginRes } from "@game/shared";
import { AUTH_DEV_ENABLED, TRUST_PROXY, WEBPLATFORM_HOST, WEBPLATFORM_PORT } from "./config";
import { getPool } from "./lib/mysql";
import {
  accountExists, areaList, banAccount, characterHas, characterRegister, characterZones,
  devLogin, type LoginResult, normalizeIp, revokeAccount, verifyToken, wxLogin,
} from "./lib";

/**
 * 真实 IP。取 XFF **最右段**（可信 LB append 真实对端；最左段客户端可伪造）。
 *
 * 由 `WEBPLATFORM_TRUST_PROXY` 门控，**缺省信**——理由与代价见 config.ts 该项的注释：
 * 本进程只在 split 起，而 split 的流量必经 LB；缺省不信会把全服塌缩进一个令牌桶
 * （12 次登录/分钟）。伪造 XFF 的防护归 **W1（鉴权 + 绑定内网）**，不归本函数。
 *
 * ⚠ 本函数的返回值有**两个**下游，需求并不相同：
 *   ① `rateAllow` 的**令牌桶键** —— 只要求「逐客户端稳定且互异的字符串」，⛔ 不要求是合法 IP；
 *   ② `auditLogin` 的 `INET6_ATON(?)` —— 要求合法 IP，否则 strict 下抛 1411。
 * 故这里**只做能提高桶键质量的归一**，合法性交给写入侧那道 `normalizeIp`（它把收不下的写成 NULL）：
 *   - 归一成功 ⇒ 用归一值：`1.2.3.4:5678` 这种**部署级必现**形态必须剥掉端口，否则每条连接的
 *     临时端口都换一个桶 ⇒ 限流形同虚设；
 *   - 归一失败但**段存在** ⇒ ⛔ **用原始段**，绝不退 `req.ip`：本进程只在 split 起、流量必经 LB，
 *     退 `req.ip` = 所有玩家同一个 LB 地址 ⇒ 全服塌进一个桶（12 次登录/分钟），正是 config.ts
 *     该项注释里判定为「必然事故 + 09·G5 连坐」的那个状态。原始段至少是逐客户端不同的。
 *   - 压根没有段 ⇒ 才退 `req.ip`。
 * ⛔ **不回退去左边找一个合法段**：左侧正是客户端可伪造的部分，那等于按攻击者的输入限流。
 * ⚠ 伪造 XFF 换桶的问题本函数**不负责**（归 W1：鉴权 + 绑定内网），改前改后一样——⛔ 别在这里补。
 */
const realIp = (req: FastifyRequest): string => {
  if (!TRUST_PROXY()) { return req.ip; }
  const xff = (req.headers["x-forwarded-for"] as string | undefined) ?? "";
  const rightmost = xff.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return normalizeIp(rightmost) ?? rightmost ?? req.ip;
};

/** 非法哨兵：Fastify 的 `Body` 泛型仅编译期，运行期必须自己收敛（同 `/area/list` 的处置）。 */
const INVALID = Symbol("invalid");

/**
 * 登录入参就地校验 —— 与 in-process 端点的 zod **逐字段同契约**
 * （`http/account/wxLogin.ts` / `devLogin.ts`）。⛔ 两种部署模式不能有不同的入参语义：
 * 那正是本仓反复踩到的一类 bug，且这次踩得尤其冤——`wxLogin.ts:15` 的 zod 上方**早就写着**
 * 「device_id 是 VARCHAR(64)：超长审计插入会 1406，会话已签发却报 500」，只是这份知识
 * 没跨过部署模式的边界，本文件的同名端点一直在裸传。
 *
 * 未校验的具体后果（按严重度）：
 *  - `deviceId` >64 → `login_audit.device_id VARCHAR(64)` 1406。⚠ 此时 token **已经签发轮换**，
 *    于是 **客户端收 500 拿不到新 token、审计也没有** = 一条比 `login_diverged` 更彻底的登录分叉。
 *  - `devKey` 越界/非 ascii → `dev_<devKey>` 进 `accounts.openid VARCHAR(64) ascii` 报错
 *    （发生在签发之前，是干净的 500，但仍是两模式契约漂移）。
 */
// ⚠ `null` 与缺省同义（in-process 侧的 zod 已同步改成 `.nullish()`）：两模式必须同语义，
// 且取**宽**的一侧——非 JS 端的序列化器普遍把空值写成 null，收紧会埋一个只在换端时才炸的坑。
function pickDeviceId(v: unknown): string | null | typeof INVALID {
  if (v === undefined || v === null) { return null; }
  if (typeof v !== "string" || v.length > 64) { return INVALID; }
  return v;
}
/** = `z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/)`（devLogin.ts）。 */
function pickDevKey(v: unknown): string | typeof INVALID {
  return typeof v === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(v) ? v : INVALID;
}
/** = `z.string().min(1).max(128)`（wxLogin.ts）。 */
function pickWxCode(v: unknown): string | typeof INVALID {
  return typeof v === "string" && v.length >= 1 && v.length <= 128 ? v : INVALID;
}

/**
 * lib 登录结果码 → **客户端契约**（成功回 shared `ILoginRes{userId,token,isNew}`；失败 reply.code+错误码），
 * 与 in-process apps/server http/account/{wxLogin,devLogin}.ts **同契约**（客户端 portalRequest 二形态无感）。
 * ⛔ 出参禁含 openid/unionid/session_key/epoch（09·G8）。
 */
function loginReply(r: LoginResult, reply: FastifyReply): ILoginRes | { error: string } {
  if (r.ok) { return { userId: r.uid, token: r.token, isNew: r.isNew }; }
  const [status, code]: [number, string] =
    r.reason === "banned" ? [403, "ACCOUNT_BANNED"]
    : r.reason === "rate_limited" || r.reason === "wx_rate_limited" ? [429, "RATE_LIMITED"]
    : r.reason === "wx_invalid" ? [401, "AUTH_REQUIRED"]
    : [500, "INTERNAL"]; // wx_unavailable
  reply.code(status);
  return { error: code };
}

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  /**
   * 兜底错误处理：**任何抛出的异常一律 500 `{error:"INTERNAL"}`**，细节只进服务端日志。
   *
   * ⚠ 没有这一层时，Fastify 的默认处理会把 `err.code` 与 `err.message` **原样回给调用方**，
   * 实测形如 `{"statusCode":500,"code":"ER_WRONG_VALUE_FOR_TYPE","message":"Incorrect string value: … "}`。
   * 泄漏面不止"看着不专业"：`ER_DUP_ENTRY` 的 message **含重复键值本身**，而 accounts 的两个唯一键
   * 正是 `openid`/`unionid` ⇒ 与本文件 `loginReply` 上方声明的 **09·G8「出参禁含 openid/unionid」直接冲突**；
   * 连接失败还会带出 DSN 主机端口。且本进程的 7 个端点当前**全部无鉴权**（W1）。
   * ⚠ 这条纪律组侧早就有（`apps/server/src/core/errors.ts` 的 `toErrCode`：「未映射的一律 INTERNAL，
   * ⛔ 不泄漏内部细节」），split 侧此前整个没有 —— 又一次"同一份知识没跨过部署模式边界"。
   * ⛔ 业务失败**不该走这里**：那些是 `loginReply` 那样的显式结果码映射，本处理器只兜真异常。
   */
  app.setErrorHandler((err: unknown, req, reply) => {
    // 入参校验类（Fastify 自带的 400 族）保留原状态码，但同样不回显内部 message。
    // ⚠ `err` 按 unknown 取用：⛔ 不假设它是 FastifyError —— 这里收的正是**未映射**的东西
    //   （驱动错误、字符串、非 Error 抛出物都可能），窄类型断言在这一层是自欺。
    const code = (err as { statusCode?: unknown } | null)?.statusCode;
    const status = typeof code === "number" && code >= 400 && code < 500 ? code : 500;
    req.log.error({ err }, "[webplatform] 未映射异常");
    void reply.code(status).send({ error: status === 500 ? "INTERNAL" : "INVALID_PAYLOAD" });
  });

  app.get("/healthz", async () => {
    await getPool().query("SELECT 1");
    return { ok: true, service: "webplatform" };
  });

  // 校验（token 内嵌 uid = {uid}.{hex}）：返回结果码，业务侧映射错误类（09·G1）。
  app.post<{ Body: { token: string } }>("/verify", async (req) => {
    const token = typeof req.body?.token === "string" ? req.body.token : ""; // Fastify 泛型仅编译期，运行期防非串
    const dot = token.lastIndexOf(".");
    if (dot <= 0) { return { ok: false as const, reason: "mismatch" as const }; }
    const uid = token.slice(0, dot);
    const r = await verifyToken(uid, token);
    // ⚠ `issuedAtMs` 必须带出去：组侧 `writeGroupSess` 拿它当写入栅栏（A1——两个 await 之间可交错，
    // 迟到的旧写会覆盖新写、还反手踢掉合法的新登录端）。⛔ 别以"出参最小化"为由删掉它：
    // 它不是身份信息（09·G8 禁的是 openid/unionid），只是一个时刻。
    return r.ok ? { ok: true as const, uid, status: r.status, issuedAtMs: r.issuedAtMs } : r;
  });

  // 角色/足迹注册表（存在性权威）。
  app.post<{ Body: { uid: string; sId: number } }>("/character/register", async (req) => {
    await characterRegister(req.body.uid, req.body.sId);
    return { ok: true };
  });
  app.post<{ Body: { uid: string } }>("/character/query", async (req) => {
    return { zones: await characterZones(req.body.uid) };
  });
  app.post<{ Body: { uid: string; sId: number } }>("/character/has", async (req) => {
    return { has: await characterHas(req.body.uid, req.body.sId) };
  });
  app.post<{ Body: { uid: string } }>("/account/exists", async (req) => {
    return { exists: await accountExists(req.body.uid) };
  });

  // 撤销（封号 / 踢人）：一条 UPDATE 写权威（status=1 / token_hash=NULL）= **下次登不上**。
  // 返回**是否命中**（false = 无此账号）：组侧据此决定要不要踢在线（core/auth/ban.ts）。
  // ⚠ 本服务**刻意不广播踢人**（不持 coord Redis）：送达保证在 GM 工具的逐节点确认（09·G7b / WEBPLATFORM.md §5）。
  // ⚠ 待办：本端点无鉴权（W1）、split 下封号无审计行（W2）——见 docs/WEBPLATFORM.md §4。
  app.post<{ Body: { uid: string } }>("/ban", async (req) => {
    return { banned: await banAccount(req.body.uid) };
  });
  app.post<{ Body: { uid: string } }>("/revoke", async (req) => {
    return { revoked: await revokeAccount(req.body.uid) };
  });

  // 登录（split：客户端 portalRequest 直连 WebPlatform）：路径 = 单源 ApiPath（铁律 6，与 in-process 端点一致）；
  // lib 全链（限流→code2session→查/建号→签发）→ loginReply 映射成客户端契约。组 sess 由网关 onAuth 懒填（2g）。
  app.post<{ Body: { code?: string; deviceId?: string } }>(ApiPath.WxLogin, async (req, reply) => {
    const d = pickDeviceId(req.body?.deviceId);
    const code = pickWxCode(req.body?.code);
    if (d === INVALID || code === INVALID) { reply.code(400); return { error: "INVALID_PAYLOAD" }; }
    const r = await wxLogin({ code, ip: realIp(req), deviceId: d });
    return loginReply(r, reply);
  });
  app.post<{ Body: { devKey?: string; deviceId?: string } }>(ApiPath.DevLogin, async (req, reply) => {
    if (!AUTH_DEV_ENABLED) { reply.code(404); return { error: "NOT_FOUND" }; }
    const d = pickDeviceId(req.body?.deviceId);
    const devKey = pickDevKey(req.body?.devKey);
    if (d === INVALID || devKey === INVALID) { reply.code(400); return { error: "INVALID_PAYLOAD" }; }
    const r = await devLogin(devKey, realIp(req), d);
    return loginReply(r, reply);
  });

  // 选服目录（登录前展示，无鉴权；token 可选、best-effort 回填 ul）。返回 IAreaListRes（al/ul/isOps/h）。
  // ⚠ Fastify 无运行期 body 校验（`Body` 泛型仅编译期）：token 若非字符串，lib 内 lastIndexOf 会抛→500，
  // 破坏 best-effort ⛔不抛 契约。就地收敛成 string|null（对齐 in-process 端点的 zod）。
  app.post<{ Body: { token?: string } }>("/area/list", async (req) => {
    return areaList(typeof req.body?.token === "string" ? req.body.token : null);
  });

  // TODO(split 激活续)：/bindProfile、/bindPhone。
  return app;
}

// 直接运行即起独立进程（prod-split）；被 import 时不自启（dev/test 内嵌只用 lib）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildServer()
    .listen({ port: WEBPLATFORM_PORT, host: WEBPLATFORM_HOST })
    .then((addr) => {
      // ⚠ 打 **host 参数本身**，⛔ 别只打 listen 返回的 addr：addr 只是**第一个**绑定地址，
      // 之前硬编码 0.0.0.0 时它显示 `http://127.0.0.1:2570`，而进程同时在所有网卡上
      // （pino 那几行才是全的）⇒ 看日志的人以为绑的是回环，**系统性低报暴露面**。
      console.log(`[webplatform] listening ${addr}（host=${WEBPLATFORM_HOST}）`);
      if (WEBPLATFORM_HOST !== "127.0.0.1" && WEBPLATFORM_HOST !== "localhost") {
        console.warn(`[webplatform] ⚠ 监听 ${WEBPLATFORM_HOST}（非回环）而 W1 鉴权尚未落地：`
          + "/ban·/revoke·/character/*·/account/exists 对**任何能连到本端口的调用方**开放。"
          + "确保它只在内网网卡上、且被安全组/防火墙限制到游戏服网段。");
      }
      // ⚠ 把限流的**实际身份来源**打出来：两种取法的失败形态都很隐蔽（一个是限流失效、
      // 一个是全服共桶被限到 12 次/分钟），事后从日志能一眼看出当时是哪种。
      console.log(TRUST_PROXY()
        ? "[webplatform] 限流身份 = X-Forwarded-For 最右段（信任前置 LB）。⚠ 本进程必须**不可被直连**，否则该头可伪造 ⇒ 限流失效（防护归 W1：鉴权 + 绑定内网）"
        : "[webplatform] 限流身份 = socket 对端 req.ip（WEBPLATFORM_TRUST_PROXY=0）。⚠ 若位于 LB 之后，全服将塌缩进同一个令牌桶（约 12 次登录/分钟）");
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
