import "./env-setup"; // ⚠ 必须第一个 import（boot(server) 前置 RPC 限流 env）

/**
 * /area/list 组装（M12c 2f，DUAL_MODE §2.7）——真实 MySQL + Redis + booted server。
 * 目录 + ul 迁 WebPlatform lib `areaList(token)`：token best-effort 反查（verifyToken，MySQL 权威）。
 *
 * lib 直测：
 *  1. 匿名（null token）→ 目录全集 + ul 空 + h 稳定
 *  2. 有效 token 未建角 → ul 空
 *  3. 有效 token + char_registry → ul = 建过角的区（喂「我的区」）
 *  4. 伪造 token（uid 真、hex 错，mismatch）→ ul 空（best-effort，⛔ 不抛）
 *  5. 畸形 token（无点/前导点/空串）→ ul 空、⛔ 不误查库（dot>0 短路）
 *  6. 过期 token（age > SESS_TTL_S）→ ul 空（陈旧签不复现「我的区」）
 * HTTP 端点级（薄委托 zod + `?? null` 反解，守住本次迁移改写的 in-process 委托路径）：
 *  7. POST /area/list {} → 200 目录 + ul 空
 *  8. POST /area/list {token} → 200 ul 回填
 * 前置：npm --workspace @game/server run stack（且 dev server 未占 2568）。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { server } from "../../src/app.config";
import { AREA_SERVERS, areaList, areaListHash, characterRegister } from "@game/webplatform/lib";

import { SESS_TTL_S } from "../../src/core/infra/config";
import { activeLruBucketOf, kActiveLru, kSess } from "../../src/core/infra/keys";
import { clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { ResultSetHeader } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, testUid, issueSession } from "./helpers";

const BASE = "http://127.0.0.1:2568"; // boot(server) 恒监听 2568（@colyseus/testing DEFAULT_TEST_PORT）
let colyseus: ColyseusTestServer;
const uids: string[] = [];

/** 造号：accounts 行 + 会话（issueSession 写 MySQL token 记录，verifyToken 可验）。绕过 wxLogin。 */
async function makeUser(name: string): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO accounts (user_id, openid) VALUES (?, ?)", [uid, `op_${uid}`]);
  const { token } = await issueSession(uid, null);
  return { uid, token };
}

/** 打 /area/list HTTP 端点（薄委托 → lib.areaList）。 */
async function postAreaList(body: unknown): Promise<{ status: number; json: { al: unknown[]; ul: number[]; isOps: number; h: string } }> {
  const res = await fetch(`${BASE}/area/list`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

before(async () => { await assertRedisUp(); colyseus = await boot(server); });

after(async () => {
  await colyseus?.shutdown();
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM char_registry WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM login_audit WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM account_sessions WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await clientFor(u).unlink(kSess(u, 0));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u); // issueSession→touchActive 写的活跃索引（R6 清理）
  }
  await closeRedis();
  await closeMysql();
});

test("匿名（null token）：目录全集 + ul 空 + h 稳定", async () => {
  const r = await areaList(null);
  assert.equal(r.al.length, AREA_SERVERS.length, "al = 目录全集");
  assert.equal(r.al[0].sId, 1);
  assert.ok(r.al[0].wsUrl.startsWith("ws"), "每项带 wsUrl（区实例地址）");
  assert.deepEqual(r.ul, [], "匿名 ul 空");
  assert.equal(r.h, areaListHash(), "h = 目录哈希");
  assert.equal(r.h, (await areaList(null)).h, "h 对内容稳定");
  assert.equal(r.isOps, 0);
});

test("有效 token 未建角 → ul 空", async () => {
  const { token } = await makeUser("area-nochar");
  assert.deepEqual((await areaList(token)).ul, []);
});

test("有效 token + char_registry → ul = 建过角的区（我的区）", async () => {
  const { uid, token } = await makeUser("area-char");
  await characterRegister(uid, 3);
  await characterRegister(uid, 1);
  const ul = (await areaList(token)).ul;
  assert.deepEqual([...ul].sort((a, b) => a - b), [1, 3], "两区角色喂 ul");
});

test("伪造 token（uid 真、hex 错）→ ul 空（best-effort 不抛）", async () => {
  const { uid, token } = await makeUser("area-forged");
  await characterRegister(uid, 2);
  assert.deepEqual((await areaList(token)).ul, [2], "真 token 能读到");
  const forged = `${uid}.${"0".repeat(48)}`;
  assert.deepEqual((await areaList(forged)).ul, [], "hex 不匹配 → ul 空，不抛");
});

