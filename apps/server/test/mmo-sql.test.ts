/**
 * mmo kit 的 SQL 迁移（apps/kits/mmo/sql/*.sql）过框架的语句级白名单 lint（docs/KIT.md §5）：每条语句被 lintKitStatement 放行、
 * 表名 ⊆ kit.json.sql.tables 且带 k_mmo_ 前缀、per-zone 表 server_id 进主键与每个 UNIQUE、role:"world-event" 表带框架固定列集
 * （docs/MMO.md §7.3）。⛔ 不连数据库。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { lintKitStatement, splitSqlStatements } from "../tools/kit-migrations";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const KIT_DIR = path.join(REPOSITORY_ROOT, "apps/kits/mmo");

interface KitJson { sql: { files: string[]; tables: { name: string; zone: string; role?: string }[] } }
const kitJson = (): KitJson => JSON.parse(fs.readFileSync(path.join(KIT_DIR, "kit.json"), "utf8")) as KitJson;

const EXPECTED_TABLES = [
  "k_mmo_character", "k_mmo_character_checkpoint", "k_mmo_item_instance", "k_mmo_receipt", "k_mmo_instance", "k_mmo_instance_checkpoint", "k_mmo_world_event",
];
const WORLD_EVENT_COLUMNS = ["event_id", "instance_id", "seq", "kind", "payload", "status", "attempts", "checkpoint_rev"];

function statementsOf(manifest: KitJson): Map<string, string> {
  const byTable = new Map<string, string>();
  for (const file of manifest.sql.files) {
    for (const statement of splitSqlStatements(fs.readFileSync(path.join(KIT_DIR, file), "utf8"))) {
      const match = /^CREATE TABLE IF NOT EXISTS (k_mmo_[a-z_]+) \(/u.exec(statement);
      assert.ok(match, `${file} 只允许 CREATE TABLE IF NOT EXISTS k_mmo_*：${statement.slice(0, 60)}`);
      byTable.set(match[1]!, statement);
    }
  }
  return byTable;
}

test("mmo sql：三份迁移共七张表，每条语句过 lintKitStatement，表名 = kit.json.sql.tables（顺序一致）", () => {
  const manifest = kitJson();
  const declared = manifest.sql.tables.map((table) => table.name);
  assert.deepEqual(manifest.sql.files, ["sql/001-characters.sql", "sql/002-items.sql", "sql/003-world.sql"]);
  assert.deepEqual(declared, EXPECTED_TABLES);
  const byTable = statementsOf(manifest);
  assert.deepEqual([...byTable.keys()], EXPECTED_TABLES, "建表顺序 = 声明顺序");
  for (const [name, statement] of byTable) assert.doesNotThrow(() => lintKitStatement(statement, "mmo", declared), `${name} 应被放行`);
  assert.throws(() => lintKitStatement("DROP TABLE k_mmo_character", "mmo", declared), /DROP/u);
  assert.throws(() => lintKitStatement("CREATE TABLE IF NOT EXISTS k_mmo_extra (server_id SMALLINT UNSIGNED NOT NULL, PRIMARY KEY (server_id))", "mmo", declared), /未在 kit\.json\.sql\.tables/u);
});

test("mmo sql：全部 per-zone——server_id SMALLINT UNSIGNED NOT NULL 进主键与每个 UNIQUE；主键 / 唯一键按 §7.3", () => {
  const manifest = kitJson();
  for (const table of manifest.sql.tables) assert.equal(table.zone, "per-zone", table.name);
  const byTable = statementsOf(manifest);
  for (const [name, statement] of byTable) {
    assert.match(statement, /server_id SMALLINT UNSIGNED NOT NULL/u, name);
    assert.match(statement, /PRIMARY KEY \(server_id, /u, `${name} 主键首列 server_id`);
    for (const unique of statement.matchAll(/UNIQUE KEY \w+ \(([^)]*)\)/gu)) assert.match(unique[1]!, /^server_id, /u, `${name} 每个 UNIQUE 首列 server_id`);
  }
  assert.match(byTable.get("k_mmo_character")!, /PRIMARY KEY \(server_id, character_id\)/u);
  assert.match(byTable.get("k_mmo_character")!, /UNIQUE KEY uk_mmo_character_name \(server_id, name\)/u);
  assert.match(byTable.get("k_mmo_character")!, /UNIQUE KEY uk_mmo_character_persona \(server_id, persona_id\)/u);
  assert.doesNotMatch(byTable.get("k_mmo_character")!, /\b(x|y|hp|mp)\b/u, "角色行 ⛔ 放位置 / HP / MP（真源是检查点表，M08）");
  assert.match(byTable.get("k_mmo_character_checkpoint")!, /PRIMARY KEY \(server_id, character_id, rev\)/u);
  assert.match(byTable.get("k_mmo_item_instance")!, /UNIQUE KEY uk_mmo_item_slot \(server_id, owner_character_id, location, slot\)/u);
  assert.match(byTable.get("k_mmo_receipt")!, /PRIMARY KEY \(server_id, op_id\)/u);
  assert.match(byTable.get("k_mmo_instance")!, /PRIMARY KEY \(server_id, instance_id\)/u);
  assert.match(byTable.get("k_mmo_instance_checkpoint")!, /PRIMARY KEY \(server_id, instance_id, rev\)/u);
});

test("mmo sql：k_mmo_world_event 是 role:\"world-event\" 表——框架固定列集齐全、(instance_id, seq) 主键、event_id 唯一", () => {
  const manifest = kitJson();
  const declaration = manifest.sql.tables.find((table) => table.name === "k_mmo_world_event");
  assert.equal(declaration?.role, "world-event");
  assert.equal(manifest.sql.tables.filter((table) => table.role).length, 1, "只有一张事件表");
  const statement = statementsOf(manifest).get("k_mmo_world_event")!;
  for (const column of WORLD_EVENT_COLUMNS) assert.match(statement, new RegExp(`\\n  ${column} `, "u"), `固定列 ${column}`);
  assert.match(statement, /PRIMARY KEY \(server_id, instance_id, seq\)/u);
  assert.match(statement, /UNIQUE KEY uk_mmo_world_event_id \(server_id, event_id\)/u);
  assert.match(statement, /KEY idx_mmo_world_event_status \(server_id, status, created_at\)/u);
});
