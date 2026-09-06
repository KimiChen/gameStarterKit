/**
 * 冷档 × kit per-user 键（docs/KIT.md §5「冷档」行）的纯函数契约——不碰 Redis：
 * - 快照校验器接受 / 拒绝 `kits` 成员的各种形状（pre-K0 无 `kits` 仍合法）；
 * - freeze KEYS：固定头与 bag 位置不变，kit 键按目录序追加在 bag 之后；
 * - thaw KEYS：快照 ∪ 目录取并集（已卸载 kit 的哈希照样进 KEYS）、名单与 KEYS 一一对应；
 * - 两条 Lua 的 KEYS/ARGV 算术项与 TS 侧常量一致（脚本是模板串，这里钉住引入的算术文本）。
 * 真 Redis 往返见 test/int/archive.test.ts「kit per-user 键随冷档往返」。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BAG_SHARDS, SCHEMA_VERSION } from "../src/core/infra/config";
import { kBagAll, kKitUser, zoneCtx } from "../src/core/infra/keys";
import {
  FREEZE_COMMIT, FREEZE_FIXED_ARGV, FREEZE_FIXED_KEYS, THAW_FIXED_ARGV, THAW_FIXED_KEYS, THAW_RESTORE,
  freezeKeys, freezeKitFieldCounts, kitUserKeyEntries, thawKeys, unknownSnapshotKits, type ArchiveSnapshot,
} from "../src/core/archive/archiveScripts";
import { readKitUserHashes, type KitHashReader } from "../src/core/archive/freezeWorker";
import { lazyMigrateSchema, validateArchiveSnapshotSchema } from "../src/core/archive/lazyMigrate";
import type { ServerKitCatalogEntry } from "../src/kits/catalogTypes";

const kit = (id: string, userKeys: string[]): ServerKitCatalogEntry => ({
  id, version: "1.0.0", api: { default: { version: 1, minSupported: 1 } }, modes: [], domains: [], effects: [],
  sqlFiles: [], sqlTables: [], userKeys,
});
const FIXTURE: readonly ServerKitCatalogEntry[] = [
  kit("arena", ["tileOwner", "marchQueue"]),
  kit("zeta", ["wallet"]),
];

const baseSnapshot = (): ArchiveSnapshot => ({
  user: {
    schemaVersion: String(SCHEMA_VERSION), ver: "3", fence: "2", createdAt: "100",
    characterRegistrationCheckedAt: "321", nickname: "n",
  },
  bag: Array.from({ length: BAG_SHARDS }, () => ({})),
  applied: ["op", "100"],
  appliedPayload: { op: "payload" },
});

test("快照校验：无 kits（pre-K0）合法；kits 为 <kitId>:<name> → string 记录合法（含空对象）", () => {
  assert.doesNotThrow(() => validateArchiveSnapshotSchema(baseSnapshot(), SCHEMA_VERSION));
  assert.doesNotThrow(() => validateArchiveSnapshotSchema({ ...baseSnapshot(), kits: {} }, SCHEMA_VERSION));
  assert.doesNotThrow(() => validateArchiveSnapshotSchema({
    ...baseSnapshot(),
    kits: { "arena:tileOwner": { t1: "u1", t2: "u2" }, "ghost.kit-2:x_y": {} },
  }, SCHEMA_VERSION));
});

test("快照校验：kits 畸形一律 fail-closed（数组 / 非记录值 / 非字符串字段 / 键名段数或字符非法）", () => {
  const withKits = (kits: unknown): ArchiveSnapshot => ({ ...baseSnapshot(), kits: kits as ArchiveSnapshot["kits"] });
  assert.throws(() => validateArchiveSnapshotSchema(withKits([]), SCHEMA_VERSION), /kits 形状非法/u);
  assert.throws(() => validateArchiveSnapshotSchema(withKits("x"), SCHEMA_VERSION), /kits 形状非法/u);
  assert.throws(() => validateArchiveSnapshotSchema(withKits({ "arena:tileOwner": ["a"] }), SCHEMA_VERSION), /形状非法/u);
  assert.throws(() => validateArchiveSnapshotSchema(withKits({ "arena:tileOwner": { t1: 1 } }), SCHEMA_VERSION), /不是字符串/u);
  assert.throws(() => validateArchiveSnapshotSchema(withKits({ arena: {} }), SCHEMA_VERSION), /键名非法/u);
  assert.throws(() => validateArchiveSnapshotSchema(withKits({ "a:b:c": {} }), SCHEMA_VERSION), /键名非法/u);
  assert.throws(() => validateArchiveSnapshotSchema(withKits({ "a{x}:b": {} }), SCHEMA_VERSION), /键名非法/u);
  assert.throws(() => validateArchiveSnapshotSchema(withKits({ ":b": {} }), SCHEMA_VERSION), /键名非法/u);
  // 顶层字段集合仍是白名单：未知成员照旧拒绝。
  assert.throws(
    () => validateArchiveSnapshotSchema({ ...baseSnapshot(), kitz: {} } as unknown as ArchiveSnapshot, SCHEMA_VERSION),
    /字段集合非法/u,
  );
});

test("懒迁移保留 kits 成员（不可变替换 user，其余原样）", async () => {
  const snapshot: ArchiveSnapshot = { ...baseSnapshot(), kits: { "arena:tileOwner": { t1: "u1" } } };
  const migrated = await lazyMigrateSchema(snapshot, SCHEMA_VERSION);
  assert.notStrictEqual(migrated, snapshot);
  assert.deepEqual(migrated.kits, { "arena:tileOwner": { t1: "u1" } });
});

test("kitUserKeyEntries：目录序（kit id 序 × userKeys 声明序），per-zone 键，名单 <kitId>:<name>", () => {
  const entries = zoneCtx.run({ sId: 2 }, () => kitUserKeyEntries("u1", FIXTURE));
  assert.deepEqual(entries.map((entry) => entry.name), ["arena:tileOwner", "arena:marchQueue", "zeta:wallet"]);
  assert.deepEqual(entries.map((entry) => entry.key), zoneCtx.run({ sId: 2 }, () => [
    kKitUser("arena", "tileOwner", "u1", { zone: "per-zone" }),
    kKitUser("arena", "marchQueue", "u1", { zone: "per-zone" }),
    kKitUser("zeta", "wallet", "u1", { zone: "per-zone" }),
  ]));
  assert.match(entries[0].key, /_s2_kt:arena:tileOwner:\{u1\}$/u, "冷档只认 per-zone 键");
  assert.deepEqual(kitUserKeyEntries("u1", []), [], "空目录 = 无 kit 段（缺省生成物占位即此形态）");
  assert.throws(() => kitUserKeyEntries("u1", [kit("a", ["x", "x"])]), /userKeys 重复/u);
});

test("freezeKeys：固定头 7 + bag 位置不变，kit 键追加在 bag 之后", () => {
  const keys = freezeKeys("u1", 0, FIXTURE);
  const bags = kBagAll("u1");
  assert.equal(FREEZE_FIXED_KEYS, 7);
  assert.equal(keys.length, FREEZE_FIXED_KEYS + BAG_SHARDS + 3);
  assert.deepEqual(keys.slice(FREEZE_FIXED_KEYS, FREEZE_FIXED_KEYS + BAG_SHARDS), bags, "bag 仍从 KEYS[8] 起");
  assert.deepEqual(keys.slice(FREEZE_FIXED_KEYS + BAG_SHARDS), kitUserKeyEntries("u1", FIXTURE).map((entry) => entry.key));
  // 空目录：KEYS 与 K0 之前逐位相同（既有 Lua 位置断言不受影响）。
  assert.deepEqual(freezeKeys("u1", 0, []), [...keys.slice(0, FREEZE_FIXED_KEYS), ...bags]);
});

test("thawKeys：快照 ∪ 目录取并集按名排序；名单与 KEYS 的 kit 段一一对应；已卸载 kit 的哈希仍进 KEYS", () => {
  const snapshot = { kits: { "ghost:old": { a: "1" }, "arena:tileOwner": { t: "u" } } };
  const { keys, kitNames } = thawKeys("u1", snapshot, FIXTURE);
  assert.equal(THAW_FIXED_KEYS, 6);
  assert.deepEqual(keys.slice(THAW_FIXED_KEYS, THAW_FIXED_KEYS + BAG_SHARDS), kBagAll("u1"), "bag 仍从 KEYS[7] 起");
  assert.deepEqual(kitNames, ["arena:marchQueue", "arena:tileOwner", "ghost:old", "zeta:wallet"]);
  assert.deepEqual(keys.slice(THAW_FIXED_KEYS + BAG_SHARDS), [
    kKitUser("arena", "marchQueue", "u1", { zone: "per-zone" }),
    kKitUser("arena", "tileOwner", "u1", { zone: "per-zone" }),
    kKitUser("ghost", "old", "u1", { zone: "per-zone" }),
    kKitUser("zeta", "wallet", "u1", { zone: "per-zone" }),
  ]);
  assert.equal(keys.length - THAW_FIXED_KEYS - BAG_SHARDS, kitNames.length);
  // pre-K0 快照 + 空目录：KEYS 与 K0 之前逐位相同，名单为空。
  const legacy = thawKeys("u1", {}, []);
  assert.deepEqual(legacy.keys, [...keys.slice(0, THAW_FIXED_KEYS), ...kBagAll("u1")]);
  assert.deepEqual(legacy.kitNames, []);
  // 目录未登记的成员名可辨（thaw 只告警、照样恢复）。
  assert.deepEqual(unknownSnapshotKits(snapshot, FIXTURE), ["ghost:old"]);
  assert.deepEqual(unknownSnapshotKits({}, FIXTURE), []);
  // 快照键名畸形在建 KEYS 前就抛（⛔ 不带进 Lua）。
  assert.throws(() => thawKeys("u1", { kits: { "a:b:c": {} } }, FIXTURE), /键名非法/u);
  assert.throws(() => thawKeys("u1", { kits: { "a{x}:b": {} } }, FIXTURE), /kKit kitId/u);
});

test("freezeKitFieldCounts：目录序逐键字段数，缺席 = 0；pre-K0 / 全缺席（undefined）全 0；空目录为空", () => {
  const kits: ArchiveSnapshot["kits"] = { "arena:tileOwner": { t1: "u1", t2: "u2", n: "007" }, "zeta:wallet": {} };
  assert.deepEqual(freezeKitFieldCounts("u1", kits, FIXTURE), ["3", "0", "0"], "arena:marchQueue 缺席 = 0");
  assert.deepEqual(freezeKitFieldCounts("u1", undefined, FIXTURE), ["0", "0", "0"]);
  assert.deepEqual(freezeKitFieldCounts("u1", kits, []), [], "空目录：ARGV 无 kit 段（字节形状同 pre-K0）");
  // 快照里有、目录里没有的成员不进 ARGV（freeze KEYS 只按目录展开，两侧长度恒等）
  assert.equal(
    freezeKitFieldCounts("u1", { "ghost:old": { a: "1" } }, FIXTURE).length,
    kitUserKeyEntries("u1", FIXTURE).length,
  );
});

/** 桩 client：只实现快照读侧用到的四个命令；hscan 不该被触发（字段数 ≤ WHALE_FIELDS）。 */
const stubReader = (keys: Record<string, { type: string; fields?: Record<string, string> }>): KitHashReader => {
  const lookup = (key: string) => keys[key] ?? { type: "none" };
  return {
    type: async (key: string) => lookup(key).type,
    hlen: async (key: string) => Object.keys(lookup(key).fields ?? {}).length,
    hgetall: async (key: string) => ({ ...(lookup(key).fields ?? {}) }),
    hscan: async () => { throw new Error("stub hscan 不应被调用"); },
  } as unknown as KitHashReader;
};

