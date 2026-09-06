/**
 * arena kit 的 SQL 迁移（apps/kits/arena/sql/001-init.sql）过框架的语句级白名单 lint（docs/KIT.md §5）：
 * splitSqlStatements 切出的每条语句都被 lintKitStatement 放行、表名全在 kit.json.sql.tables 里且带 k_arena_ 前缀、
 * per-zone 表带 server_id 且进主键（verifyKitTableShapes 的静态版）。⛔ 不连数据库。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { KIT_CATALOG } from "@game/shared/kits/catalog.generated";
import { SERVER_KIT_CATALOG } from "../src/kits/catalog.generated";
import { lintKitStatement, splitSqlStatements } from "../tools/kit-migrations";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const KIT_DIR = path.join(REPOSITORY_ROOT, "apps/kits/arena");

function kitJson(): { sql: { files: string[]; tables: { name: string; zone: string }[] }; userKeys: string[]; effects: Record<string, { userKey: string; field: string }> } {
  return JSON.parse(fs.readFileSync(path.join(KIT_DIR, "kit.json"), "utf8"));
}

test("arena sql：每个迁移文件的每条语句都过 lintKitStatement，表名 ⊆ kit.json.sql.tables", () => {
  const manifest = kitJson();
  const declared = manifest.sql.tables.map((table) => table.name);
  assert.ok(manifest.sql.files.length >= 1);
  let statements = 0;
  for (const file of manifest.sql.files) {
    const text = fs.readFileSync(path.join(KIT_DIR, file), "utf8");
    const parts = splitSqlStatements(text);
    assert.ok(parts.length >= 1, `${file} 至少一条语句`);
    for (const statement of parts) {
      assert.doesNotThrow(() => lintKitStatement(statement, "arena", declared), `${file} 语句应被放行：${statement.slice(0, 80)}`);
      statements += 1;
    }
  }
  assert.equal(statements, 2, "首版两张表：棋盘 + 占领回执");
  for (const name of declared) assert.match(name, /^k_arena_/u);
  assert.deepEqual(declared, ["k_arena_board", "k_arena_attempt"]);
});

test("arena sql：per-zone 表 server_id SMALLINT UNSIGNED NOT NULL 且进主键；未声明的表 / 越权语句被 lint 拒绝", () => {
  const manifest = kitJson();
  const text = fs.readFileSync(path.join(KIT_DIR, manifest.sql.files[0]), "utf8");
  const [create, attempt] = splitSqlStatements(text);
  assert.match(create, /^CREATE TABLE IF NOT EXISTS k_arena_board \(/u);
  assert.match(create, /server_id SMALLINT UNSIGNED NOT NULL/u);
  assert.match(create, /PRIMARY KEY \(server_id, tile\)/u);
  assert.equal(manifest.sql.tables[0].zone, "per-zone");
  // 回执表：per-zone、(server_id, op_id) 主键、op_id 形态与 gameplay_outbox.op_id 同（VARCHAR(64) ascii_bin）、无 UNIQUE
  assert.match(attempt, /^CREATE TABLE IF NOT EXISTS k_arena_attempt \(/u);
  assert.match(attempt, /server_id SMALLINT UNSIGNED NOT NULL/u);
  assert.match(attempt, /op_id VARCHAR\(64\) CHARACTER SET ascii COLLATE ascii_bin NOT NULL/u);
  assert.match(attempt, /PRIMARY KEY \(server_id, op_id\)/u);
  assert.doesNotMatch(attempt, /UNIQUE/u);
  assert.equal(manifest.sql.tables[1].zone, "per-zone");
  const declared = manifest.sql.tables.map((table) => table.name);
  assert.throws(() => lintKitStatement("CREATE TABLE IF NOT EXISTS k_arena_extra (server_id SMALLINT UNSIGNED NOT NULL, PRIMARY KEY (server_id))", "arena", declared), /未在 kit\.json\.sql\.tables 声明/u);
  assert.throws(() => lintKitStatement("DROP TABLE k_arena_board", "arena", declared), /DROP/u);
  assert.throws(() => lintKitStatement("CREATE TABLE IF NOT EXISTS user_currency (a INT)", "arena", declared), /不带 kit 表前缀/u);
});

test("arena kit.json：effects 的 userKey ∈ userKeys、双端 catalog 收录 arena（表 / 区 / userKeys 与 kit.json 一致）", () => {
  const manifest = kitJson();
  for (const [name, effect] of Object.entries(manifest.effects)) {
    assert.ok(manifest.userKeys.includes(effect.userKey), `effect ${name} 的 userKey 必须在 userKeys 里`);
  }
  const shared = KIT_CATALOG.find((kit) => kit.id === "arena");
  const server = SERVER_KIT_CATALOG.find((kit) => kit.id === "arena");
  assert.ok(shared && server);
  assert.deepEqual(server.sqlFiles, manifest.sql.files);
  assert.deepEqual(server.sqlTables, manifest.sql.tables);
  assert.deepEqual(server.userKeys, manifest.userKeys);
  assert.deepEqual(shared.effects.map((effect) => `kit:${effect.kitId}:${effect.name}`), ["kit:arena:trophy"]);
  assert.deepEqual(shared.modes.map((mode) => mode.id), ["arenaCapture", "arenaDuel"]);
});
