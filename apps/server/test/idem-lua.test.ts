/**
 * 幂等 v2 三条 Lua 的文本级不变量守门（无 Redis；真实原子/TTL 行为在 test/int/core.test.ts）。
 *
 * 这些断言钉的是 §6.12 的结构性禁令：acquire 必须单条原子（⛔ 无 SET NX + GET 重试窗口）、
 * complete 必须 CAS 比对 pending 的 leaseId 且**重置**为 result TTL（⛔ KEEPTTL / 无 TTL SET）、
 * release 只删自己的 pending。文本断言故意贴着这些禁令写：改掉任何一条即红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { IDEM_V2_ACQUIRE, IDEM_V2_COMPLETE, IDEM_V2_RELEASE } from "../src/core/idem";

test("IDEM_V2_ACQUIRE：单条原子——GET 判定与 SET pending 在同一脚本，⛔ 无 SET NX", () => {
  const lua = IDEM_V2_ACQUIRE.lua;
  assert.match(lua, /redis\.call\('GET', KEYS\[1\]\)/u, "判定必须读记录本体");
  assert.match(lua, /redis\.call\('SET', KEYS\[1\], rec, 'PX', ARGV\[4\]\)/u, "pending 写入必须带 PX=pendingMs");
  assert.doesNotMatch(lua, /'NX'/u, "⛔ SET NX + GET 的过期窗口形态被 §6.12 明令否决");
  assert.match(lua, /state = 'pending'/u);
  assert.match(lua, /leaseId = ARGV\[2\]/u, "记录必须持久化独立 leaseId");
  assert.match(lua, /contractVersion = tonumber\(ARGV\[3\]\)/u, "记录必须持久化契约版本");
  // per-uid 上限：计数键在同一脚本内检查并 INCR + PEXPIRE（随租约 TTL 衰减）
  assert.match(lua, /count >= tonumber\(ARGV\[5\]\)/u);
  assert.match(lua, /redis\.call\('INCR', KEYS\[2\]\)/u);
  assert.match(lua, /redis\.call\('PEXPIRE', KEYS\[2\], ARGV\[4\]\)/u);
  // 判定顺序：版本 fail-closed 先于 hash conflict（升级期异 hash ⛔ 不得误报 conflict）
  const versionAt = lua.indexOf("version-mismatch");
  const conflictAt = lua.indexOf("'conflict'");
  assert.ok(versionAt >= 0 && conflictAt >= 0 && versionAt < conflictAt, "版本比对必须先于 hash 比对");
  // 腐坏/未知版本 fail closed
  assert.match(lua, /rec\.v ~= 2 then return \{ 'corrupt' \}/u);
});

test("IDEM_V2_COMPLETE：CAS 比对 pending + leaseId；覆写 done 时重置 result TTL", () => {
  const lua = IDEM_V2_COMPLETE.lua;
  assert.match(lua, /rec\.state ~= 'pending' or rec\.leaseId ~= ARGV\[1\]/u, "旧 lease 不得覆盖新 lease（含 done 后覆写）");
  assert.match(lua, /return 'lost'/u);
  assert.match(lua, /state = 'done-oversize'/u, "超限必须写墓碑而不是响应体");
  assert.match(lua, /redis\.call\('SET', KEYS\[1\], out, 'PX', ARGV\[4\]\)/u, "done 必须重置为 result TTL");
  assert.doesNotMatch(lua, /'KEEPTTL'/u, "⛔ 不得沿用 pending 的剩余 TTL");
});

test("IDEM_V2_RELEASE：只删自己的 pending（leaseId CAS），⛔ 不碰 done/他人占位", () => {
  const lua = IDEM_V2_RELEASE.lua;
  assert.match(lua, /rec\.state ~= 'pending' or rec\.leaseId ~= ARGV\[1\]/u);
  const guardAt = lua.indexOf("rec.leaseId ~= ARGV[1]");
  const delAt = lua.indexOf("redis.call('DEL', KEYS[1])");
  assert.ok(guardAt >= 0 && delAt > guardAt, "DEL 必须在 leaseId CAS 之后");
});
