/**
 * kit-api/server 门面（docs/KIT.md §4，框架文件；⛔ 不在任何 kit 包内）——框架给 kit 的三样插件与 kit
 * 自己都拿不到的东西：
 *   1. `withKitTx(kitId, sId, fn)`：限定在 `k_<kitId 小写>_*` 表的 READ COMMITTED 事务句柄——`tx.query()` 对
 *      每条 SQL 做表标识符闸（FROM / JOIN / STRAIGHT_JOIN / INTO / UPDATE / USING / TABLE(S) 后的整段表引用列表
 *      必须全带本 kit 前缀，backtick / 裸名皆可，⛔ schema 限定、⛔ 别的 kit、⛔ 框架表）；框架表在 `tx.query()`
 *      这条路上不可达，只经 debit / credit / enqueueEffect 可达。`tx.conn` 是原始连接（契约保留，⛔ 不过闸）：
 *      kit 代码触碰 `.conn` 由 K1 路径级边界机检拒绝，运行时闸只覆盖 `tx.query()`。提交后对事务内扣过款 /
 *      入过账的每个 uid 失效余额缓存。
 *   2. `debit` / `credit`：经济主账本的事务内调用（currency.ts 的 debitInTx / creditInTx，sId 已绑定）。
 *   3. `enqueueEffect`：outbox intent 写入（outbox.insertOutboxIntent，sId 已绑定，ODKU no-op 形态 ⇒ "DUP"），
 *      与 1/2 同一事务 ⇒「世界状态在 SQL、经济在框架」之间的原子路径；阶段 2/3（redisApply / markOutboxDone）
 *      由事务**提交后**的 `applyKitEffect`（下）best-effort 收敛，失败 / cold 留给 relayer。effect 里的 kit kind
 *      必须属于本 kit（`kit:<本 kitId>:*`，⛔ 不给别的 kit 的 `kt:` 键记账），"DUP" 时回读既有 intent 比对规范化
 *      JSON，同 opId 不同载荷 ⇒ EffectConflictError（与 purchaseTx 同一判定，⛔ 不静默吞）。
 * 之外再给两样只读 / 收尾门面（K0-5 样本对抗审阅后补，2026-09-06；没有它们 kit 只能越过门面去拿 clientFor /
 * currentZoneId，与「⛔ kit 不直接 import core/infra 其他模块」自相矛盾）：
 *   4. `applyKitEffect(kitId, uid, sId, opId, effect)`：对**已提交**的 intent 立即走阶段 2（redisApply，applied 集合
 *      幂等）+ 阶段 3（markOutboxDone，best-effort），与 shop.purchase / mail.claim 的收尾同形——同一进程内
 *      `npm run dev` 不起 relayer 也能看到 `kt:` 键更新；任何失败只返回 "failed"（⛔ 不抛：钱 / 世界状态已提交、
 *      intent 已 durable，relayer 必定补发）。effect 的 kit kind 同样必须属于本 kit。⛔ 只能在 withKitTx 返回之后
 *      调用（事务内调用会在提交前发货，崩溃窗口即双发）。
 *   5. `readKitUserField(kitId, name, uid, field, scope)`：只读 HGET 本 kit 的 per-user 键（`kKitUser`）一个字段；
 *      `name` 必须在本 kit 的 `kit.json.userKeys` 里（SERVER_KIT_CATALOG）。写侧仍只有 effect 通道（KIT.md §5）。
 *   同时再导出 `currentZoneId`（RPC 端点把请求所在区交给 withKitTx 用）。
 *   6. `withKitWorkerTx(kitId, workerId, sId, lease, fn)`（docs/MMO.md MF7a-B3）：kit worker 的**租约守卫受限事务**——
 *      同连接同事务**首句** `renewLeaseGuard`（`UPDATE singleton_lease … WHERE lease_name = ? AND holder = ? AND fence_token = ?`，
 *      Rows matched 0 ⇒ LeaseLostError，withRcTx 自动 ROLLBACK，⛔ 业务表零写入——旧持有者 / 旧 fence 的写被存储边界拒）；
 *      句柄与 withKitTx 同形（表闸 / debit / credit / enqueueEffect），另带 `workerId` / `fenceToken`；`.conn` 运行时抛错
 *      （worker 没有原始连接）；回调内再开 withKitTx / withKitWorkerTx 一律拒（事务套事务 = 第二条连接绕过守卫首句）；
 *      租约名必须恰是 `kit:<kitId>:<workerId>`（⛔ 借别的 worker 的租约写）。worker 进程入口见 src/workers/kitWorker.ts。
 *   7. `withKitWorldTx(kitId, sId, { instanceId, authorityEpoch, personas? }, fn)`（docs/MMO.md MF7b-B2）：世界形态的**权威守卫受限事务**——
 *      同连接同事务**首句** `UPDATE world_instance SET write_seq = write_seq + 1 WHERE server_id = ? AND instance_id = ? AND authority_epoch = ?`
 *      （Rows matched 0 ⇒ AuthorityLostError，自动 ROLLBACK：旧 owner 的迟到写被存储边界拒——「存储边界拒旧 epoch」的唯一实现点；
 *      ⛔ 不碰 `checkpoint_rev`，它只在检查点落盘时推进，M18），再逐 persona `assertControl`（id 升序，锁序同 MF2），然后交出
 *      与 withKitTx 同形的受限句柄 + `writeSeq` + `appendWorldEvent(table, event)`（只许写本 kit 的 `role:"world-event"` 表，
 *      框架固定列 event_id / instance_id / seq / kind / payload / status / attempts / checkpoint_rev）；`.conn` 运行时抛错。
 * effect kind 登记通道（`kit:<id>:<name>`）在 shared economy.ts + KIT_EFFECT_KINDS + Lua 镜像，不在本文件。
 *
 * kit 从 `apps/server/src/kits/<id>/**` 以相对路径 `../../core/infra/kitApi` 导入本文件；kit 需要的错误类型、
 * CUR_GOLD、`kKitUser` 与 `currentZoneId` 一并从这里再导出，⛔ kit 不直接 import core/infra 其他模块
 * （K1 路径级边界机检；K0 先由 `apps/server/test/kit-import-boundary.test.ts` 按 import 说明符钉住）。
 *
 * 表闸是**运行时 fail-closed 的表引用列表扫描**，不是完整 SQL 解析器：先剥掉字符串字面量与注释（`/*! … *\/`
 * 可执行注释与 `/*+ … *\/` 优化器提示服务端会真的执行/解析，⛔ 一律拒），再从每个表关键字起把整段
 * table_references 走完——逗号 / JOIN 族接续的每个表因子都检查（含 `JOIN … ON cond, tbl` 这种条件后接逗号的
 * 形态）；表名后的 `PARTITION (…)` 与 `USE|IGNORE|FORCE INDEX|KEY (…)` 提示组被吃掉后继续找逗号；
 * `(SELECT … )` / `(WITH …)` 派生表放行（内层 FROM 由外层扫描继续处理），其他括号表引用（`FROM (tbl)`）
 * 与识别不了的形态（CTE 名、`SELECT … INTO`、函数里的 `FROM`）一律按拒绝处理——kit 改写 SQL 即可。
 * 语句首词只允许 SELECT / INSERT / REPLACE / UPDATE / DELETE / WITH：DDL 在事务里会隐式提交（KIT.md §5：表由
 * db:bootstrap 账本应用），⛔ 不给 kit 事务内跑。`tx.query()` 走 `conn.execute`（服务端预处理语句，参数只允许
 * 原始值 / Date / Buffer，⛔ `toSqlString` 一类对象在客户端拼接 SQL 绕过闸）。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "./mysql";
import { getPool, retryOnContention, withRcTx } from "./mysql";
import { LeaseLostError, renewLeaseGuard, type SingletonLease } from "./lease";
import { kitWorkerLeaseName } from "../../kits/workerLease";
import { withUser } from "../uow";
import type { AssetOwnerRef, IEffect, KitEffectKinds } from "@game/shared";
import { PERSONA_MAX_SLOTS_HARD, assetOwnerKey, lookupKitEffectKind, validatePersonaId } from "@game/shared";
import { KIT_EFFECT_KINDS } from "@game/shared/kits/catalog.generated";
import { creditInTx, debitInTx, invalidateBalanceCache } from "../economy/currency";
import {
  assertOutboxIntentMatches, canonicalizeEffect, deriveOpId, insertOutboxIntent, markOutboxDone, redisApply,
} from "../economy/outbox";
import { CUR_GOLD } from "./config";
import {
  AuthorityLostError, ControlConflictError, EffectConflictError, InsufficientBalanceError, InvalidEffectError, PersonaBusyError,
  PersonaLockOrderError, PersonaNotFoundError, PersonaSlotTakenError, RpcFault, StaleFenceError,
} from "../errors";
import { type KitKeyScope, currentZoneId, kKitUser, zoneCtx } from "./keys";
import { clientFor } from "./redisRoute";
import { SERVER_KIT_CATALOG } from "../../kits/catalog.generated";
import type { ServerKitCatalogEntry } from "../../kits/catalogTypes";

export {
  AuthorityLostError, CUR_GOLD, ControlConflictError, EffectConflictError, InsufficientBalanceError, InvalidEffectError, LeaseLostError,
  PERSONA_MAX_SLOTS_HARD, PersonaBusyError, PersonaLockOrderError, PersonaNotFoundError, PersonaSlotTakenError, RpcFault, StaleFenceError,
  currentZoneId, kKitUser,
};
export type { AssetOwnerRef, IEffect, KitKeyScope, PoolConnection, ResultSetHeader, RowDataPacket, SingletonLease };

export interface KitUserFence { readonly fence: number }
export interface KitUserFenceDeps {
  readonly withUser: <T>(uid: string, fn: (user: KitUserFence) => Promise<T>) => Promise<T>;
}

/**
 * 带金币扣款的 kit 命令：先进入显式区的用户锁/冷档自愈，只交出 fence，不暴露 UoW 的档案写入口。
 * 回调内用 withKitTx；SQL 提交后才 apply effect。不得从持有世界 SQL 锁的事务内反向获取用户锁。
 */
