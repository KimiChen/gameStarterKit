/**
 * kit SQL 迁移账本（docs/KIT.md §5）——纯函数 + 注入连接，⛔ 无 process.exit，db-bootstrap 与测试共用。
 *
 * - `splitSqlStatements`：把 `apps/kits/<id>/sql/NNN-<name>.sql` 切成单条语句（识别 `--` / `#` 行注释、
 *   块注释、三种引号与反斜杠转义；⛔ 拒 DELIMITER——kit 不允许 TRIGGER/PROCEDURE，也就没有多分隔符的理由）。
 * - `lintKitStatement`：语法级白名单（KIT.md §2「SQL 里 ⛔ …」的机检形态）：只放行 CREATE TABLE /
 *   ALTER TABLE ADD|MODIFY COLUMN、ADD [UNIQUE] INDEX|KEY / CREATE [UNIQUE] INDEX / INSERT [IGNORE] INTO，
 *   且每个表名都必须在 kit.json 声明且带 `k_<id 小写>_` 前缀；其余一律拒绝（fail-closed）。
 * - `applyKitMigrations`：在 `singleton_lease('db_bootstrap')` 下按 kit id + 文件序，只应用账本里没有的文件，
 *   逐条语句执行（一条语句一次 query，⛔ 不依赖 multipleStatements），已应用文件 sha256 变化即 fail-closed；
 *   账本按语句粒度记进度（`statement_count` / `applied_statements`）：文件先入账再执行、每条语句成功即推进，
 *   中途失败（DDL 已隐式提交）下次 bootstrap 从失败的那条续跑，⛔ 不会重跑已成功的 CREATE TABLE；
 *   随后 `verifyKitTableShapes` 按 `zone` 校验 server_id 形态（per-zone 进 PK 与每个 UNIQUE；global 不得有），
 *   并拒绝「库里有 `k_<id>_` 前缀表却未声明」；账本有而目录无的 kit 只告警（uninstall 默认保留表）。
 */
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import type { KitTableZone, ServerKitCatalogEntry } from "../src/kits/catalogTypes";
import { assertKitTablePrefixesUnique, kitTablePrefix } from "../src/core/infra/zoneTables";

/** 最小连接面：mysql2 Connection / PoolConnection 与测试假连接都满足。 */
export interface SqlConn {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
}

export const DB_BOOTSTRAP_LEASE = "db_bootstrap";
/** 迁移文件相对路径闸（与 kit-schema-v1.json `sql.files` 同一 pattern；⛔ 防路径穿越）。 */
const SQL_FILE_RE = /^sql\/[0-9]{3}-[a-z][a-z0-9-]{0,63}\.sql$/;

// ── 语句切分 ──────────────────────────────────────────────────────────────

/**
 * 把 SQL 文本切成语句（去掉注释，保留引号内原文）。`;` 只在引号 / 注释之外生效；
 * 空语句丢弃；出现 `DELIMITER` 指令即抛。
 */
