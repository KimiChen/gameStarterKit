/**
 * kit-api/server 门面（docs/KIT.md §4，框架文件；⛔ 不在任何 kit 包内）——框架给 kit 的三样插件与 kit
 * 自己都拿不到的东西：
 *   1. `withKitTx(kitId, sId, fn)`：限定在 `k_<kitId 小写>_*` 表的 READ COMMITTED 事务句柄——`tx.query()` 对
 *      每条 SQL 做表标识符闸（FROM / JOIN / INTO / UPDATE / TABLE(S) / TRUNCATE 后的标识符必须带本 kit 前缀，
 *      backtick / 裸名皆可，⛔ schema 限定、⛔ 别的 kit、⛔ 框架表）；框架表**只**经 debit / credit / enqueueEffect
 *      可达。提交后对事务内扣过款 / 入过账的每个 uid 失效余额缓存。
 *   2. `debit` / `credit`：经济主账本的事务内调用（currency.ts 的 debitInTx / creditInTx，sId 已绑定）。
 *   3. `enqueueEffect`：outbox intent 写入（outbox.insertOutboxIntent，sId 已绑定，ODKU no-op 形态 ⇒ "DUP"），
 *      与 1/2 同一事务 ⇒「世界状态在 SQL、经济在框架」之间的原子路径；阶段 2/3（redisApply / markOutboxDone）
 *      仍由调用方在事务外走 outbox 既有流程或留给 relayer 收敛。
 * effect kind 登记通道（`kit:<id>:<name>`）在 shared economy.ts + KIT_EFFECT_KINDS + Lua 镜像，不在本文件。
 *
 * kit 从 `apps/server/src/kits/<id>/**` 以相对路径 `../../core/infra/kitApi` 导入本文件；kit 需要的错误类型、
 * CUR_GOLD 与 `kKitUser` 一并从这里再导出，⛔ kit 不直接 import core/infra 其他模块（K1 路径级边界机检）。
 *
 * 表闸是**运行时 fail-closed 的字面扫描**，不是 SQL 解析器：先剥掉字符串字面量与注释（防在 FROM 与表名之间塞块注释
 * 绕过），再按关键字取其后的表引用列表（含逗号分隔的多表与别名）；识别不了的形态（CTE 名、`SELECT … INTO`、
 * 函数里的 `FROM`）一律按拒绝处理——kit 改写 SQL 即可。语句首词只允许 SELECT / INSERT / REPLACE / UPDATE /
 * DELETE / WITH：DDL 在事务里会隐式提交（KIT.md §5：表由 db:bootstrap 账本应用），⛔ 不给 kit 事务内跑。
 */
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "./mysql";
import { withRcTx } from "./mysql";
import type { IEffect } from "@game/shared";
import { creditInTx, debitInTx, invalidateBalanceCache } from "../economy/currency";
import { deriveOpId, insertOutboxIntent } from "../economy/outbox";
import { CUR_GOLD } from "./config";
import { InsufficientBalanceError, InvalidEffectError, RpcFault, StaleFenceError } from "../errors";
import { kKitUser } from "./keys";

export { CUR_GOLD, InsufficientBalanceError, InvalidEffectError, RpcFault, StaleFenceError, kKitUser };
export type { IEffect, PoolConnection, ResultSetHeader, RowDataPacket };

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

export interface KitTx {
  readonly conn: PoolConnection;
  readonly kitId: string;
  readonly sId: number;
  /** 只能碰 `k_<kitId 小写>_*` 表（运行时闸，见文件头）。 */
  query<T = RowDataPacket[] | ResultSetHeader>(sql: string, params?: unknown[]): Promise<T>;
  /** 扣款：ledger 幂等 → 余额 + fence 守卫；"DUP" = 同 opId 已扣过（事务内零写入）。 */
  debit(uid: string, currency: number, amount: number, fence: number, opId: string, reason: string): Promise<"DUP" | number>;
  /** 入账：ledger 幂等 → upsert 余额；"DUP" = 同 opId 已入过。 */
  credit(uid: string, currency: number, amount: number, opId: string, reason: string): Promise<"DUP" | number>;
  /** durable intent（阶段 1 的 outbox 半边）；"DUP" = 同 opId 已有 intent（ODKU no-op）。 */
  enqueueEffect(uid: string, opId: string, effect: IEffect): Promise<"INSERTED" | "DUP">;
}

/** 可注入的框架依赖（单测用假 pool / 假账本；生产缺省即真实实现）。 */
export interface KitTxDeps {
  readonly withRcTx: <T>(fn: (conn: PoolConnection) => Promise<T>) => Promise<T>;
  readonly debitInTx: typeof debitInTx;
  readonly creditInTx: typeof creditInTx;
  readonly insertOutboxIntent: typeof insertOutboxIntent;
  readonly invalidateBalanceCache: typeof invalidateBalanceCache;
}

const DEFAULT_DEPS: KitTxDeps = { withRcTx, debitInTx, creditInTx, insertOutboxIntent, invalidateBalanceCache };

const KIT_ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/u;

/** kit 的表前缀：`k_<id 小写>_`（kit.json id 无下划线 ⇒ 前缀之间不可能互为前缀）。 */
export function kitTablePrefix(kitId: string): string {
  if (!KIT_ID_RE.test(kitId)) { throw new TypeError(`kitId "${kitId}" 非法：须匹配 ${KIT_ID_RE}`); }
  return `k_${kitId.toLowerCase()}_`;
}