export function withKitUserFence<T>(
  uid: string, sId: number, fn: (user: KitUserFence) => Promise<T>, deps: KitUserFenceDeps = { withUser },
): Promise<T> {
  if (!uid || uid.length > 32) throw new TypeError("kit uid invalid");
  if (!Number.isInteger(sId) || sId < 0 || sId > 65535) throw new TypeError("kit sId invalid");
  return zoneCtx.run({ sId }, () => deps.withUser(uid, (user) => fn(Object.freeze({ fence: user.fence }))));
}

/** 仅重试无事务外副作用的完整幂等事务；业务冲突/余额不足不重试，最多三次。 */
export function retryKitTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return retryOnContention(fn, 3);
}

/** `tx.query()` 触到本 kit 前缀之外的表标识符（或识别不了的 SQL 形态）时抛出；⛔ 不带 SQL 原文下发。 */
export class KitTableAccessError extends Error {
  readonly kitId: string;
  readonly identifier: string;
  constructor(kitId: string, identifier: string, reason: string) {
    super(`kit "${kitId}" 的 SQL 越界：${reason}（标识符 "${identifier}"）`);
    this.name = "KitTableAccessError";
    this.kitId = kitId;
    this.identifier = identifier;
  }
}

/** `tx.enqueueEffect()` 的 effect 含别的 kit 的 kind（`kit:<其他 kitId>:*`）时抛出。 */
export class KitEffectScopeError extends Error {
  readonly kitId: string;
  readonly kind: string;
  constructor(kitId: string, kind: string) {
    super(`kit "${kitId}" 的 effect 越界：kind "${kind}" 不属于本 kit`);
    this.name = "KitEffectScopeError";
    this.kitId = kitId;
    this.kind = kind;
  }
}

export interface KitTx {
  /** 原始连接（契约保留）：⛔ 不过表闸，kit 代码触碰 `.conn` 由 K1 路径级边界机检拒绝。 */
  readonly conn: PoolConnection;
  readonly kitId: string;
  readonly sId: number;
  /** 只能碰 `k_<kitId 小写>_*` 表（运行时闸，见文件头）；走预处理语句，params 只允许原始值 / Date / Buffer。 */
  query<T = RowDataPacket[] | ResultSetHeader>(sql: string, params?: unknown[]): Promise<T>;
  /** 扣款：ledger 幂等 → 余额 + fence 守卫；"DUP" = 同 opId 已扣过（事务内零写入）。`owner` 缺省 account(uid)（MF2 资产主体）。 */
  debit(uid: string, currency: number, amount: number, fence: number, opId: string, reason: string, owner?: AssetOwnerRef): Promise<"DUP" | number>;
  /** 入账：ledger 幂等 → upsert 余额；"DUP" = 同 opId 已入过。`owner` 缺省 account(uid)。 */
  credit(uid: string, currency: number, amount: number, opId: string, reason: string, owner?: AssetOwnerRef): Promise<"DUP" | number>;
  /**
   * durable intent（阶段 1 的 outbox 半边）；"DUP" = 同 opId 已有**同载荷** intent（ODKU no-op 后回读比对），
   * 同 opId 不同载荷 ⇒ EffectConflictError；effect 里的 kit kind 必须是 `kit:<本 kitId>:*` ⇒ 否则 KitEffectScopeError。
   */
  enqueueEffect(uid: string, opId: string, effect: IEffect, owner?: AssetOwnerRef): Promise<"INSERTED" | "DUP">;
  /**
   * persona 门面（MMO MF2-B4，docs/MMO.md §5 MF2 / M03）：框架写 `persona` 表——kit ⛔ 不能直接 SQL 触碰它（表闸照拒），
   * kit 的角色行经返回的 personaId 关联（⛔ 无外键，KIT.md §2）。同一事务内锁序固定：先 account 作用域（createPersona 锁该
   * (server_id, user_id, kit_id) 的 persona 行集与间隙），再 persona id **升序**——乱序一律 PersonaLockOrderError（fail-closed，
   * ⛔ 不等 InnoDB 死锁裁决）。slot ∈ [0, PERSONA_MAX_SLOTS_HARD)；同槽再建 ⇒ PersonaSlotTakenError（UNIQUE 冲突，⛔ 不吞）。
   */
  createPersona(uid: string, slot: number, meta?: Readonly<Record<string, unknown>>): Promise<string>;
  /** 控制权 CAS：`UPDATE persona … WHERE control_epoch = ?`，Rows matched 0 ⇒ ControlConflictError（不存在 ⇒ PersonaNotFoundError）。 */
  assertControl(personaId: string, controlEpoch: number): Promise<void>;
  /** status → inactive（幂等）；仍在世界房（world_address 非 NULL）⇒ PersonaBusyError。 */
  deactivatePersona(personaId: string): Promise<void>;
  /** 只删 status = inactive 且 world_address IS NULL 的行；否则 PersonaBusyError。 */
  deletePersona(personaId: string): Promise<void>;
}

/** 事务外只读的 persona 视图（listPersonas）。 */
export interface PersonaRow {
  readonly personaId: string;
  readonly slot: number;
  readonly status: 0 | 1;
  readonly controlEpoch: number;
  readonly worldAddress: string | null;
  readonly meta: unknown;
}

const PERSONA_ID_KIT_RE = /^[a-z][A-Za-z0-9]{0,63}$/u;

/** 事务外只读：该账号在本 kit / 本区的全部 persona（按 slot 升序）。`query` 可注入（单测）；生产缺省进程池。 */
export async function listPersonas(
  kitId: string, uid: string, sId: number,
  query: (sql: string, params: unknown[]) => Promise<RowDataPacket[]> = async (sql, params) => (await getPool().query<RowDataPacket[]>(sql, params))[0],
): Promise<readonly PersonaRow[]> {
  if (!PERSONA_ID_KIT_RE.test(kitId)) { throw new TypeError(`kitId "${kitId}" 非法`); }
  if (!uid || uid.length > 32) { throw new TypeError("kit uid invalid"); }
  if (!Number.isInteger(sId) || sId < 0 || sId > 65535) { throw new TypeError(`sId ${sId} 非法`); }
  const rows = await query(
    "SELECT persona_id, slot, status, control_epoch, world_address, meta FROM persona WHERE server_id = ? AND user_id = ? AND kit_id = ? ORDER BY slot",
    [sId, uid, kitId]);
  return rows.map((row) => ({
    personaId: String(row.persona_id),
    slot: Number(row.slot),
    status: Number(row.status) === 1 ? 1 : 0,
    controlEpoch: Number(row.control_epoch),
    worldAddress: row.world_address === null || row.world_address === undefined ? null : String(row.world_address),
    meta: row.meta ?? null,
  }));
}

/** 可注入的框架依赖（单测用假 pool / 假账本 / 自己的 kit kind 表；生产缺省即真实实现与生成物）。 */
export interface KitTxDeps {
  readonly withRcTx: <T>(fn: (conn: PoolConnection) => Promise<T>) => Promise<T>;
  readonly debitInTx: typeof debitInTx;
  readonly creditInTx: typeof creditInTx;
  readonly insertOutboxIntent: typeof insertOutboxIntent;
  readonly assertOutboxIntentMatches: typeof assertOutboxIntentMatches;
  readonly invalidateBalanceCache: typeof invalidateBalanceCache;
  readonly kinds: KitEffectKinds;
}

const DEFAULT_DEPS: KitTxDeps = {
  withRcTx, debitInTx, creditInTx, insertOutboxIntent, assertOutboxIntentMatches, invalidateBalanceCache,
  kinds: KIT_EFFECT_KINDS,
};

const KIT_ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/u;

/** kit 的表前缀：`k_<id 小写>_`（kit.json id 无下划线 ⇒ 前缀之间不可能互为前缀）。 */
export function kitTablePrefix(kitId: string): string {
  if (!KIT_ID_RE.test(kitId)) { throw new TypeError(`kitId "${kitId}" 非法：须匹配 ${KIT_ID_RE}`); }
  return `k_${kitId.toLowerCase()}_`;
}

