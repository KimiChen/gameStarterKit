/**
 * kit worker 租约行预置（tools/kit-workers.ts；MF7a-B2）单测：假连接按剧本作答，⛔ 不连真库（真库两遍零新行在 test/int/kit-migrations.test.ts）。
 * 变异验证：PRESET_KIT_WORKER_LEASE_SQL 改成 `REPLACE INTO` → 「预置语句形态钉住」与假连接（未知 SQL）双双转红；
 * kitWorkerLeaseName 删超长判定 → 「超长 fail-closed」转红；真库侧「预置不重置在役租约」见 test/int/kit-migrations.test.ts。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerKitCatalogEntry } from "../src/kits/catalogTypes";
import {
  PRESET_KIT_WORKER_LEASE_SQL, expectedKitWorkerLeases, kitWorkerLeaseName, orphanKitWorkerLeases, presetKitWorkerLeases,
  type KitWorkerSqlConn,
} from "../tools/kit-workers";

const kit = (id: string, workers: string[]): ServerKitCatalogEntry => ({
  id, version: "1.0.0", api: {}, modes: [], domains: [], effects: [], sqlFiles: [], sqlTables: [], userKeys: [],
  workers: workers.map((w) => ({ id: w, entry: `apps/server/src/kits/${id}/workers/${w}.ts` })),
});

/** 假连接：ODKU 语句按 PK 幂等（已有行零触碰），并故意像 mysql2 缺省连接（CLIENT_FOUND_ROWS）那样 no-op 也报 affectedRows=1。 */
function fakeConn(initial: string[] = []) {
  const rows = new Set(initial);
  const calls: Array<[string, unknown[] | undefined]> = [];
  const conn: KitWorkerSqlConn & { rows: Set<string>; calls: typeof calls } = {
    rows, calls,
    async query(sql, values) {
      calls.push([sql, values]);
      if (sql === PRESET_KIT_WORKER_LEASE_SQL) {
        rows.add(String(values?.[0]));
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith("SELECT lease_name FROM singleton_lease WHERE lease_name LIKE ?")) {
        const prefix = String(values?.[0]).replace(/%$/u, "");
        return [[...rows].filter((n) => n.startsWith(prefix)).sort().map((lease_name) => ({ lease_name })), []];
      }
      throw new Error(`fake: 未知 SQL ${sql}`);
    },
  };
  return conn;
}

test("kitWorkerLeaseName：kit:<kit>:<worker>；id 形态闸；超过 VARCHAR(64) fail-closed", () => {
  assert.equal(kitWorkerLeaseName("kfix", "tick"), "kit:kfix:tick");
  assert.throws(() => kitWorkerLeaseName("k_fix", "tick"), /kit id 非法/u);
  assert.throws(() => kitWorkerLeaseName("kfix", "Tick"), /worker id 非法/u);
  assert.throws(() => kitWorkerLeaseName(`k${"a".repeat(40)}`, `w${"b".repeat(30)}`), /超过 64 字符/u);
});

test("expectedKitWorkerLeases：按 kit id、worker id 排序；无 workers 字段的条目为空", () => {
  assert.deepEqual(expectedKitWorkerLeases([kit("zeta", ["b", "a"]), kit("alpha", ["tick"]), { ...kit("none", []), workers: undefined }]),
    ["kit:alpha:tick", "kit:zeta:a", "kit:zeta:b"]);
});

test("presetKitWorkerLeases：首遍插入、第二遍零新行（分类不依赖 affectedRows）；orphanKitWorkerLeases 只报目录里没有的", async () => {
  const conn = fakeConn(["kit:gone:old", "outbox_relayer"]);
  const catalog = [kit("kfix", ["tick", "sweep"])];
  assert.deepEqual(await presetKitWorkerLeases(conn, catalog), { inserted: ["kit:kfix:sweep", "kit:kfix:tick"], existing: [] });
  assert.deepEqual(await presetKitWorkerLeases(conn, catalog), { inserted: [], existing: ["kit:kfix:sweep", "kit:kfix:tick"] }, "两遍零新行");
  assert.ok(conn.calls.every(([sql]) => sql === PRESET_KIT_WORKER_LEASE_SQL || sql.startsWith("SELECT")), "只走 ODKU 预置语句");
  assert.deepEqual(await orphanKitWorkerLeases(conn, catalog), ["kit:gone:old"], "删 kit 后的行保留并被点名；框架自己的租约不算");
});

test("预置语句形态钉住：ODKU no-op（⛔ INSERT IGNORE / REPLACE / 重置 holder-fence-expires）", () => {
  assert.match(PRESET_KIT_WORKER_LEASE_SQL, /^INSERT INTO singleton_lease \(lease_name, holder, fence_token, expires_at\) VALUES \(\?, '', 0, NOW\(3\) - INTERVAL 1 SECOND\) ON DUPLICATE KEY UPDATE lease_name = lease_name$/u, "预置行已过期（严格 < NOW(3) 的抢租谓词立即可抢）");
  assert.doesNotMatch(PRESET_KIT_WORKER_LEASE_SQL, /IGNORE|REPLACE/u);
});

test("presetKitWorkerLeases：读取返回形状异常即抛（fail-closed）", async () => {
  const bad: KitWorkerSqlConn = { async query() { return [{}, []]; } };
  await assert.rejects(presetKitWorkerLeases(bad, [kit("kfix", ["tick"])]), /返回形状异常/u);
});