test("畸形 token（无点/前导点/空串）→ ul 空、⛔ 不误查库（dot>0 短路）", async () => {
  assert.deepEqual((await areaList("abc")).ul, [], "无点 token");
  assert.deepEqual((await areaList(".deadbeef")).ul, [], "前导点（dot=0，非 >0）");
  assert.deepEqual((await areaList("")).ul, [], "空串（if(token) 直接跳过）");
});

test("过期 token（age > SESS_TTL_S）→ ul 空（陈旧签不复现「我的区」）", async () => {
  const { uid, token } = await makeUser("area-expired");
  await characterRegister(uid, 4);
  assert.deepEqual((await areaList(token)).ul, [4], "未过期能读到");
  await getPool().execute(
    "UPDATE account_sessions SET token_issued_at = NOW(3) - INTERVAL ? SECOND WHERE user_id = ?",
    [SESS_TTL_S + 60, uid]);
  assert.deepEqual((await areaList(token)).ul, [], "过期 → ul 空（verifyToken expired 收敛）");
});

test("HTTP POST /area/list 匿名 {} → 200 + 目录全集 + ul 空", async () => {
  const { status, json } = await postAreaList({});
  assert.equal(status, 200);
  assert.equal(json.al.length, AREA_SERVERS.length);
  assert.deepEqual(json.ul, []);
  assert.equal(json.h, areaListHash());
});

test("HTTP POST /area/list 带 token → 200 + ul 回填（守薄委托 zod+反解）", async () => {
  const { uid, token } = await makeUser("area-http");
  await characterRegister(uid, 5);
  const { status, json } = await postAreaList({ token });
  assert.equal(status, 200);
  assert.deepEqual(json.ul, [5], "端点透传 token → lib 反查 → ul");
});

test("in-process 入参对齐 split：token 为 null / 非串一律视同缺省，⛔ 不得 400", async () => {
  // ⚠ 这条钉的是**in-process 侧**（本文件不设 ACCOUNT_MODE=http，端点真正可达）。
  //   split 侧的判据在 WebPlatform index.ts：`typeof token === "string" ? token : null` —— 对任何
  //   非串都收敛后照常返回目录。in-process 侧若用 z.string().optional()/.nullish()，`null` 之外的
  //   非串仍会 400 ⇒ 同一请求体一边 200 一边 400，正是本仓反复踩的「两模式入参语义不同」。
  //   ⛔ 别把这条挪去 split-e2e.test.ts：那个文件整进程 ACCOUNT_MODE=http，这三个端点是 404，
  //   在那里断言等于测了个恒真（本批一度就犯过这个错——测的是没坏的那一侧）。
  // ⚠ 含 `undefined`（JSON.stringify 会把该键丢掉 ⇒ 等价于匿名 `{}`）：裸 `z.unknown()` 在本版 zod
  //   下仍要求键存在，漏了 `.optional()` 就会把**最常见的匿名请求**打成 400，⛔ 必须钉住。
  for (const token of [null, 123, false, [], {}, undefined] as unknown[]) {
    const { status, json } = await postAreaList({ token });
    assert.equal(status, 200, `token=${JSON.stringify(token)} 必须 200（best-effort ⛔不抛）`);
    assert.deepEqual(json.ul, [], "非串 token 视同匿名：ul 空");
    assert.equal(json.al.length, AREA_SERVERS.length, "目录仍是全集");
  }
});

test("in-process dev-login：deviceId 为 null 视同缺省（⛔ 不得 400，与 split 侧同语义）", async () => {
  // ⚠ 同上：本批把 in-process 的 zod 从 `.optional()`（只收 undefined）改成 `.nullish()`，
  //   而 split 侧的 pickDeviceId 本来就把 null 当缺省放行 ⇒ 会红的只有**这一侧**。
  const devKey = `dnull${Date.now().toString(36)}`.slice(0, 24);
  const res = await fetch(`${BASE}/account/dev-login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ devKey, deviceId: null }),
  });
  assert.equal(res.status, 200, "deviceId:null 必须与缺省同义（⛔ 不是 400）");
  const body = await res.json() as { userId?: string };
  const uid = String(body.userId ?? "");
  assert.match(uid, /^u_\d+$/);
  // 清理：本文件的 uids 清理钩子只认 makeUser 建的号，这个走真实登录链，单独删。
  const pool = getPool();
  await pool.execute("DELETE FROM login_audit WHERE user_id = ?", [uid]);
  await pool.execute("DELETE FROM accounts WHERE user_id = ?", [uid]);
  await cleanupUser(uid);
});