/** 语句首词白名单：事务内只允许 DML（DDL 隐式提交，KIT.md §5 表只经 db:bootstrap 账本应用）。 */
const ALLOWED_LEADING = new Set(["SELECT", "INSERT", "REPLACE", "UPDATE", "DELETE", "WITH"]);
/** 其后跟表引用列表的关键字（USING 兼有 `JOIN … USING (cols)` 与 `DELETE … USING tbl_refs` 两义，见扫描器）。 */
const TABLE_KEYWORDS = new Set(["FROM", "JOIN", "STRAIGHT_JOIN", "INTO", "UPDATE", "USING", "TABLE", "TABLES", "TRUNCATE"]);
/** 引出下一个表因子的 JOIN 族关键字。 */
const JOIN_KEYWORDS = new Set(["JOIN", "STRAIGHT_JOIN"]);
/** JOIN 前置修饰词（其后必是 JOIN）。 */
const JOIN_MODIFIERS = new Set(["LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "NATURAL"]);
/** 表引用列表到此结束（顶层遇到即返回）。 */
const TERMINATORS = new Set([
  "WHERE", "SET", "VALUES", "VALUE", "SELECT", "ORDER", "GROUP", "HAVING", "LIMIT", "FOR", "LOCK", "UNION", "EXCEPT",
  "INTERSECT", "WINDOW", "INTO", "FROM", "RETURNING", "DUPLICATE",
]);
/** 表引用后不可能是别名的保留字（用来判断「下一个标识符是别名还是子句」；ON 是连接条件起点，⛔ 不是终止符）。 */
const NOT_ALIAS = new Set([
  ...TERMINATORS, ...JOIN_KEYWORDS, ...JOIN_MODIFIERS,
  "ON", "USING", "PARTITION", "IGNORE", "FORCE", "USE", "AS", "IF", "LATERAL", "WHEN", "THEN", "ELSE", "END",
]);
/** `INSERT` / `REPLACE` 动词与目标表之间允许的修饰词（其后 INTO 可省）。 */
const INSERT_MODIFIERS = new Set(["LOW_PRIORITY", "DELAYED", "HIGH_PRIORITY", "IGNORE"]);
/** 索引提示：`{USE|IGNORE|FORCE} {INDEX|KEY} [FOR {JOIN|ORDER BY|GROUP BY}] (…)`。 */
const INDEX_HINT_HEADS = new Set(["USE", "IGNORE", "FORCE"]);

type Token = { readonly kind: "ident" | "quoted" | "punct" | "other"; readonly text: string };

/**
 * 剥字符串字面量与注释（单/双引号字符串含反斜杠转义与双引号折叠；`-- ` / `#` 行注释；斜杠星号块注释）。
 * 未闭合 ⇒ 抛（fail-closed）。`/*!`（服务端会执行）与 `/*+`（优化器提示）⛔ 一律拒。
 * backtick 标识符按 MySQL 词法**整体吃掉再原样吐回**给 tokenizer：漏掉这一步，`` `x'` `` 里的引号会被
 * 当成字符串起点，与 MySQL 的解析错位，两个这样的标识符之间的 FROM/JOIN 就会被整段删掉而逃过表闸。
 */
function stripLiteralsAndComments(sql: string, kitId: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "`") {
      // MySQL 把 `…` 当一个原子：里面的 ' " # -- /* 都不是字面量/注释起点。
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (sql[j] === "`") {
          // 双写转义（``）：tokenize 的 /`([^`]*)`/ 认不了这一形态 ⇒ fail-closed，不猜。
          if (sql[j + 1] === "`") { throw new KitTableAccessError(kitId, "``", "⛔ backtick 标识符含双写转义"); }
          closed = true; break;
        }
        j++;
      }
      if (!closed) { throw new KitTableAccessError(kitId, "", "backtick 标识符未闭合"); }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "'" || c === "\"") {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (sql[j] === "\\") { j += 2; continue; }
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; }
          closed = true; break;
        }
        j++;
      }
      if (!closed) { throw new KitTableAccessError(kitId, "", "字符串字面量未闭合"); }
      out += " '' ";
      i = j + 1;
      continue;
    }
    if (c === "#" || (c === "-" && sql[i + 1] === "-" && (i + 2 >= n || /\s/u.test(sql[i + 2])))) {
      while (i < n && sql[i] !== "\n") { i++; }
      out += " ";
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const marker = sql[i + 2];
      if (marker === "!" || marker === "+") {
        throw new KitTableAccessError(kitId, sql.slice(i, i + 3), "⛔ 可执行注释 / 优化器提示");
      }
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) { throw new KitTableAccessError(kitId, "", "块注释未闭合"); }
      out += " ";
      i = end + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function tokenize(sql: string, kitId: string): Token[] {
  const tokens: Token[] = [];
  const re = /`([^`]*)`|([A-Za-z_$][A-Za-z0-9_$]*)|([(),.;])|(\S)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    if (m[1] !== undefined) {
      if (m[1].length === 0 || m[1].includes("\n")) { throw new KitTableAccessError(kitId, m[0], "backtick 标识符非法"); }
      tokens.push({ kind: "quoted", text: m[1] });
    } else if (m[2] !== undefined) {
      tokens.push({ kind: "ident", text: m[2] });
    } else if (m[3] !== undefined) {
      tokens.push({ kind: "punct", text: m[3] });
    } else {
      tokens.push({ kind: "other", text: m[4] as string });
    }
  }
  return tokens;
}

const isName = (t: Token | undefined): t is Token => t !== undefined && (t.kind === "ident" || t.kind === "quoted");
const isPunct = (t: Token | undefined, text: string): boolean => t !== undefined && t.kind === "punct" && t.text === text;
const upper = (t: Token | undefined): string => (t !== undefined && t.kind === "ident" ? t.text.toUpperCase() : "");

/**
 * 纯函数表闸：返回 SQL 里被识别为表引用的全部标识符（已通过前缀检查，按首次出现去重），越界即抛
 * KitTableAccessError。导出给单测与 K1 的边界机检复用。
 */
export function assertKitTableAccess(sql: string, kitId: string): string[] {
  const prefix = kitTablePrefix(kitId);
  const tokens = tokenize(stripLiteralsAndComments(sql, kitId), kitId);
  if (tokens.length === 0) { throw new KitTableAccessError(kitId, "", "空语句"); }
  const leading = upper(tokens[0]);
  if (!ALLOWED_LEADING.has(leading)) {
    throw new KitTableAccessError(kitId, tokens[0].text, "事务内只允许 SELECT / INSERT / REPLACE / UPDATE / DELETE / WITH");
  }
  for (const t of tokens) {
    if (t.kind === "punct" && t.text === ";") { throw new KitTableAccessError(kitId, ";", "⛔ 多语句"); }
  }
  const seen: string[] = [];
  const check = (t: Token): void => {
    if (!t.text.toLowerCase().startsWith(prefix)) {
      throw new KitTableAccessError(kitId, t.text, `表必须以 ${prefix} 开头`);
    }
    if (!seen.includes(t.text)) { seen.push(t.text); }
  };
  /** 从 `(` 跳到配对 `)` 之后；不配对 ⇒ fail-closed。 */
  const skipGroup = (open: number): number => {
    let depth = 0;
    for (let j = open; j < tokens.length; j++) {
      if (isPunct(tokens[j], "(")) { depth++; }
      else if (isPunct(tokens[j], ")")) { depth--; if (depth === 0) { return j + 1; } }
    }
    throw new KitTableAccessError(kitId, "(", "括号未闭合");
  };
  /** `[AS] alias`。 */
  const skipAlias = (j: number): number => {
    if (upper(tokens[j]) === "AS") { return isName(tokens[j + 1]) ? j + 2 : j + 1; }
    if (isName(tokens[j]) && !(tokens[j].kind === "ident" && NOT_ALIAS.has(tokens[j].text.toUpperCase()))) { return j + 1; }
    return j;
  };
  /** `{USE|IGNORE|FORCE} {INDEX|KEY} [FOR {JOIN|ORDER BY|GROUP BY}] (…)` 提示组（可多组）。 */
  const skipIndexHints = (j: number): number => {
    while (INDEX_HINT_HEADS.has(upper(tokens[j]))) {
      j += 1;
      const what = upper(tokens[j]);
      if (what !== "INDEX" && what !== "KEY") { throw new KitTableAccessError(kitId, tokens[j]?.text ?? "", "索引提示形态不识别"); }
      j += 1;
      if (upper(tokens[j]) === "FOR") {
        j += 1;
        const scope = upper(tokens[j]);
        if (scope === "JOIN") { j += 1; }
        else if ((scope === "ORDER" || scope === "GROUP") && upper(tokens[j + 1]) === "BY") { j += 2; }
        else { throw new KitTableAccessError(kitId, tokens[j]?.text ?? "", "索引提示形态不识别"); }
      }
      if (!isPunct(tokens[j], "(")) { throw new KitTableAccessError(kitId, tokens[j]?.text ?? "", "索引提示缺括号列表"); }
      j = skipGroup(j);
    }
    return j;
  };

  /**
   * 从 `start` 起把整段 table_references 走完：逗号 / JOIN 族接续的每个表因子都检查；`(SELECT…)` / `(WITH…)`
   * 派生表放行（内层 FROM 由外层扫描继续处理），其他括号表引用一律拒；ON / USING 条件里的顶层括号按表达式跳过。
   * `viaJoin` = 起始关键字是否 JOIN 族（决定紧随的 `USING (…)` 是连接列清单还是 DELETE 的表清单）。
   */
  const scanTableRefs = (start: number, kw: string): void => {
    let j = start;
    let expectFactor = true;
    let lastViaJoin = JOIN_KEYWORDS.has(kw);
    for (;;) {
      const t = tokens[j];
      if (t === undefined) {
        if (expectFactor) { throw new KitTableAccessError(kitId, "", `${kw} 后不是可识别的表引用`); }
        return;
      }
      if (t.kind === "punct") {
        if (t.text === "(") {
          if (!expectFactor) { j = skipGroup(j); continue; }              // 表达式 / 列清单括号
          const inner = upper(tokens[j + 1]);
          if (inner !== "SELECT" && inner !== "WITH") {
            throw new KitTableAccessError(kitId, tokens[j + 1]?.text ?? "(", "⛔ 括号表引用（只放行 (SELECT …) 派生表）");
          }
          j = skipAlias(skipGroup(j));                                      // 派生表 [AS] alias
          expectFactor = false;
          continue;
        }
        if (t.text === ")") {
          if (expectFactor) { throw new KitTableAccessError(kitId, ")", `${kw} 后不是可识别的表引用`); }
          return;                                                            // 所在派生表 / 子查询结束
        }
        if (t.text === ",") {
          if (expectFactor) { throw new KitTableAccessError(kitId, ",", `${kw} 后不是可识别的表引用`); }
          expectFactor = true; lastViaJoin = false; j += 1;
          continue;
        }
        j += 1;
        continue;
      }
      const u = upper(t);
      if (expectFactor) {
        if (!isName(t) || (t.kind === "ident" && NOT_ALIAS.has(u))) {
          throw new KitTableAccessError(kitId, t.text, `${kw} 后不是可识别的表引用`);
        }
        if (isPunct(tokens[j + 1], ".")) { throw new KitTableAccessError(kitId, t.text, "⛔ schema 限定名"); }
        check(t);
        j += 1;
        if (upper(tokens[j]) === "PARTITION") {
          if (!isPunct(tokens[j + 1], "(")) { throw new KitTableAccessError(kitId, "PARTITION", "PARTITION 缺括号列表"); }
          j = skipGroup(j + 1);
        }
        j = skipIndexHints(skipAlias(j));
        expectFactor = false;
        continue;
      }
      if (JOIN_KEYWORDS.has(u)) { expectFactor = true; lastViaJoin = true; j += 1; continue; }
      if (JOIN_MODIFIERS.has(u)) { j += 1; continue; }
      if (u === "USING") {
        if (lastViaJoin && isPunct(tokens[j + 1], "(")) { j = skipGroup(j + 1); continue; } // JOIN … USING (cols)
        expectFactor = true; lastViaJoin = false; j += 1;                                   // DELETE … USING tbl_refs
        continue;
      }
      if (TERMINATORS.has(u)) { return; }
      j += 1;                                                                                // ON 条件等表达式 token
    }
  };

  // `INSERT [LOW_PRIORITY|DELAYED|HIGH_PRIORITY] [IGNORE] [INTO] tbl` / `REPLACE [LOW_PRIORITY|DELAYED] [INTO] tbl`
  // ——INTO 在 MySQL 语法里**可省**。省掉时整条语句一个 TABLE_KEYWORDS 都不含，下面的主循环永不触发，
  // 目标表就整个逃过前缀闸。这里显式认这一形态，表因子仍交给 scanTableRefs（同一套限定名/别名/提示规则）。
  if (leading === "INSERT" || leading === "REPLACE") {
    let j = 1;
    while (INSERT_MODIFIERS.has(upper(tokens[j]))) { j += 1; }
    if (upper(tokens[j]) !== "INTO") { scanTableRefs(j, leading); }
  }

  for (let i = 0; i < tokens.length; i++) {
    const kw = upper(tokens[i]);
    if (!TABLE_KEYWORDS.has(kw)) { continue; }
    const prev = upper(tokens[i - 1]);
    // `ON DUPLICATE KEY UPDATE col = …` / `FOR UPDATE` 的 UPDATE 不是语句动词；`INTO TABLE` 交给 TABLE。
    if (kw === "UPDATE" && (prev === "KEY" || prev === "FOR")) { continue; }
    // 索引提示 `… INDEX FOR JOIN (…)` 的 JOIN 不是连接（提示组已在表引用扫描里整体吃掉）。
    if (kw === "JOIN" && prev === "FOR") { continue; }
    if (kw === "INTO" && upper(tokens[i + 1]) === "TABLE") { continue; }
    // `JOIN … USING (cols)`：连接列清单不是表引用（DELETE 的 `USING tbl_refs` 在 FROM 的整段扫描里处理）。
    if (kw === "USING" && isPunct(tokens[i + 1], "(")) { continue; }
    let j = i + 1;
    if ((kw === "TABLE" || kw === "TABLES") && upper(tokens[j]) === "IF") {
      // IF [NOT] EXISTS
      j += upper(tokens[j + 1]) === "NOT" ? 3 : 2;
    }
    scanTableRefs(j, kw);
  }
  return seen;
}

/** kit 命名空间化的 op_id：type = `kit:<kitId>:<op>`，与 shop.purchase / mail.attach 同一派生函数、永不碰撞。 */
export function kitOpId(kitId: string, uid: string, sId: number, op: string, clientReqId: string): string {
  if (!KIT_ID_RE.test(kitId)) { throw new TypeError(`kitId "${kitId}" 非法：须匹配 ${KIT_ID_RE}`); }
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(op)) { throw new TypeError(`kit op "${op}" 非法`); }
  return deriveOpId(uid, sId, `kit:${kitId}:${op}`, clientReqId);
}

type KitQueryParam = null | string | number | bigint | boolean | Date | Buffer;

/** 预处理语句参数只允许原始值 / Date / Buffer：⛔ `toSqlString` 一类对象（客户端拼接 SQL 绕过表闸）。 */
function assertQueryParams(params: unknown[], kitId: string): asserts params is KitQueryParam[] {
  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    const ok = p === null || typeof p === "string" || typeof p === "number" || typeof p === "bigint"
      || typeof p === "boolean" || p instanceof Date || Buffer.isBuffer(p);
    if (!ok) { throw new KitTableAccessError(kitId, `params[${i}]`, "参数只允许 null / string / number / bigint / boolean / Date / Buffer"); }
  }
}

/** effect 里的每个 kit kind 必须属于本 kit（`spec.kitId === kitId`）；未登记 kind 由 canonicalizeEffect 先拒。 */
export function assertKitEffectScope(kitId: string, effect: IEffect, kinds: KitEffectKinds): void {
  for (const grant of effect.grants) {
    if (!grant.kind.startsWith("kit:")) { continue; }
    const spec = lookupKitEffectKind(grant.kind, kinds);
    if (spec === undefined) { throw new InvalidEffectError("EFFECT_UNKNOWN_KIND"); }
    if (spec.kitId !== kitId) { throw new KitEffectScopeError(kitId, grant.kind); }
  }
}

/** 提交后要失效余额缓存的主体集合：按 (uid, owner) 去重（缓存键随主体，MF2-B3）。 */
type TouchedOwners = Map<string, { readonly uid: string; readonly owner: AssetOwnerRef | undefined }>;
const touchKey = (uid: string, owner: AssetOwnerRef | undefined): string => `${uid}|${owner === undefined ? "account" : assetOwnerKey(owner)}`;

const ROWS_MATCHED = /Rows matched:\s*(\d+)/u;
const rowsMatched = (result: ResultSetHeader): number => {
  const match = ROWS_MATCHED.exec(result.info ?? "");
  return match === null ? result.affectedRows : Number(match[1]);
};

/** `withKitTx` / `withKitWorkerTx` 共用的受限句柄（不含 `conn`：普通 kit 事务补上原始连接，worker 事务补上抛错 getter）。 */
function buildKitTx(conn: PoolConnection, kitId: string, sId: number, touched: TouchedOwners, deps: KitTxDeps): Omit<KitTx, "conn"> {
  // persona 锁序（MF2-B4）：account 作用域必须先于任何 persona 行锁；persona 行锁按 id 升序。变异验证：删升序判定 → 单测「乱序锁」转红。
  const lockOrder: { lastPersonaId: string | null } = { lastPersonaId: null };
  const takePersonaLock = (personaId: string, what: string): void => {
    validatePersonaId(personaId, `${what}.personaId`);
    if (lockOrder.lastPersonaId !== null && personaId < lockOrder.lastPersonaId) {
      throw new PersonaLockOrderError(`${what}(${personaId}) 在 ${lockOrder.lastPersonaId} 之后——同一事务内 persona 锁序必须升序（先小后大）`);
    }
    lockOrder.lastPersonaId = personaId;
  };
  const PERSONA_ROW = "server_id = ? AND persona_id = ? AND kit_id = ?";
  const personaExists = async (personaId: string): Promise<RowDataPacket | undefined> => {
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT control_epoch, status, world_address FROM persona WHERE ${PERSONA_ROW}`, [sId, personaId, kitId]);
    return rows[0];
  };
  return {
    kitId, sId,
    async createPersona(uid, slot, meta) {
      if (!uid || uid.length > 32) { throw new TypeError("kit uid invalid"); }
      if (!Number.isInteger(slot) || slot < 0) { throw new TypeError(`persona slot ${slot} 非法`); }
      if (slot >= PERSONA_MAX_SLOTS_HARD) { throw new RangeError(`persona slot ${slot} ≥ 硬上限 PERSONA_MAX_SLOTS_HARD=${PERSONA_MAX_SLOTS_HARD}（产品上限归 kit，须更小）`); }
      if (lockOrder.lastPersonaId !== null) {
        throw new PersonaLockOrderError(`createPersona（account 作用域）必须先于本事务内任何 persona 行锁（已锁 ${lockOrder.lastPersonaId}）`);
      }
      const metaJson = meta === undefined ? null : JSON.stringify(meta);
      if (metaJson !== null && metaJson.length > 4096) { throw new RangeError("persona meta 超过 4 KB"); }
      // account 作用域锁：该账号在本 kit / 本区的 persona 行集 + 间隙（同账号并发建角串行化），⛔ 先于 persona 行锁
      await conn.execute("SELECT persona_id FROM persona WHERE server_id = ? AND user_id = ? AND kit_id = ? FOR UPDATE", [sId, uid, kitId]);
      const personaId = randomUUID();
      try {
        await conn.execute<ResultSetHeader>(
          "INSERT INTO persona (server_id, persona_id, user_id, kit_id, slot, meta) VALUES (?,?,?,?,?,CAST(? AS JSON))",
          [sId, personaId, uid, kitId, slot, metaJson]);
      } catch (error) {
        if ((error as { errno?: unknown }).errno === 1062) { throw new PersonaSlotTakenError(uid, kitId, slot); } // ⛔ 不吞：同槽二建就是冲突
        throw error;
      }
      return personaId;
    },
    async assertControl(personaId, controlEpoch) {
      if (!Number.isInteger(controlEpoch) || controlEpoch < 0) { throw new TypeError(`controlEpoch ${controlEpoch} 非法`); }
      takePersonaLock(personaId, "assertControl");
      // Rows matched（⛔ 不是 affectedRows：池已关 CLIENT_FOUND_ROWS，同毫秒重复 CAS 会报 Changed 0）；谓词里的 control_epoch 就是存储边界
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE persona SET updated_at = NOW(3) WHERE ${PERSONA_ROW} AND control_epoch = ?`,
        [sId, personaId, kitId, controlEpoch]);
      if (rowsMatched(result) === 1) { return; }
      const row = await personaExists(personaId);
      if (row === undefined) { throw new PersonaNotFoundError(personaId); }
      throw new ControlConflictError(personaId, controlEpoch, Number(row.control_epoch));
    },
    async deactivatePersona(personaId) {
      takePersonaLock(personaId, "deactivatePersona");
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE persona SET status = 1 WHERE ${PERSONA_ROW} AND world_address IS NULL`, [sId, personaId, kitId]);
      if (rowsMatched(result) === 1) { return; }
      const row = await personaExists(personaId);
      if (row === undefined) { throw new PersonaNotFoundError(personaId); }
      throw new PersonaBusyError(personaId, `仍在世界房 ${String(row.world_address)}`);
    },
    async deletePersona(personaId) {
      takePersonaLock(personaId, "deletePersona");
      const [result] = await conn.execute<ResultSetHeader>(
        `DELETE FROM persona WHERE ${PERSONA_ROW} AND status = 1 AND world_address IS NULL`, [sId, personaId, kitId]);
      if (result.affectedRows === 1) { return; }
      const row = await personaExists(personaId);
      if (row === undefined) { throw new PersonaNotFoundError(personaId); }
      throw new PersonaBusyError(personaId, Number(row.status) === 1 ? `仍在世界房 ${String(row.world_address)}` : "仍 active（先 deactivatePersona）");
    },
    async query<R = RowDataPacket[] | ResultSetHeader>(sql: string, params: unknown[] = []): Promise<R> {
      assertKitTableAccess(sql, kitId);
      assertQueryParams(params, kitId);
      const [rows] = await conn.execute<RowDataPacket[] | ResultSetHeader>(sql, params);
      return rows as R;
    },
    async debit(uid, currency, amount, fence, opId, reason, owner) {
      const r = await deps.debitInTx(conn, uid, sId, currency, amount, fence, opId, reason, ...(owner === undefined ? [] : [owner] as const));
      if (r !== "DUP") { touched.set(touchKey(uid, owner), { uid, owner }); }
      return r;
    },
    async credit(uid, currency, amount, opId, reason, owner) {
      const r = await deps.creditInTx(conn, uid, sId, currency, amount, opId, reason, ...(owner === undefined ? [] : [owner] as const));
      if (r !== "DUP") { touched.set(touchKey(uid, owner), { uid, owner }); }
      return r;
    },
    async enqueueEffect(uid, opId, effect, owner) {
      const canonical = canonicalizeEffect(effect, deps.kinds);
      assertKitEffectScope(kitId, canonical, deps.kinds);
      const r = await deps.insertOutboxIntent(conn, { opId, uid, sId, effect: canonical, onDuplicate: "ignore", ...(owner === undefined ? {} : { owner }) }, deps.kinds);
      if (r === "DUP") { await deps.assertOutboxIntentMatches(conn, { opId, uid, sId, effect: canonical, ...(owner === undefined ? {} : { owner }) }, deps.kinds); }
      return r;
    },
  };
}

