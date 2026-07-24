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
import { issueSession } from "../../src/core/auth/session";
import { SESS_TTL_S } from "../../src/core/infra/config";
import { activeLruBucketOf, kActiveLru, kSess } from "../../src/core/infra/keys";
import { clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import type { ResultSetHeader } from "../../src/core/infra/mysql";
import { assertRedisUp, testUid } from "./helpers";

const BASE = "http://127.0.0.1:2568"; // boot(server) 恒监听 2568（@colyseus/testing DEFAULT_TEST_PORT）
let colyseus: ColyseusTestServer;
const uids: string[] = [];

/** 造号：accounts 行 + 会话（issueSession 写 MySQL token 记录，verifyToken 可验）。绕过 wxLogin。 */
async function makeUser(name: string): Promise<{ uid: string; token: string }> {
  const uid = testUid(name).slice(0, 32);
  uids.push(uid);
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO accounts (user_id, openid) VALUES (?, ?)", [uid, `op_${uid}`]);
  const { token } = await issueSession(uid, 0, null);
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
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await clientFor(u).unlink(kSess(u));
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
    "UPDATE accounts SET token_issued_at = NOW(3) - INTERVAL ? SECOND WHERE user_id = ?",
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