export function splitSqlStatements(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  const n = text.length;
  let atLineStart = true;
  while (i < n) {
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : "";
    // 行首的 DELIMITER 指令（mysql 客户端语法，服务端不认）——kit 不得用
    if (atLineStart && /^[ \t]*delimiter\b/iu.test(text.slice(i, i + 64))) {
      throw new Error("kit SQL 不允许 DELIMITER 指令（kit ⛔ TRIGGER / PROCEDURE / FUNCTION，没有多分隔符的理由）");
    }
    if (ch === "\n") { atLineStart = true; cur += ch; i += 1; continue; }
    if (atLineStart && ch !== " " && ch !== "\t") { atLineStart = false; }
    // 行注释：`-- ` / `--<EOL>` / `#`
    if ((ch === "-" && next === "-" && (i + 2 >= n || /[ \t\r\n]/u.test(text[i + 2]))) || ch === "#") {
      while (i < n && text[i] !== "\n") { i += 1; }
      continue;
    }
    // 块注释。`/*! … */` 版本注释 MySQL 会执行其内容而切分器会剥掉——两者不一致即账本 sha 背书的不是实际执行的 DDL，⛔ 直接拒
    if (ch === "/" && next === "*") {
      if (text[i + 2] === "!") {
        throw new Error("kit SQL 不允许 /*! … */ 版本注释（服务端会执行其内容，账本无法为其背书；请写成普通语句）");
      }
      const end = text.indexOf("*/", i + 2);
      if (end < 0) { throw new Error("kit SQL 块注释未闭合"); }
      i = end + 2;
      cur += " ";
      continue;
    }
    if (ch === "'" || ch === "\"" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const c = text[j];
        if (c === "\\" && quote !== "`") { j += 2; continue; }
        if (c === quote) {
          if (text[j + 1] === quote) { j += 2; continue; } // '' / "" / `` 转义
          closed = true;
          break;
        }
        j += 1;
      }
      if (!closed) { throw new Error(`kit SQL 引号未闭合（${quote}）`); }
      cur += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === ";") {
      const s = cur.trim();
      if (s.length > 0) { out.push(s); }
      cur = "";
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  const tail = cur.trim();
  if (tail.length > 0) { out.push(tail); }
  return out;
}

// ── 语句 lint ─────────────────────────────────────────────────────────────

/** 把引号 / 反引号段替换成等长空白（保留位置），供关键字扫描与标识符提取用。 */
function blankQuoted(statement: string): string {
  let out = "";
  let i = 0;
  const n = statement.length;
  while (i < n) {
    const ch = statement[i];
    if (ch === "'" || ch === "\"" || ch === "`") {
      let j = i + 1;
      while (j < n) {
        const c = statement[j];
        if (c === "\\" && ch !== "`") { j += 2; continue; }
        if (c === ch) {
          if (statement[j + 1] === ch) { j += 2; continue; }
          break;
        }
        j += 1;
      }
      const end = Math.min(j + 1, n);
      // 反引号标识符保留原文（表名要读）；字符串字面量整段留白
      out += ch === "`" ? statement.slice(i, end) : " ".repeat(end - i);
      i = end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** 在已 blankQuoted 的视图上再把反引号标识符整段留白（等长），供关键字扫描 / 括号深度切分用——⛔ 标识符里的 `(` `,` 不得影响结构。 */
function blankIdents(blank: string): string {
  return blank.replace(/`[^`]*`/gu, (seg) => " ".repeat(seg.length));
}

/** 语句中任何位置都不许出现的关键字（无合法宿主：kit 允许的语句类型里用不到它们；同名列请加反引号）。
 *  `LOAD_FILE` 是函数名：种子行 VALUES 里读服务器文件系统没有任何 kit 理由。 */
const FORBIDDEN_ANYWHERE = ["DROP", "TRUNCATE", "RENAME", "TRIGGER", "EVENT", "PROCEDURE", "FUNCTION", "GRANT", "REVOKE", "LOAD_FILE"];
/** 表选项里指向服务器文件系统的子句（CREATE / ALTER 都不许）。 */
const FILE_DIRECTORY_RE = /\b(?:DATA|INDEX)\s+DIRECTORY\b/u;
/** 反引号标识符里不许出现的结构字符：它们能骗过括号深度 / 逗号切分（fail-closed，正常 kit 表 / 列名用不到）。
 *  逐段配对扫描（⛔ 不能用一个跨段正则：`a` (x, `b` 里两段之间的文本会被误当成标识符）。 */
function hasStructuralCharInIdent(blank: string): boolean {
  for (const m of blank.matchAll(/`[^`]*`/gu)) {
    if (/[(),;.]/u.test(m[0])) { return true; }
  }
  return false;
}
/** 语句头即拒绝的类型（给出点名信息，其余走「类型不在白名单」兜底）。 */
const FORBIDDEN_HEADS = ["DELETE", "UPDATE", "USE", "LOCK", "UNLOCK", "SET", "SELECT", "REPLACE", "CALL", "LOAD", "ALTER DATABASE", "CREATE DATABASE", "CREATE SCHEMA", "CREATE VIEW", "CREATE TEMPORARY"];

const IDENT = "(?:`[^`]+`|[A-Za-z_][A-Za-z0-9_$]*)";
const QUALIFIED_IDENT = new RegExp(`^${IDENT}\\s*\\.\\s*${IDENT}`, "u");

function unquoteIdent(raw: string): string {
  const s = raw.trim();
  return s.startsWith("`") ? s.slice(1, -1) : s;
}

function lintFail(kitId: string, reason: string, statement: string): never {
  throw new Error(`⛔ kit "${kitId}" 的 SQL 语句被拒绝：${reason}\n  语句：${statement.slice(0, 120)}`);
}

/**
 * 只放行白名单语句类型，且每个被引用的表都必须在 `declaredTables`（kit.json.sql.tables）内并带 `k_<id 小写>_` 前缀。
 * 抛错即拒绝（fail-closed）。
 */
export function lintKitStatement(statement: string, kitId: string, declaredTables: readonly string[]): void {
  const prefix = kitTablePrefix(kitId);
  const declared = new Set(declaredTables);
  const blank = blankQuoted(statement);
  if (hasStructuralCharInIdent(blank)) {
    lintFail(kitId, "反引号标识符里不得含 ( ) , ; . （它们会干扰语句结构判定）", statement);
  }
  if (blank.includes(";")) { lintFail(kitId, "一条字符串里含多条语句（`;`）——请用 splitSqlStatements 逐条传入", statement); }
  // 关键字扫描 / 结构切分用的视图：反引号标识符也留白（列名 `event` 合法），与 blank 等长；表名提取仍用 blank
  const structural = blankIdents(blank);
  const upper = structural.toUpperCase();
  const head = upper.trim();
  for (const kw of FORBIDDEN_HEADS) {
    if (new RegExp(`^${kw}\\b`, "u").test(head)) { lintFail(kitId, `不允许 ${kw} 语句`, statement); }
  }
  for (const kw of FORBIDDEN_ANYWHERE) {
    if (new RegExp(`\\b${kw}\\b`, "u").test(upper)) {
      lintFail(kitId, `不允许出现 ${kw}（同名列 / 索引请加反引号）`, statement);
    }
  }

  const assertTable = (rawName: string, role: string): void => {
    const raw = rawName.trim();
    if (QUALIFIED_IDENT.test(raw)) { lintFail(kitId, `${role} 不得带库名限定：${raw}`, statement); }
    const name = unquoteIdent(raw);
    if (!name.startsWith(prefix)) { lintFail(kitId, `${role} "${name}" 不带 kit 表前缀 ${prefix}`, statement); }
    if (!declared.has(name)) { lintFail(kitId, `${role} "${name}" 未在 kit.json.sql.tables 声明`, statement); }
  };

  // 外键 / REFERENCES 目标只能是本 kit 已声明的表（不论出现在哪种语句里）
  const refRe = new RegExp(`\\bREFERENCES\\s+(${IDENT}(?:\\s*\\.\\s*${IDENT})?)`, "giu");
  for (const m of blank.matchAll(refRe)) { assertTable(m[1], "REFERENCES 目标表"); }

  const trimmed = blank.trim();
  let m: RegExpMatchArray | null;

  // CREATE TABLE [IF NOT EXISTS] <t> (
  if ((m = trimmed.match(new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT}(?:\\s*\\.\\s*${IDENT})?)\\s*\\(`, "iu")))) {
    assertTable(m[1], "CREATE TABLE 表");
    if (/\bSELECT\b/iu.test(upper)) { lintFail(kitId, "CREATE TABLE … SELECT 不允许", statement); }
    // `(LIKE <t>)` 带括号形态会把任意表（含框架表）的定义复制进 kit 命名空间；列定义里用不到 LIKE
    if (/\bLIKE\b/u.test(upper)) { lintFail(kitId, "CREATE TABLE 不允许 LIKE（⛔ 复制别的表定义）", statement); }
    if (FILE_DIRECTORY_RE.test(upper)) { lintFail(kitId, "CREATE TABLE 不允许 DATA / INDEX DIRECTORY 表选项", statement); }
    return;
  }
  if (/^CREATE\s+TABLE\b/iu.test(trimmed)) {
    lintFail(kitId, "CREATE TABLE 只接受 `CREATE TABLE [IF NOT EXISTS] <t> ( … )` 形态（⛔ LIKE / AS SELECT）", statement);
  }

  // ALTER TABLE <t> <action>[, <action>…]
  if ((m = trimmed.match(new RegExp(`^ALTER\\s+TABLE\\s+(${IDENT}(?:\\s*\\.\\s*${IDENT})?)\\s+([\\s\\S]+)$`, "iu")))) {
    assertTable(m[1], "ALTER TABLE 表");
    // 多 action 按括号深度 0 的逗号切分——在反引号也留白的等长视图上切（⛔ 标识符里的 `(` 不能把后面的 action 藏进第一个里）
    const actionsStart = (blank.length - blank.trimStart().length) + m[0].length - m[2].length;
    const actionsView = structural.slice(actionsStart);
    const actionsRaw = blank.slice(actionsStart); // 等长；反引号标识符可读（server_id 判定要看名字）
    if (FILE_DIRECTORY_RE.test(upper)) { lintFail(kitId, "ALTER TABLE 不允许 DATA / INDEX DIRECTORY 表选项", statement); }
    for (const [from, to] of splitTopLevelCommas(actionsView)) {
      const action = actionsRaw.slice(from, to);
      const a = actionsView.slice(from, to).trim().toUpperCase();
      const ok = /^ADD\s+COLUMN\b/u.test(a)
        || /^ADD\s+(?:UNIQUE\s+)?(?:INDEX|KEY)\b/u.test(a)
        || /^MODIFY\s+COLUMN\b/u.test(a)
        || /^ALGORITHM\s*=\s*(?:INSTANT|INPLACE|COPY|DEFAULT)$/u.test(a)
        || /^LOCK\s*=\s*(?:NONE|SHARED|EXCLUSIVE|DEFAULT)$/u.test(a);
      if (!ok) {
        lintFail(kitId, `ALTER TABLE 只允许 ADD COLUMN / ADD [UNIQUE] INDEX|KEY / MODIFY COLUMN（不允许：${action.trim().slice(0, 60)}）`, statement);
      }
      // server_id 是区列（KIT.md §5）：形态由 CREATE TABLE 一次定死并经 verifyKitTableShapes 机检；
      // ALTER 改它只会在账本入账之后才被形态校验拒——这里提前 fail-closed
      if (/^\s*(?:ADD|MODIFY)\s+COLUMN\s+`?server_id`?(?![A-Za-z0-9_$])/iu.test(action)) {
        lintFail(kitId, "ALTER TABLE 不得 ADD / MODIFY COLUMN server_id（区列形态只能在 CREATE TABLE 里定义）", statement);
      }
    }
    return;
  }
  if (/^ALTER\b/iu.test(trimmed)) { lintFail(kitId, "只允许 ALTER TABLE", statement); }

  // CREATE [UNIQUE] INDEX <name> ON <t> (
  if ((m = trimmed.match(new RegExp(`^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+${IDENT}\\s+ON\\s+(${IDENT}(?:\\s*\\.\\s*${IDENT})?)\\s*\\(`, "iu")))) {
    assertTable(m[1], "CREATE INDEX 目标表");
    return;
  }
  if (/^CREATE\b/iu.test(trimmed)) { lintFail(kitId, "CREATE 只允许 TABLE / [UNIQUE] INDEX", statement); }

  // INSERT [IGNORE] INTO <t> (…) VALUES (…) [ON DUPLICATE KEY UPDATE …]
  if ((m = trimmed.match(new RegExp(`^INSERT\\s+(?:IGNORE\\s+)?INTO\\s+(${IDENT}(?:\\s*\\.\\s*${IDENT})?)\\s*\\(`, "iu")))) {
    assertTable(m[1], "INSERT 目标表");
    if (!/\bVALUES\s*\(/iu.test(upper)) { lintFail(kitId, "INSERT 只接受 VALUES 形态（⛔ INSERT … SELECT）", statement); }
    if (/\bSELECT\b/iu.test(upper)) { lintFail(kitId, "INSERT … SELECT 不允许", statement); }
    return;
  }
  if (/^INSERT\b/iu.test(trimmed)) {
    lintFail(kitId, "INSERT 只接受 `INSERT [IGNORE] INTO <t> (<cols>) VALUES (…)` 形态", statement);
  }

  lintFail(kitId, "语句类型不在白名单（CREATE TABLE / ALTER TABLE ADD|MODIFY / CREATE INDEX / INSERT）", statement);
}

/**
 * 按括号深度 0 的逗号切分（ALTER 的多 action），返回 [from, to) 区间。输入须是引号与反引号都已留白的视图
 * （blankIdents(blankQuoted(..))），区间可同时套用到等长的未留白视图上。空白段丢弃。
 */
function splitTopLevelCommas(view: string): [number, number][] {
  const parts: [number, number][] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < view.length; i += 1) {
    const ch = view[i];
    if (ch === "(") { depth += 1; }
    else if (ch === ")") { depth -= 1; }
    else if (ch === "," && depth === 0) { parts.push([from, i]); from = i + 1; }
  }
  parts.push([from, view.length]);
  return parts.filter(([a, b]) => view.slice(a, b).trim().length > 0);
}

// ── 账本驱动应用 ──────────────────────────────────────────────────────────

export interface AppliedMigration { readonly kitId: string; readonly file: string }

export interface ApplyKitMigrationsOptions {
  readonly conn: SqlConn;
  readonly dbName: string;
  readonly catalog: readonly ServerKitCatalogEntry[];
  /** 读 `apps/kits/<kitId>/<file>` 的文本（sha256 取其 utf8 字节）。 */
  readonly readSqlFile: (kitId: string, file: string) => string;
  readonly log?: (line: string) => void;
  /** 租约持有者标识（缺省 host:pid）。 */
  readonly holder?: string;
  /** 租约时长秒（缺省 600）。 */
  readonly leaseSeconds?: number;
}

export interface ApplyKitMigrationsReport {
  readonly applied: AppliedMigration[];
  readonly skipped: number;
  /** 账本里有、目录里没有的 kit id（uninstall 默认保留表，只告警不抛）。 */
  readonly orphanLedgerKits: string[];
}

type Row = Record<string, unknown>;

function rowsOf(result: unknown): Row[] {
  return Array.isArray(result) ? (result as Row[]) : [];
}

function affectedRowsOf(result: unknown): number {
  const r = result as { affectedRows?: unknown } | null;
  return typeof r?.affectedRows === "number" ? r.affectedRows : 0;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

async function acquireBootstrapLease(conn: SqlConn, holder: string, leaseSeconds: number): Promise<void> {
  const [existing] = await conn.query(
    "SELECT holder, expires_at FROM singleton_lease WHERE lease_name = ?",
    [DB_BOOTSTRAP_LEASE],
  );
  const rows = rowsOf(existing);
  if (rows.length === 0) {
    throw new Error(`singleton_lease 缺少 '${DB_BOOTSTRAP_LEASE}' 预置行（schema.sql 未跑到位？）`);
  }
  const [updated] = await conn.query(
    `UPDATE singleton_lease
        SET holder = ?, fence_token = fence_token + 1, expires_at = NOW(3) + INTERVAL ? SECOND
      WHERE lease_name = ? AND expires_at < NOW(3)`,
    [holder, leaseSeconds, DB_BOOTSTRAP_LEASE],
  );
  if (affectedRowsOf(updated) === 0) {
    throw new Error(`另一个 db:bootstrap 正在运行（${DB_BOOTSTRAP_LEASE} 租约被 ${String(rows[0].holder)} 持有）`);
  }
}

/**
 * 释放：expires_at 退到严格过去（NOW(3) - 1s）。抢占谓词是 `expires_at < NOW(3)`，若释放写成 `= NOW(3)`，
 * 同一毫秒内紧接着的下一次 bootstrap（测试 / 脚本连跑）会被自己上一轮的租约挡住（集成测试实证）。
 */
async function releaseBootstrapLease(conn: SqlConn, holder: string): Promise<void> {
  await conn.query(
    "UPDATE singleton_lease SET expires_at = NOW(3) - INTERVAL 1 SECOND WHERE lease_name = ? AND holder = ?",
    [DB_BOOTSTRAP_LEASE, holder],
  );
}

/** 账本一行：文件的 sha256 与语句粒度进度（`applied_statements` = 已成功执行的语句数）。 */
interface LedgerRow {
  readonly sha256: string;
  readonly statementCount: number;
  readonly appliedStatements: number;
}

function ledgerRowOf(row: Row): LedgerRow {
  return {
    sha256: String(row.sha256),
    statementCount: Number(row.statement_count ?? 0),
    appliedStatements: Number(row.applied_statements ?? 0),
  };
}

/**
 * 按 kit id 排序、按 sqlFiles 顺序应用账本里没有（或没跑完）的迁移文件；随后校验全部 kit 表形态。
 * 账本按语句粒度记进度：文件先以 applied_statements=0 入账，每条语句成功即 +1；
 * 上次中途失败的文件（sha 相同、进度未满）从失败那条续跑；任何一步抛错都会释放租约再上抛。
 */
export async function applyKitMigrations(options: ApplyKitMigrationsOptions): Promise<ApplyKitMigrationsReport> {
  const { conn, dbName, catalog, readSqlFile } = options;
  const log = options.log ?? ((): void => undefined);
  const holder = options.holder ?? `${hostname()}:${process.pid}`.slice(0, 64);
  const leaseSeconds = options.leaseSeconds ?? 600;
  assertKitTablePrefixesUnique(catalog);
  await acquireBootstrapLease(conn, holder, leaseSeconds);
  try {
    const applied: AppliedMigration[] = [];
    let skipped = 0;
    const kits = [...catalog].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const kit of kits) {
      const declaredTables = kit.sqlTables.map((t) => t.name);
      for (const file of kit.sqlFiles) {
        if (!SQL_FILE_RE.test(file)) {
          throw new Error(`kit "${kit.id}" 的迁移文件名非法：${file}（须匹配 sql/NNN-<name>.sql）`);
        }
        const text = readSqlFile(kit.id, file);
        const digest = sha256Hex(text);
        const [ledger] = await conn.query(
          "SELECT sha256, statement_count, applied_statements FROM kit_migration WHERE kit_id = ? AND file = ?",
          [kit.id, file],
        );
        const rows = rowsOf(ledger);
        const recorded = rows.length > 0 ? ledgerRowOf(rows[0]) : undefined;
        let start = 0;
        if (recorded) {
          const complete = recorded.appliedStatements >= recorded.statementCount;
          if (recorded.sha256 !== digest) {
            const progress = complete
              ? ""
              : `；该文件上次只跑到 ${recorded.appliedStatements}/${recorded.statementCount} 条就失败了，已执行的语句无法撤回`;
            throw new Error(
              `⛔ 已应用的迁移文件被改动：kit "${kit.id}" ${file}（账本 sha256=${recorded.sha256}，当前 sha256=${digest}）`
              + `——已发布迁移不可改，请追加新文件${progress}`,
            );
          }
          if (complete) { skipped += 1; continue; }
          start = recorded.appliedStatements;
        }
        const statements = splitSqlStatements(text);
        // 先全部 lint 再执行：任一语句不合规即整文件不动
        for (const statement of statements) { lintKitStatement(statement, kit.id, declaredTables); }
        if (recorded) {
          if (recorded.statementCount !== statements.length) {
            throw new Error(
              `⛔ kit "${kit.id}" ${file} 账本记的语句数（${recorded.statementCount}）与当前切分结果（${statements.length}）不一致`
              + "——切分器变了？请人工核对账本后再续跑",
            );
          }
          log(`  kit ${kit.id}: ${file} 上次跑到 ${start}/${statements.length} 条，续跑`);
        } else {
          await conn.query(
            "INSERT INTO kit_migration (kit_id, file, sha256, statement_count, applied_statements) VALUES (?, ?, ?, ?, 0)",
            [kit.id, file, digest, statements.length],
          );
        }
        for (let index = start; index < statements.length; index += 1) {
          try {
            await conn.query(statements[index]);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(
              `kit "${kit.id}" ${file} 第 ${index + 1}/${statements.length} 条语句执行失败：${message}`
              + `（账本已记进度 ${index}/${statements.length}；修复原因后重跑 db:bootstrap 从第 ${index + 1} 条续跑）`
              + `\n  语句：${statements[index].slice(0, 120)}`,
              { cause: error },
            );
          }
          await conn.query(
            "UPDATE kit_migration SET applied_statements = ?, applied_at = NOW(3) WHERE kit_id = ? AND file = ?",
            [index + 1, kit.id, file],
          );
        }
        applied.push({ kitId: kit.id, file });
        log(`  kit ${kit.id}: 已应用 ${file}（${statements.length - start} 条语句）`);
      }
    }

    await verifyKitTableShapes({ conn, dbName, catalog });

    const [ledgerKits] = await conn.query("SELECT DISTINCT kit_id FROM kit_migration");
    const known = new Set(catalog.map((k) => k.id));
    const orphanLedgerKits = rowsOf(ledgerKits)
      .map((r) => String(r.kit_id))
      .filter((id) => !known.has(id))
      .sort();
    for (const id of orphanLedgerKits) {
      log(`  ⚠ kit_migration 账本有 kit "${id}" 而目录无该 kit（表已保留；确认弃用后用 plugin -- uninstall ${id} --drop-data 清理）`);
    }
    return { applied, skipped, orphanLedgerKits };
  } finally {
    await releaseBootstrapLease(conn, holder);
  }
}

// ── 表形态校验 ─────────────────────────────────────────────────────────────

export interface VerifyKitTableShapesOptions {
  readonly conn: SqlConn;
  readonly dbName: string;
  readonly catalog: readonly ServerKitCatalogEntry[];
}

/**
 * 对每个 kit 声明的表：必须存在；per-zone ⇒ `server_id SMALLINT UNSIGNED NOT NULL` 且是 PRIMARY 与每个
 * UNIQUE 索引的列；global ⇒ 无 server_id。库里带 `k_<id 小写>_` 前缀却未声明的表 ⇒ 抛。
 */
export async function verifyKitTableShapes(options: VerifyKitTableShapesOptions): Promise<void> {
  const { conn, dbName, catalog } = options;
  assertKitTablePrefixesUnique(catalog);
  const [tableRows] = await conn.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
    [dbName],
  );
  const existing = new Set(rowsOf(tableRows).map((r) => String(r.TABLE_NAME)));
  const [columnRows] = await conn.query(
    `SELECT TABLE_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'server_id'`,
    [dbName],
  );
  const serverIdByTable = new Map<string, Row>();
  for (const r of rowsOf(columnRows)) { serverIdByTable.set(String(r.TABLE_NAME), r); }
  const [indexRows] = await conn.query(
    `SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND NON_UNIQUE = 0`,
    [dbName],
  );
  // table → indexName → columns
  const uniqueIndexes = new Map<string, Map<string, string[]>>();
  for (const r of rowsOf(indexRows)) {
    const table = String(r.TABLE_NAME);
    const index = String(r.INDEX_NAME);
    let byIndex = uniqueIndexes.get(table);
    if (!byIndex) { byIndex = new Map(); uniqueIndexes.set(table, byIndex); }
    let cols = byIndex.get(index);
    if (!cols) { cols = []; byIndex.set(index, cols); }
    cols.push(String(r.COLUMN_NAME));
  }

  const declaredAll = new Set<string>();
  for (const kit of catalog) {
    for (const table of kit.sqlTables) { declaredAll.add(table.name); }
  }
  for (const kit of catalog) {
    const prefix = kitTablePrefix(kit.id);
    for (const table of kit.sqlTables) {
      if (!existing.has(table.name)) {
        throw new Error(`kit "${kit.id}" 声明的表未被迁移创建：${table.name}`);
      }
      verifyZoneShape(kit.id, table.name, table.zone, serverIdByTable.get(table.name), uniqueIndexes.get(table.name));
    }
    for (const name of [...existing].sort()) {
      if (name.startsWith(prefix) && !declaredAll.has(name)) {
        throw new Error(`库里有 kit "${kit.id}" 前缀（${prefix}）的表 ${name} 却未在 kit.json.sql.tables 声明`);
      }
    }
  }
}

function verifyZoneShape(
  kitId: string,
  table: string,
  zone: KitTableZone,
  serverId: Row | undefined,
  uniques: Map<string, string[]> | undefined,
): void {
  if (zone === "global") {
    if (serverId) { throw new Error(`kit "${kitId}" 的 global 表 ${table} 不得有 server_id 列`); }
    return;
  }
  if (!serverId) {
    throw new Error(`kit "${kitId}" 的 per-zone 表 ${table} 缺少 server_id 列（须 SMALLINT UNSIGNED NOT NULL 且进 PK 与每个 UNIQUE）`);
  }
  const ok = String(serverId.DATA_TYPE).toLowerCase() === "smallint"
    && String(serverId.COLUMN_TYPE).toLowerCase() === "smallint unsigned"
    && String(serverId.IS_NULLABLE) === "NO";
  if (!ok) {
    throw new Error(
      `kit "${kitId}" 的 per-zone 表 ${table}.server_id 定义不匹配：期望 SMALLINT UNSIGNED NOT NULL，`
      + `实际 DATA_TYPE=${String(serverId.DATA_TYPE)} COLUMN_TYPE=${String(serverId.COLUMN_TYPE)} IS_NULLABLE=${String(serverId.IS_NULLABLE)}`,
    );
  }
  const primary = uniques?.get("PRIMARY");
  if (!primary) { throw new Error(`kit "${kitId}" 的 per-zone 表 ${table} 没有 PRIMARY KEY`); }
  if (!primary.includes("server_id")) {
    throw new Error(`kit "${kitId}" 的 per-zone 表 ${table} 的 PRIMARY KEY (${primary.join(", ")}) 不含 server_id`);
  }
  for (const [name, cols] of uniques ?? []) {
    if (name === "PRIMARY") { continue; }
    if (!cols.includes("server_id")) {
      throw new Error(`kit "${kitId}" 的 per-zone 表 ${table} 的 UNIQUE ${name} (${cols.join(", ")}) 不含 server_id`);
    }
  }
}