/** worker 事务作用域（租约名）：回调内再开 kit 事务一律拒——事务套事务 = 第二条连接绕过守卫首句。 */
const workerTxScope = new AsyncLocalStorage<string>();

function assertNotInsideWorkerTx(what: string): void {
  const inside = workerTxScope.getStore();
  if (inside !== undefined) { throw new Error(`kit worker 事务（${inside}）内 ⛔ 另开 ${what}`); }
}

/**
 * kit 事务（READ COMMITTED，与货币 / outbox 写路径同级，09·DB5）。`fn` 抛出即整体回滚；提交后对每个
 * 扣过款 / 入过账的 uid 失效余额缓存（同 purchaseTx 的收尾）。`deps` 只给单测注入。
 */
export async function withKitTx<T>(
  kitId: string, sId: number, fn: (tx: KitTx) => Promise<T>, deps: KitTxDeps = DEFAULT_DEPS,
): Promise<T> {
  kitTablePrefix(kitId); // kitId 形态闸先于任何 SQL
  if (!Number.isInteger(sId) || sId < 0 || sId > 65535) { throw new TypeError(`sId ${sId} 非法`); }
  assertNotInsideWorkerTx("withKitTx");
  const touched: TouchedOwners = new Map();
  const result = await deps.withRcTx((conn) => fn({ conn, ...buildKitTx(conn, kitId, sId, touched, deps) }));
  for (const { uid, owner } of touched.values()) { await deps.invalidateBalanceCache(uid, sId, ...(owner === undefined ? [] : [owner] as const)); }
  return result;
}