/** 语句首词白名单：事务内只允许 DML（DDL 隐式提交，KIT.md §5 表只经 db:bootstrap 账本应用）。 */
const ALLOWED_LEADING = new Set(["SELECT", "INSERT", "REPLACE", "UPDATE", "DELETE", "WITH"]);
/** 其后跟表引用的关键字。 */
const TABLE_KEYWORDS = new Set(["FROM", "JOIN", "INTO", "UPDATE", "TABLE", "TABLES", "TRUNCATE"]);
/** 表引用后不可能是别名的保留字（用来判断「下一个标识符是别名还是子句」）。 */
const NOT_ALIAS = new Set([
  "WHERE", "SET", "ON", "USING", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "NATURAL", "STRAIGHT_JOIN",
  "VALUES", "VALUE", "SELECT", "ORDER", "GROUP", "HAVING", "LIMIT", "FOR", "LOCK", "UNION", "EXCEPT", "INTERSECT",
  "PARTITION", "IGNORE", "FORCE", "USE", "AS", "WINDOW", "INTO", "FROM", "RETURNING", "DUPLICATE", "IF",
]);

type Token = { readonly kind: "ident" | "quoted" | "punct" | "other"; readonly text: string };

/**
 * 剥字符串字面量与注释（单/双引号字符串含反斜杠转义与双引号折叠；`-- ` / `#` 行注释；斜杠星号块注释）。
 * 未闭合 ⇒ 抛（fail-closed）。backtick 标识符保留给 tokenizer。
 */
function stripLiteralsAndComments(sql: string, kitId: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
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
const upper = (t: Token | undefined): string => (t !== undefined && t.kind === "ident" ? t.text.toUpperCase() : "");

/**
 * 纯函数表闸：返回 SQL 里被识别为表引用的全部标识符（已通过前缀检查），越界即抛 KitTableAccessError。
 * 导出给单测与 K1 的边界机检复用。
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
    seen.push(t.text);
  };
  for (let i = 0; i < tokens.length; i++) {
    const kw = upper(tokens[i]);
    if (!TABLE_KEYWORDS.has(kw)) { continue; }
    const prev = upper(tokens[i - 1]);
    // `ON DUPLICATE KEY UPDATE col = …` / `FOR UPDATE` 的 UPDATE 不是语句动词；`INTO TABLE` 交给 TABLE。
    if (kw === "UPDATE" && (prev === "KEY" || prev === "FOR")) { continue; }
    if (kw === "INTO" && upper(tokens[i + 1]) === "TABLE") { continue; }
    let j = i + 1;
    if ((kw === "TABLE" || kw === "TABLES") && upper(tokens[j]) === "IF") {
      // IF [NOT] EXISTS
      j += upper(tokens[j + 1]) === "NOT" ? 3 : 2;
    }
    // 表引用列表：name [. name] [[AS] alias] (, …)*；`(` 开头（派生表 / 子查询）不算表引用。
    for (;;) {
      const first = tokens[j];
      if (!isName(first) || (first.kind === "ident" && NOT_ALIAS.has(first.text.toUpperCase()))) {
        // `FROM (SELECT …)` / `JOIN (SELECT …)`：派生表，里面的 FROM 由外层扫描继续处理。
        if (first !== undefined && first.kind === "punct" && first.text === "(") { break; }
        // 关键字后没有可识别的表名（`SELECT … INTO @var`、`EXTRACT(YEAR FROM col)` 之类）：fail-closed。
        throw new KitTableAccessError(kitId, first?.text ?? "", `${kw} 后不是可识别的表引用`);
      }
      const dot = tokens[j + 1];
      if (dot !== undefined && dot.kind === "punct" && dot.text === ".") {
        throw new KitTableAccessError(kitId, first.text, "⛔ schema 限定名");
      }
      check(first);
      j += 1;
      // 别名
      if (upper(tokens[j]) === "AS") { j += 1; if (isName(tokens[j])) { j += 1; } }
      else if (isName(tokens[j]) && !(tokens[j].kind === "ident" && NOT_ALIAS.has(tokens[j].text.toUpperCase()))) { j += 1; }
      const comma = tokens[j];
      if (comma !== undefined && comma.kind === "punct" && comma.text === ",") { j += 1; continue; }
      break;
    }
  }
  return seen;
}

/** kit 命名空间化的 op_id：type = `kit:<kitId>:<op>`，与 shop.purchase / mail.attach 同一派生函数、永不碰撞。 */
export function kitOpId(kitId: string, uid: string, sId: number, op: string, clientReqId: string): string {
  if (!KIT_ID_RE.test(kitId)) { throw new TypeError(`kitId "${kitId}" 非法：须匹配 ${KIT_ID_RE}`); }
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(op)) { throw new TypeError(`kit op "${op}" 非法`); }
  return deriveOpId(uid, sId, `kit:${kitId}:${op}`, clientReqId);
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
        const [rows] = await conn.query(sql, params);
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
        return deps.insertOutboxIntent(conn, { opId, uid, sId, effect, onDuplicate: "ignore" });
      },
    };
    return fn(tx);
  });
  for (const uid of touched) { await deps.invalidateBalanceCache(uid, sId); }
  return result;
}