test("readKitUserHashes 读侧第二道闸：缺席不占位、HASH 全字段进快照、全缺席返回 undefined、非 HASH 具名拒冻", async () => {
  const [tile, march, wallet] = kitUserKeyEntries("u1", FIXTURE).map((entry) => entry.key);
  assert.deepEqual(
    await readKitUserHashes(stubReader({ [tile]: { type: "hash", fields: { t1: "u1", n: "007" } } }), "u1", FIXTURE),
    { "arena:tileOwner": { t1: "u1", n: "007" } },
    "只收录存在的键；值保持原始字符串",
  );
  assert.equal(await readKitUserHashes(stubReader({}), "u1", FIXTURE), undefined, "全缺席 = 快照不带 kits 成员");
  assert.equal(await readKitUserHashes(stubReader({ [tile]: { type: "hash" } }), "u1", []), undefined, "空目录不读任何键");
  // resolve 的 TYPE 闸与本函数之间键类型被翻转（string / list / zset）：具名错误、不产出快照
  for (const type of ["string", "list", "zset"]) {
    await assert.rejects(
      readKitUserHashes(stubReader({ [tile]: { type: "hash", fields: { t1: "u1" } }, [march]: { type } }), "u1", FIXTURE),
      new RegExp(`\\[freeze\\] kit 键类型非法 uid=u1 key=arena:marchQueue type=${type}`, "u"),
    );
  }
  assert.deepEqual(
    await readKitUserHashes(stubReader({ [wallet]: { type: "hash", fields: { coin: "5" } } }), "u1", FIXTURE),
    { "zeta:wallet": { coin: "5" } },
  );
});