// ── kit worker 的租约守卫受限事务（文件头第 6 条；docs/MMO.md MF7a-B3）─────────────────

/** worker 事务句柄：与 KitTx 同形但**没有** `conn`（运行时访问也抛），另带 worker 身份、本次守卫通过的 fence 与世界事件消费口（MF7b-B3）。 */
export interface KitWorkerTx extends Omit<KitTx, "conn">, KitWorldEventOps {
  readonly workerId: string;
  /** 守卫首句比对通过的 fence_token（写需要 fence 的行时用；⛔ 不是可信的「当前 fence」——事务提交后可能已被顶替）。 */
  readonly fenceToken: number;
}

/** `withKitWorkerTx` 的可注入依赖：KitTxDeps + 守卫（单测用假连接答 Rows matched；生产缺省 core/infra/lease.ts）+ 事件表声明集。 */
export interface KitWorkerTxDeps extends KitTxDeps {
  readonly renewLeaseGuard: typeof renewLeaseGuard;
  /** 本 kit 声明为 role:"world-event" 的表名（生产从 SERVER_KIT_CATALOG 读；夹具注入）。 */
  readonly worldEventTables?: (kitId: string) => readonly string[];
}

const DEFAULT_WORKER_DEPS: KitWorkerTxDeps = { ...DEFAULT_DEPS, renewLeaseGuard, worldEventTables: (kitId) => worldEventTablesOfKit(kitId) };

