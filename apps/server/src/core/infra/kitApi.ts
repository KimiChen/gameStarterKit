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
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "./mysql";
import { withRcTx } from "./mysql";
import type { IEffect, KitEffectKinds } from "@game/shared";
import { lookupKitEffectKind } from "@game/shared";
import { KIT_EFFECT_KINDS } from "@game/shared/kits/catalog.generated";
import { creditInTx, debitInTx, invalidateBalanceCache } from "../economy/currency";
import {
  assertOutboxIntentMatches, canonicalizeEffect, deriveOpId, insertOutboxIntent, markOutboxDone, redisApply,
} from "../economy/outbox";
import { CUR_GOLD } from "./config";
import {
  EffectConflictError, InsufficientBalanceError, InvalidEffectError, RpcFault, StaleFenceError,
} from "../errors";
import { type KitKeyScope, currentZoneId, kKitUser, zoneCtx } from "./keys";
import { clientFor } from "./redisRoute";
import { SERVER_KIT_CATALOG } from "../../kits/catalog.generated";

export { CUR_GOLD, EffectConflictError, InsufficientBalanceError, InvalidEffectError, RpcFault, StaleFenceError, currentZoneId, kKitUser };
export type { IEffect, KitKeyScope, PoolConnection, ResultSetHeader, RowDataPacket };

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
  /** 扣款：ledger 幂等 → 余额 + fence 守卫；"DUP" = 同 opId 已扣过（事务内零写入）。 */
  debit(uid: string, currency: number, amount: number, fence: number, opId: string, reason: string): Promise<"DUP" | number>;
  /** 入账：ledger 幂等 → upsert 余额；"DUP" = 同 opId 已入过。 */
  credit(uid: string, currency: number, amount: number, opId: string, reason: string): Promise<"DUP" | number>;
  /**
   * durable intent（阶段 1 的 outbox 半边）；"DUP" = 同 opId 已有**同载荷** intent（ODKU no-op 后回读比对），
   * 同 opId 不同载荷 ⇒ EffectConflictError；effect 里的 kit kind 必须是 `kit:<本 kitId>:*` ⇒ 否则 KitEffectScopeError。
   */
  enqueueEffect(uid: string, opId: string, effect: IEffect): Promise<"INSERTED" | "DUP">;
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

/**
 * kit 事务（READ COMMITTED，与货币 / outbox 写路径同级，09·DB5）。`fn` 抛出即整体回滚；提交后对每个
 * 扣过款 / 入过账的 uid 失效余额缓存（同 purchaseTx 的收尾）。`deps` 只给单测注入。
 */
export async function withKitTx<T>(
  kitId: string, sId: number, fn: (tx: KitTx) => Promise<T>, deps: KitTxDeps = DEFAULT_DEPS,
): Promise<T> {
  kitTablePrefix(kitId); // kitId 形态闸先于任何 SQL
  if (!Number.isInteger(sId) || sId < 0 || sId > 65535) { throw new TypeError(`sId ${sId} 非法`); }
  const touched = new Set<string>();
  const result = await deps.withRcTx(async (conn) => {
    const tx: KitTx = {
      conn, kitId, sId,
      async query<R = RowDataPacket[] | ResultSetHeader>(sql: string, params: unknown[] = []): Promise<R> {
        assertKitTableAccess(sql, kitId);
        assertQueryParams(params, kitId);
        const [rows] = await conn.execute<RowDataPacket[] | ResultSetHeader>(sql, params);
        return rows as R;
      },
      async debit(uid, currency, amount, fence, opId, reason) {
        const r = await deps.debitInTx(conn, uid, sId, currency, amount, fence, opId, reason);
        if (r !== "DUP") { touched.add(uid); }
        return r;
      },
      async credit(uid, currency, amount, opId, reason) {
        const r = await deps.creditInTx(conn, uid, sId, currency, amount, opId, reason);
        if (r !== "DUP") { touched.add(uid); }
        return r;
      },
      async enqueueEffect(uid, opId, effect) {
        const canonical = canonicalizeEffect(effect, deps.kinds);
        assertKitEffectScope(kitId, canonical, deps.kinds);
        const r = await deps.insertOutboxIntent(conn, { opId, uid, sId, effect: canonical, onDuplicate: "ignore" }, deps.kinds);
        if (r === "DUP") { await deps.assertOutboxIntentMatches(conn, { opId, uid, sId, effect: canonical }, deps.kinds); }
        return r;
      },
    };
    return fn(tx);
  });
  for (const uid of touched) { await deps.invalidateBalanceCache(uid, sId); }
  return result;
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