test("Lua 模板：FREEZE_COMMIT / THAW_RESTORE 的 KEYS/ARGV 算术项与 TS 常量一致", () => {
  const freeze = FREEZE_COMMIT.lua;
  assert.equal(FREEZE_FIXED_ARGV, 4);
  assert.match(freeze, new RegExp(`local kitCount = tonumber\\(ARGV\\[${FREEZE_FIXED_ARGV}\\]\\)`, "u"));
  assert.match(freeze, new RegExp(`#KEYS < ${FREEZE_FIXED_KEYS + 1} \\+ kitCount`, "u"));
  assert.match(freeze, new RegExp(`#ARGV ~= ${FREEZE_FIXED_ARGV} \\+ kitCount`, "u"), "ARGV kit 段长度 = kitCount");
  assert.match(freeze, /local bagLast = #KEYS - kitCount/u);
  assert.match(
    freeze,
    new RegExp(`local expectedLen = tonumber\\(ARGV\\[${FREEZE_FIXED_ARGV} \\+ i\\]\\)[\\s\\S]*?redis\\.call\\('HLEN', KEYS\\[bagLast \\+ i\\]\\) ~= expectedLen then return 'changed'`, "u"),
    "kit 键第二道闸：快照字段数 vs 当前 HLEN，不等即 'changed'",
  );
  assert.ok(
    freeze.indexOf("'HLEN', KEYS[bagLast + i]") < freeze.indexOf("redis.call('UNLINK'"),
    "HLEN 闸必须在任何 UNLINK 之前",
  );
  assert.match(freeze, new RegExp(`for i = ${FREEZE_FIXED_KEYS + 1}, #KEYS do redis\\.call\\('UNLINK', KEYS\\[i\\]\\) end`, "u"));
  assert.doesNotMatch(freeze, /redis\.call\('DEL'/u, "模块统一 UNLINK");

  const thaw = THAW_RESTORE.lua;
  assert.equal(THAW_FIXED_ARGV, 6);
  assert.match(thaw, new RegExp(`local kitCount = tonumber\\(ARGV\\[${THAW_FIXED_ARGV}\\]\\)`, "u"));
  assert.match(thaw, new RegExp(`#ARGV ~= ${THAW_FIXED_ARGV} \\+ kitCount`, "u"));
  assert.match(thaw, new RegExp(`#KEYS < ${THAW_FIXED_KEYS + 1} \\+ kitCount`, "u"));
  assert.match(thaw, /local bagLast = #KEYS - kitCount/u);
  assert.match(thaw, new RegExp(`#s\\.bag ~= \\(bagLast - ${THAW_FIXED_KEYS}\\)`, "u"));
  assert.match(thaw, /key ~= 'kits'/u, "顶层白名单含 kits");
  assert.match(thaw, /topCount < 3 or topCount > 5/u, "user/bag/applied 必有 + appliedPayload/kits 可选");
  assert.match(thaw, /archive snapshot kits key unknown/u, "快照成员不在 ARGV 名单 = 调用方 bug，拒绝而非丢弃");
  assert.match(thaw, new RegExp(`redis\\.call\\('HSET', KEYS\\[bagLast \\+ i\\], f, v\\)`, "u"));
  assert.match(thaw, new RegExp(`for i, shard in ipairs\\(s\\.bag\\) do[\\s\\S]*?KEYS\\[${THAW_FIXED_KEYS} \\+ i\\]`, "u"), "bag 恢复位置不变");
  assert.doesNotMatch(thaw, /redis\.call\('DEL'/u, "模块统一 UNLINK");
});