/**
 * kit worker 的租约守卫受限事务：`withRcTx` 内**首句** `renewLeaseGuard(conn, lease)`（同连接同事务；`UPDATE singleton_lease …
 * WHERE lease_name = ? AND holder = ? AND fence_token = ?`，Rows matched 0 ⇒ 抛 LeaseLostError，自动 ROLLBACK，回调零执行），
 * 再交出受限句柄（表闸 / debit / credit / enqueueEffect 同 withKitTx）。租约名必须恰是 `kit:<kitId>:<workerId>`；
 * 回调内 ⛔ 另开 withKitTx / withKitWorkerTx、⛔ 取 `.conn`。提交后对扣过款 / 入过账的 uid 失效余额缓存。
 * worker 主循环捕获 LeaseLostError 后必须退出进程（僵尸 leader，09·X7），⛔ 不重试。
 */
export async function withKitWorkerTx<T>(
  kitId: string, workerId: string, sId: number, lease: SingletonLease,
  fn: (tx: KitWorkerTx) => Promise<T>, deps: KitWorkerTxDeps = DEFAULT_WORKER_DEPS,
): Promise<T> {
  kitTablePrefix(kitId); // kitId 形态闸先于任何 SQL
  const leaseName = kitWorkerLeaseName(kitId, workerId);
  if (lease.leaseName !== leaseName) { throw new TypeError(`租约 "${lease.leaseName}" 不属于 worker ${leaseName}（⛔ 借别的 worker 的租约写）`); }
  if (!Number.isInteger(lease.fenceToken) || lease.fenceToken < 1) { throw new TypeError(`租约 fence_token ${lease.fenceToken} 非法（抢占后 ≥ 1）`); }
  if (!Number.isInteger(sId) || sId < 0 || sId > 65535) { throw new TypeError(`sId ${sId} 非法`); }
  assertNotInsideWorkerTx("withKitWorkerTx");
  const touched: TouchedOwners = new Map();
  const result = await deps.withRcTx(async (conn) => {
    // 首句：续租守卫。0 行 = 已被顶替（或手上是旧 fence 的残留 lease 对象）⇒ 抛出，withRcTx ROLLBACK，业务表零写入。
    if (!await deps.renewLeaseGuard(conn, lease)) { throw new LeaseLostError(leaseName); }
    const eventTables = (deps.worldEventTables ?? DEFAULT_WORKER_DEPS.worldEventTables ?? (() => []))(kitId);
    const tx: KitWorkerTx = Object.defineProperty(
      { ...buildKitTx(conn, kitId, sId, touched, deps), ...buildWorldEventOps(conn, kitId, sId, eventTables), workerId, fenceToken: lease.fenceToken },
      "conn", { enumerable: false, get(): never { throw new Error(`kit worker 事务（${leaseName}）⛔ 取原始连接 .conn`); } },
    );
    return workerTxScope.run(leaseName, () => fn(Object.freeze(tx)));
  });
  for (const { uid, owner } of touched.values()) { await deps.invalidateBalanceCache(uid, sId, ...(owner === undefined ? [] : [owner] as const)); }
  return result;
}

// ── 世界形态的权威守卫受限事务（文件头第 7 条；docs/MMO.md MF7b-B2 / §4.6 不变量 1）───────────────

/** 世界事务作用域：权威代是首句 CAS 的谓词；personas（可选）逐个 assertControl（框架按 id 升序取锁）。 */
export interface KitWorldTxScope {
  readonly instanceId: string;
  readonly authorityEpoch: number;
  readonly personas?: readonly { readonly id: string; readonly controlEpoch: number }[];
}

/** 世界事件行（框架固定列；表由 kit 选、以 role:"world-event" 声明）。 */
export interface KitWorldEventInput {
  /** 服务端 uuid 字符串（与 op_id 同源：worker 执行时的幂等键）。 */
  readonly eventId: string;
  /** 分线内单调序号（WorldRuntime 分配）。 */
  readonly seq: number;
  readonly kind: string;
  readonly payload: unknown;
  /** 产生它的分线状态所对应的**下一个将落盘**的分线检查点 rev（§7.3 原子规则 ①）。 */
  readonly checkpointRev: number;
  /** 缺省 = 作用域的 instanceId。 */
  readonly instanceId?: string;
}

/**
 * 世界事件消费口（MF7b-B3；docs/MMO.md §7.3 事件批与分线检查点的原子规则）：worker 事务与世界事务共用。
 *  - `claimWorldEvents`：只认领 `checkpoint_rev ≤ world_instance.checkpoint_rev`（该事件所属状态的分线检查点已落库）且 `attempts < 上限`
 *    的 pending 行——status 0 → 1、attempts + 1（认领与效果同一事务：整轮提交即 done；整轮抛出 = 回滚重放，效果以 eventId 作 opId 幂等）；
 *  - `releaseWorldEvent`：单个事件本轮失败但别拖累整轮——放回 pending（attempts 已在认领时 +1；达上限 ⇒ dead 2）；
 *  - `deadLetterWorldEvent`：不可重试错误直接死信（2）。superseded（3）由 Recovering 标（rooms/core/WorldEventPort.ts）。
 */
export interface KitWorldEventRow {
  readonly eventId: string;
  readonly instanceId: string;
  readonly seq: number;
  readonly kind: string;
  readonly payload: unknown;
  /** 含本次认领的 +1。 */
  readonly attempts: number;
  readonly checkpointRev: number;
}

export interface KitWorldEventClaimOptions {
  readonly instanceId?: string;
  /** 缺省 32，上限 256。 */
  readonly limit?: number;
}

export interface KitWorldEventOps {
  claimWorldEvents(table: string, options?: KitWorldEventClaimOptions): Promise<readonly KitWorldEventRow[]>;
  releaseWorldEvent(table: string, eventId: string): Promise<"pending" | "dead">;
  deadLetterWorldEvent(table: string, eventId: string): Promise<void>;
}

export const WORLD_EVENT_CLAIM_LIMIT_DEFAULT = 32;
export const WORLD_EVENT_CLAIM_LIMIT_MAX = 256;
/** 认领次数上限（含）：达到即不再认领、release 时转 dead（§7.3 死信同 outbox 口径）。 */
export const WORLD_EVENT_MAX_ATTEMPTS = 5;

/** 认领 SELECT（FOR UPDATE）：门 = `e.checkpoint_rev <= w.checkpoint_rev`（变异：删掉它 → int「检查点未落库的事件被执行」转红）。 */
export function claimWorldEventsSql(table: string, withInstance: boolean, limit: number): string {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > WORLD_EVENT_CLAIM_LIMIT_MAX) { throw new RangeError(`claimWorldEvents：limit ${limit} 非法（1..${WORLD_EVENT_CLAIM_LIMIT_MAX}）`); }
  return "SELECT e.event_id, e.instance_id, e.seq, e.kind, e.payload, e.attempts, e.checkpoint_rev "
    + `FROM \`${table}\` e JOIN world_instance w ON w.server_id = e.server_id AND w.instance_id = e.instance_id `
    + `WHERE e.server_id = ?${withInstance ? " AND e.instance_id = ?" : ""} AND e.status = 0 AND e.attempts < ? AND e.checkpoint_rev <= w.checkpoint_rev `
    + `ORDER BY e.seq LIMIT ${limit} FOR UPDATE`;
}

function buildWorldEventOps(conn: PoolConnection, kitId: string, sId: number, eventTables: readonly string[]): KitWorldEventOps {
  const parsePayload = (value: unknown): unknown => {
    if (typeof value !== "string") { return value; }
    try { return JSON.parse(value) as unknown; } catch { return value; }
  };
  return {
    async claimWorldEvents(table, options = {}) {
      const target = assertWorldEventTable(kitId, table, eventTables);
      const limit = options.limit ?? WORLD_EVENT_CLAIM_LIMIT_DEFAULT;
      const withInstance = options.instanceId !== undefined;
      if (withInstance && (typeof options.instanceId !== "string" || options.instanceId.length === 0 || options.instanceId.length > 64)) { throw new TypeError("claimWorldEvents：instanceId 非法"); }
      const params: (string | number)[] = withInstance ? [sId, options.instanceId as string, WORLD_EVENT_MAX_ATTEMPTS] : [sId, WORLD_EVENT_MAX_ATTEMPTS];
      const [rows] = await conn.execute<RowDataPacket[]>(claimWorldEventsSql(target, withInstance, limit), params);
      const claimed: KitWorldEventRow[] = [];
      for (const row of rows) {
        const eventId = String(row.event_id);
        const [result] = await conn.execute<ResultSetHeader>(
          `UPDATE \`${target}\` SET status = 1, attempts = attempts + 1 WHERE server_id = ? AND event_id = ? AND status = 0`, [sId, eventId]);
        if (rowsMatched(result) !== 1) { continue; } // 并发已被别的事务认领（同表多 worker）：跳过
        claimed.push({
          eventId, instanceId: String(row.instance_id), seq: Number(row.seq), kind: String(row.kind), payload: parsePayload(row.payload),
          attempts: Number(row.attempts) + 1, checkpointRev: Number(row.checkpoint_rev),
        });
      }
      return claimed;
    },
    async releaseWorldEvent(table, eventId) {
      const target = assertWorldEventTable(kitId, table, eventTables);
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE \`${target}\` SET status = IF(attempts >= ?, 2, 0) WHERE server_id = ? AND event_id = ? AND status = 1`, [WORLD_EVENT_MAX_ATTEMPTS, sId, eventId]);
      if (rowsMatched(result) !== 1) { throw new Error(`releaseWorldEvent：事件 ${eventId} 不在本事务认领态（status 1）`); }
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT status FROM \`${target}\` WHERE server_id = ? AND event_id = ?`, [sId, eventId]);
      return Number(rows[0]?.status) === 2 ? "dead" : "pending";
    },
    async deadLetterWorldEvent(table, eventId) {
      const target = assertWorldEventTable(kitId, table, eventTables);
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE \`${target}\` SET status = 2 WHERE server_id = ? AND event_id = ? AND status IN (0, 1)`, [sId, eventId]);
      if (rowsMatched(result) !== 1) { throw new Error(`deadLetterWorldEvent：事件 ${eventId} 不是 pending / 认领态`); }
    },
  };
}

/** 世界事务句柄：与 KitTx 同形但**没有** `conn`，另带分线身份、首句 CAS 后的 write_seq、事件追加口与消费口。 */
export interface KitWorldTx extends Omit<KitTx, "conn">, KitWorldEventOps {
  readonly instanceId: string;
  readonly authorityEpoch: number;
  /** 首句 CAS 后本事务在该权威代内的写序号（单调；MF7b 检查点 / 事件批的排序依据）。 */
  readonly writeSeq: number;
  /** 追加世界事件行（只许本 kit 的 role:"world-event" 表）；UNIQUE(event_id) 撞车 ⇒ "DUP"（重放同一事件零副作用）。 */
  appendWorldEvent(table: string, event: KitWorldEventInput): Promise<"INSERTED" | "DUP">;
}

export interface KitWorldTxDeps extends KitTxDeps {
  /** 本 kit 声明为 role:"world-event" 的表名（生产从 SERVER_KIT_CATALOG 读；夹具注入）。 */
  readonly worldEventTables: (kitId: string) => readonly string[];
}

export function worldEventTablesOfKit(kitId: string, catalog: readonly ServerKitCatalogEntry[] = SERVER_KIT_CATALOG): readonly string[] {
  const kit = catalog.find((entry) => entry.id === kitId);
  return kit === undefined ? [] : kit.sqlTables.filter((table) => table.role === "world-event").map((table) => table.name);
}

const DEFAULT_WORLD_DEPS: KitWorldTxDeps = { ...DEFAULT_DEPS, worldEventTables: (kitId) => worldEventTablesOfKit(kitId) };

const WORLD_EVENT_KIND_RE = /^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u;
/** world-event 表名形态：`k_<kit>_<name>`（与 tools/plugin/workerGate.ts 的 KIT_TABLE_RE 同形）。 */
const WORLD_EVENT_TABLE_RE = /^k_[a-z0-9]{1,64}_[A-Za-z0-9_]{1,64}$/u;
const WORLD_EVENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/u;

/** 世界事件表名闸：必须是本 kit 前缀 + 在 role:"world-event" 声明集内（⛔ 普通 kit 表、⛔ 别的 kit、⛔ 框架表）。 */
export function assertWorldEventTable(kitId: string, table: string, tables: readonly string[]): string {
  const prefix = kitTablePrefix(kitId);
  if (typeof table !== "string" || !table.startsWith(prefix) || !WORLD_EVENT_TABLE_RE.test(table)) {
    throw new KitTableAccessError(kitId, table, `world-event 表名必须带前缀 ${prefix} 且为合法标识符`);
  }
  if (!tables.includes(table)) {
    throw new KitTableAccessError(kitId, table, "不是本 kit 以 role:\"world-event\" 声明的表");
  }
  return table;
}

/**
 * 世界形态的权威守卫受限事务（docs/MMO.md MF7b-B2；§4.6 不变量 1「旧 epoch 的延迟提交被存储边界拒」的唯一实现点）：
 * `withRcTx` 内**首句** `UPDATE world_instance SET write_seq = write_seq + 1 WHERE server_id = ? AND instance_id = ? AND authority_epoch = ?`
 * （Rows matched 0 ⇒ AuthorityLostError，自动 ROLLBACK，回调零执行；⛔ 不碰 checkpoint_rev），读回 write_seq，再按 id 升序对
 * `scope.personas` 逐个 `assertControl`（0 行 ⇒ ControlConflictError 同样整体回滚），然后交出受限句柄（表闸 / debit / credit /
 * enqueueEffect / persona 门面同 withKitTx）+ `appendWorldEvent`。回调内 ⛔ 另开 withKitTx / withKitWorkerTx / withKitWorldTx、⛔ 取 `.conn`。
 * 提交后对扣过款 / 入过账的 uid 失效余额缓存。变异验证：删首句谓词 `authority_epoch = ?` → int「旧 owner 迟到写 0 行」转红。
 */
export async function withKitWorldTx<T>(
  kitId: string, sId: number, scope: KitWorldTxScope, fn: (tx: KitWorldTx) => Promise<T>, deps: KitWorldTxDeps = DEFAULT_WORLD_DEPS,
): Promise<T> {
  kitTablePrefix(kitId); // kitId 形态闸先于任何 SQL
  if (!Number.isInteger(sId) || sId < 0 || sId > 65535) { throw new TypeError(`sId ${sId} 非法`); }
  if (typeof scope.instanceId !== "string" || scope.instanceId.length === 0 || scope.instanceId.length > 64) { throw new TypeError("world tx：instanceId 非法"); }
  if (!Number.isInteger(scope.authorityEpoch) || scope.authorityEpoch < 1) { throw new TypeError(`world tx：authorityEpoch ${scope.authorityEpoch} 非法（须 ≥ 1，先取权威）`); }
  const personas = [...(scope.personas ?? [])].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  for (const persona of personas) {
    validatePersonaId(persona.id, "world tx personas[].id");
    if (!Number.isInteger(persona.controlEpoch) || persona.controlEpoch < 0) { throw new TypeError(`world tx：persona ${persona.id} controlEpoch 非法`); }
  }
  assertNotInsideWorkerTx("withKitWorldTx");
  const eventTables = deps.worldEventTables(kitId);
  const touched: TouchedOwners = new Map();
  const scopeName = `world:${kitId}:${scope.instanceId}@${scope.authorityEpoch}`;
  const result = await deps.withRcTx(async (conn) => {
    // 首句：权威 CAS（谓词里的 authority_epoch 就是存储边界）。0 行 = 权威已被接管 ⇒ 抛出，withRcTx ROLLBACK，业务表零写入。
    const [cas] = await conn.execute<ResultSetHeader>(
      "UPDATE world_instance SET write_seq = write_seq + 1 WHERE server_id = ? AND instance_id = ? AND authority_epoch = ?",
      [sId, scope.instanceId, scope.authorityEpoch]);
    if (rowsMatched(cas) !== 1) { throw new AuthorityLostError(scope.instanceId, scope.authorityEpoch); }
    const [seqRows] = await conn.query<RowDataPacket[]>(
      "SELECT write_seq FROM world_instance WHERE server_id = ? AND instance_id = ?", [sId, scope.instanceId]);
    const writeSeq = Number(seqRows[0]?.write_seq);
    if (!Number.isSafeInteger(writeSeq) || writeSeq < 1) { throw new Error(`world tx：write_seq 回读非法：${String(seqRows[0]?.write_seq)}`); }
    const base = buildKitTx(conn, kitId, sId, touched, deps);
    // 控制权：逐 persona CAS（升序取锁；0 行 ⇒ ControlConflictError 整体回滚）
    for (const persona of personas) { await base.assertControl(persona.id, persona.controlEpoch); }
    const tx: KitWorldTx = Object.defineProperty(
      {
        ...base,
        ...buildWorldEventOps(conn, kitId, sId, eventTables),
        instanceId: scope.instanceId,
        authorityEpoch: scope.authorityEpoch,
        writeSeq,
        async appendWorldEvent(table: string, event: KitWorldEventInput): Promise<"INSERTED" | "DUP"> {
          const target = assertWorldEventTable(kitId, table, eventTables);
          if (!WORLD_EVENT_ID_RE.test(event.eventId)) { throw new TypeError(`world event：eventId "${event.eventId}" 非法`); }
          if (!Number.isSafeInteger(event.seq) || event.seq < 1) { throw new TypeError(`world event：seq ${event.seq} 非法（≥ 1）`); }
          if (!WORLD_EVENT_KIND_RE.test(event.kind)) { throw new TypeError(`world event：kind "${event.kind}" 非法`); }
          if (!Number.isSafeInteger(event.checkpointRev) || event.checkpointRev < 1) { throw new TypeError(`world event：checkpointRev ${event.checkpointRev} 非法（≥ 1）`); }
          const instanceId = event.instanceId ?? scope.instanceId;
          const payloadJson = JSON.stringify(event.payload ?? null);
          if (payloadJson.length > 16_384) { throw new RangeError("world event：payload 超过 16 KB"); }
          try {
            await conn.execute<ResultSetHeader>(
              `INSERT INTO \`${target}\` (server_id, event_id, instance_id, seq, kind, payload, status, attempts, checkpoint_rev) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), 0, 0, ?)`,
              [sId, event.eventId, instanceId, event.seq, event.kind, payloadJson, event.checkpointRev]);
          } catch (error) {
            if ((error as { errno?: unknown }).errno === 1062) { return "DUP"; } // 同 event_id 再插 = 重放，零副作用
            throw error;
          }
          return "INSERTED";
        },
      },
      "conn", { enumerable: false, get(): never { throw new Error(`world 事务（${scopeName}）⛔ 取原始连接 .conn`); } },
    );
    return workerTxScope.run(scopeName, () => fn(Object.freeze(tx)));
  });
  for (const { uid, owner } of touched.values()) { await deps.invalidateBalanceCache(uid, sId, ...(owner === undefined ? [] : [owner] as const)); }
  return result;
}

// ── kit worker 定义（docs/MMO.md MF7a-B4）：entry 默认导出 `defineKitWorker({ pass })`，进程入口 src/workers/kitWorker.ts ──

export interface KitWorkerPassContext {
  readonly kitId: string;
  readonly workerId: string;
  /** 本轮所在区（入口按 KIT_WORKER_ZONES 逐区串行）。 */
  readonly sId: number;
  /** 本轮开始时刻（入口注入时钟）。 */
  readonly now: number;
  /** 进程要停（SIGTERM / SIGINT）时 aborted：长循环里看一眼即可，⛔ 不用来跨事务续命。 */
  readonly signal: AbortSignal;
}

export interface KitWorkerPassResult {
  /** true = 本区还有积压：入口立刻在同一区再跑一轮（有界批次由 pass 自己的 LIMIT 决定）；否则轮到下一区 / 空闲。 */
  readonly more?: boolean;
}

export interface KitWorkerDefinition {
  readonly kind: "kit-worker";
  /** 一轮 = 一条租约守卫事务（withKitWorkerTx）：抛出即整体回滚、本轮作废；LeaseLostError 由入口捕获后退出进程。 */
  readonly pass: (tx: KitWorkerTx, ctx: KitWorkerPassContext) => Promise<KitWorkerPassResult | undefined | void>;
  /** 全部区都无积压后的空闲等待（ms，缺省 1000，范围 100–60000；入口再按租约 TTL/3 封顶，空闲期每轮事务照样续租）。 */
  readonly idleMs: number;
}

const KIT_WORKER_IDLE_MIN_MS = 100;
const KIT_WORKER_IDLE_MAX_MS = 60_000;

/** kit worker entry 的默认导出构造器：`export default defineKitWorker({ async pass(tx, ctx) { … } })`。 */
export function defineKitWorker(def: { readonly pass: KitWorkerDefinition["pass"]; readonly idleMs?: number }): KitWorkerDefinition {
  if (typeof def?.pass !== "function") { throw new TypeError("defineKitWorker：pass 必须是函数"); }
  const idleMs = def.idleMs ?? 1000;
  if (!Number.isInteger(idleMs) || idleMs < KIT_WORKER_IDLE_MIN_MS || idleMs > KIT_WORKER_IDLE_MAX_MS) {
    throw new TypeError(`defineKitWorker：idleMs ${idleMs} 非法（${KIT_WORKER_IDLE_MIN_MS}–${KIT_WORKER_IDLE_MAX_MS}）`);
  }
  return Object.freeze({ kind: "kit-worker" as const, pass: def.pass, idleMs });
}

export function isKitWorkerDefinition(value: unknown): value is KitWorkerDefinition {
  if (typeof value !== "object" || value === null) { return false; }
  const v = value as { kind?: unknown; pass?: unknown; idleMs?: unknown };
  return v.kind === "kit-worker" && typeof v.pass === "function" && Number.isInteger(v.idleMs);
}

// ── 事务之外的两样门面（文件头第 4 / 5 条）─────────────────────────────────────

export type KitEffectApplyResult = "ok" | "dup" | "cold" | "failed";

/** `applyKitEffect` 的可注入依赖（单测用假 redisApply / markOutboxDone；生产缺省即 outbox 既有实现）。 */
export interface KitEffectApplyDeps {
  readonly redisApply: (uid: string, opId: string, effect: IEffect) => Promise<"ok" | "dup" | "cold">;
  readonly markOutboxDone: (opId: string, sId: number) => Promise<void>;
  readonly kinds: KitEffectKinds;
}

const DEFAULT_APPLY_DEPS: KitEffectApplyDeps = {
  redisApply: (uid, opId, effect) => redisApply(uid, opId, effect),
  markOutboxDone,
  kinds: KIT_EFFECT_KINDS,
};

/**
 * 阶段 2/3 收尾（best-effort）：对 `withKitTx` 里已 `enqueueEffect` 且**已提交**的 intent 立即 redisApply
 * （applied 集合幂等 ⇒ 与 relayer 并发重放安全）+ markOutboxDone。显式按 `sId` 包 zoneCtx（与 drainPendingFor
 * 同理：⛔ 不信 ambient 区）。effect 先规范化并过本 kit 的 kind 闸（越界是编程错误，抛出）；之后任何失败
 * （Redis / MySQL / cold）都只映射成返回值——intent 已 durable，relayer 必定补发。
 */
export async function applyKitEffect(
  kitId: string, uid: string, sId: number, opId: string, effect: IEffect, deps: KitEffectApplyDeps = DEFAULT_APPLY_DEPS,
): Promise<KitEffectApplyResult> {
  kitTablePrefix(kitId); // kitId 形态闸
  if (!Number.isInteger(sId) || sId < 0 || sId > 65535) { throw new TypeError(`sId ${sId} 非法`); }
  const canonical = canonicalizeEffect(effect, deps.kinds);
  assertKitEffectScope(kitId, canonical, deps.kinds);
  try {
    return await zoneCtx.run({ sId }, async () => {
      const r = await deps.redisApply(uid, opId, canonical);
      if (r === "ok" || r === "dup") {
        try { await deps.markOutboxDone(opId, sId); } catch { /* 阶段 3 best-effort：relayer 重放判 dup 后补标 */ }
      }
      return r;
    });
  } catch {
    return "failed";
  }
}

/** `readKitUserField` 的可注入依赖（单测用假 HGET / 自己的 userKeys 表）。 */
export interface KitUserReadDeps {
  readonly hget: (uid: string, key: string, field: string) => Promise<string | null>;
  readonly userKeysOf: (kitId: string) => readonly string[] | undefined;
}

const DEFAULT_READ_DEPS: KitUserReadDeps = {
  hget: (uid, key, field) => clientFor(uid).hget(key, field),
  userKeysOf: (kitId) => SERVER_KIT_CATALOG.find((kit) => kit.id === kitId)?.userKeys,
};

/** kit 读了未在自己 `kit.json.userKeys` 里登记的 per-user 键名时抛出（写侧 effect 通道只认登记过的键）。 */
export class KitUserKeyScopeError extends Error {
  readonly kitId: string;
  readonly keyName: string;
  constructor(kitId: string, keyName: string) {
    super(`kit "${kitId}" 的 per-user 键越界：name "${keyName}" 不在其 kit.json.userKeys 里`);
    this.name = "KitUserKeyScopeError";
    this.kitId = kitId;
    this.keyName = keyName;
  }
}

/**
 * 只读 HGET 本 kit 的 per-user HASH 一个字段（`kKitUser(kitId, name, uid, scope)`）；缺席 = null。
 * `name` 必须是本 kit 登记的 userKey（未登记的 kit / 键名 ⇒ KitUserKeyScopeError）。写侧 ⛔ 无对应门面：
 * `kt:` per-user 键只经 outbox effect 累加（KIT.md §5 写侧契约）。
 */
export async function readKitUserField(
  kitId: string, name: string, uid: string, field: string, scope: KitKeyScope, deps: KitUserReadDeps = DEFAULT_READ_DEPS,
): Promise<string | null> {
  kitTablePrefix(kitId);
  const userKeys = deps.userKeysOf(kitId);
  if (userKeys === undefined || !userKeys.includes(name)) { throw new KitUserKeyScopeError(kitId, name); }
  return deps.hget(uid, kKitUser(kitId, name, uid, scope), field);
}

/** SQL 权威 kit 的显式区读取；不依赖 RPC/房间的 ambient zoneCtx。 */
export function readKitUserFieldInZone(
  kitId: string, name: string, uid: string, field: string, sId: number, deps: KitUserReadDeps = DEFAULT_READ_DEPS,
): Promise<string | null> {
  if (!Number.isInteger(sId) || sId < 0 || sId > 65535) throw new TypeError("kit sId invalid");
  return zoneCtx.run({ sId }, () => readKitUserField(kitId, name, uid, field, { zone: "per-zone" }, deps));
}
