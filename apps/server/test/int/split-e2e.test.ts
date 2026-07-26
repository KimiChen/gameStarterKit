import "./env-setup-http"; // ⚠ 必须第一个 import：置 ACCOUNT_MODE=http（ESM 提升下，唯有独立模块的副作用早于 app.config→accountClient 的模块级读取）

/**
 * split（ACCOUNT_MODE=http）**全链** e2e（M12c 2g）：门户登录 → SDK 入大厅（onAuth 懒填组 sess）→ 快路径 RPC。
 * 进程内起 WebPlatform Fastify（账号服务）+ boot 组网关（account=httpAccount）。此文件独占进程（node --test 每文件独立进程），
 * ACCOUNT_MODE=http 不外泄。守住三处接缝：accountClient 的 ACCOUNT_MODE 选择、LobbyRoom.onAuth→account.verify(strict)、
 * 客户端 portalRequest 打的 ApiPath 登录路径（曾误挂 /dev-login 与 ApiPath 不符）。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { ApiPath, KICK_CLOSE_CODE, LOBBY_MSG_RPC, PROTOCOL_VERSION, RoomName } from "@game/shared";
import type { FastifyInstance } from "fastify";
import { buildServer } from "@game/webplatform";
import { server } from "../../src/app.config";
import { banUser } from "../../src/core/auth/ban";
import { setKickHandler } from "../../src/core/auth/kickBus";
import { kickUser, stopMailWakeLoop } from "../../src/websocket/push";
import { activeLruBucketOf, kActiveLru, kSess } from "../../src/core/infra/keys";
import { clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, sleep, testUid } from "./helpers";

let colyseus: ColyseusTestServer;
let wp: FastifyInstance;
let portal = "";
const uids: string[] = [];

let rpcSeq = 0;
function rpc(room: { onMessage: Function; send: Function }, type: string, payload?: unknown):
  Promise<{ id: string; ok: boolean; data?: any; err?: { code: string } }> {
  const id = `r${rpcSeq++}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error(`rpc 超时: ${type}`)); }, 15_000);
    const stop = room.onMessage(LOBBY_MSG_RPC, (reply: any) => {
      if (reply.id !== id) { return; }
      clearTimeout(timer); stop(); resolve(reply);
    });
    room.send(LOBBY_MSG_RPC, { id, type, payload });
  });
}

before(async () => {
  await assertRedisUp();
  wp = buildServer();
  portal = await wp.listen({ port: 0, host: "127.0.0.1" });
  process.env.WEBPLATFORM_BASE_URL = portal; // httpAccount.post 现读
  colyseus = await boot(server); // ACCOUNT_MODE=http 已在顶部设 → account 解析为 httpAccount
});

after(async () => {
  stopMailWakeLoop();
  await colyseus?.shutdown();
  await wp?.close();
  const pool = getPool();
  for (const u of uids) {
    await pool.execute("DELETE FROM login_audit WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM char_registry WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM account_sessions WHERE user_id = ?", [u]);
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await cleanupUser(u); // onJoin ensureCharacter 建的 s0 基础档
    await clientFor(u).unlink(kSess(u, 0));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  await closeRedis();
  await closeMysql();
});

test("门户登录端点：入参越界必须**在签发之前**被 400 拦下（评审 P1：token 已签发却 500 = 登录分叉）", async () => {
  const post = async (path: string, body: unknown) => {
    const r = await fetch(`${portal}${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) as { error?: string; userId?: string } };
  };
  const key = () => testUid("v").slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, "");

  // ① deviceId 65 字符：曾经一路带到 login_audit.device_id VARCHAR(64) ⇒ 1406。
  //    ⚠ 那一步发生在 loginByOpenid **签发并轮换 token 之后** ⇒ 客户端拿 500、没有 token，
  //    权威却已经换了 —— 比 login_diverged 更彻底的分叉。必须在**进入 lib 之前**就拒。
  const over = await post(ApiPath.DevLogin, { devKey: key(), deviceId: "d".repeat(65) });
  assert.equal(over.status, 400, "deviceId 65 必须 400（⛔ 不能进 lib）");
  assert.equal(over.body.error, "INVALID_PAYLOAD");
  assert.equal(over.body.userId, undefined, "⛔ 400 时不得已经建号/签发");

  // ② 边界值 64 必须放行（⛔ 别把校验写严一格，那会让合法客户端登不上）
  const okDev = await post(ApiPath.DevLogin, { devKey: key(), deviceId: "d".repeat(64) });
  assert.equal(okDev.status, 200, "deviceId 恰好 64 是合法值");
  if (okDev.body.userId) { uids.push(okDev.body.userId); }

  // ③ devKey 越界/非法字符：`dev_<devKey>` 会进 accounts.openid VARCHAR(64) **ascii**
  //    （in-process 侧的 zod 早有 /^[a-zA-Z0-9_-]{1,32}$/，本端点此前裸传 ⇒ 两模式契约漂移）
  for (const bad of ["k".repeat(33), "有中文", "bad key", ""]) {
    const r = await post(ApiPath.DevLogin, { devKey: bad, deviceId: null });
    assert.equal(r.status, 400, `devKey=${JSON.stringify(bad).slice(0, 20)} 必须 400`);
  }

  // ④ wx-login 的 code：= zod `string().min(1).max(128)`
  for (const bad of ["", "c".repeat(129)]) {
    const r = await post(ApiPath.WxLogin, { code: bad });
    assert.equal(r.status, 400, `code 长度 ${bad.length} 必须 400`);
  }
});

test("门户 dev-login → SDK 入大厅（onAuth 懒填组 sess）→ 快路径 getInfo 成功", async () => {
  // 1) 门户登录（客户端 portalRequest 打的正是 WebPlatform 的 ApiPath.DevLogin）
  const res = await fetch(`${portal}${ApiPath.DevLogin}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ devKey: testUid("e2e").slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, "") }),
  });
  assert.equal(res.status, 200, "门户登录路径命中（ApiPath.DevLogin）");
  const login = await res.json() as { userId: string; token: string };
  uids.push(login.userId);
  assert.equal(await clientFor(login.userId).exists(kSess(login.userId, 0)), 0, "登录在 WebPlatform，组 sess 尚未建");

  // 2) SDK 入大厅：LobbyRoom.onAuth 走 account=httpAccount.verify(strict) → 远程 /verify → **懒填组 sess**
  colyseus.sdk.auth.token = login.token;
  const room = await colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: PROTOCOL_VERSION });
  try {
    assert.ok(await clientFor(login.userId).hget(kSess(login.userId, 0), "tokenHash"), "onAuth 已懒填组 sess:{uid}");

    // 3) 快路径 RPC（每消息 verifySession 命中懒填的组缓存，不再打 WebPlatform）
    const reply = await rpc(room, "user.getInfo", {});
    assert.ok(reply.ok, `快路径 getInfo 成功（split 懒填 sess 命中）；err=${reply.err?.code ?? ""}`);
  } finally {
    await room.leave();
  }
});

test("split 封号全链：banUser → 走接缝远程写权威（⛔ 非本地组库）→ 踢在线 + 重连被拒", async () => {
  const res = await fetch(`${portal}${ApiPath.DevLogin}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ devKey: testUid("e2eban").slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, "") }),
  });
  const login = await res.json() as { userId: string; token: string };
  uids.push(login.userId);

  colyseus.sdk.auth.token = login.token;
  const room = await colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: PROTOCOL_VERSION });
  await sleep(100);
  setKickHandler(kickUser); // boot 不跑 index.ts，显式挂
  const left = new Promise<number>((resolve) => { room.onLeave((code: number) => resolve(code)); });

  // ⚠ 本用例正是 X 方案要修的那个洞：改接缝前 banUser 直调 lib → 打组库 → hit=false → 既不封也不踢（静默）
  await banUser(login.userId, "e2e");

  assert.equal(await Promise.race([left, sleep(5000).then(() => -1)]), KICK_CLOSE_CODE.banned,
    "远程写权威成功 → 组侧踢在线（语义化关闭码）");
  await assert.rejects(
    colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: PROTOCOL_VERSION }), // 同 token 重连
    "封后重连被 onAuth 远程权威拒");
});

test("split 门控：游戏服自己的登录端点 404（⛔ 防往组库建号 + 签发 WebPlatform 不认的 token）", async () => {
  for (const path of [ApiPath.DevLogin, ApiPath.WxLogin]) {
    const res = await fetch(`http://127.0.0.1:2568${path}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ devKey: "x", code: "x" }),
    });
    assert.equal(res.status, 404, `${path} 在 ACCOUNT_MODE=http 下必须关闭（登录只在 WebPlatform）`);
  }
});

test("门户异常一律 500 INTERNAL：⛔ 不得回显 MySQL 错误码/文本（09·G8 出参禁含 openid/unionid）", async () => {
  // ⚠ 此前 buildServer() 只有 `Fastify({logger:true})`、⛔ 无 setErrorHandler ⇒ 任何抛出的异常
  //    走 Fastify 默认处理，把 err.code / err.message **原样回给调用方**。泄漏面不止"不专业"：
  //    ER_DUP_ENTRY 的 message 含**重复键值本身**，而 accounts 的两个唯一键正是 openid/unionid。
  //    组侧早有这条纪律（core/errors.ts 的 toErrCode：未映射一律 INTERNAL），split 侧整个没有。
  const r = await fetch(`${portal}/character/register`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  });
  // {} ⇒ uid/sId 为 undefined ⇒ mysql2 抛 "Bind parameters must not contain undefined"
  assert.equal(r.status, 500);
  const body = await r.json().catch(() => ({})) as Record<string, unknown>;
  assert.equal(body.error, "INTERNAL", "必须收敛成契约错误码");
  assert.equal(body.message, undefined, "⛔ 不得回显内部 message");
  assert.equal(body.code, undefined, "⛔ 不得回显驱动错误码（ER_* / ECONNREFUSED …）");
  const raw = JSON.stringify(body);
  assert.ok(!/ER_|undefined|mysql|Bind parameters/i.test(raw), `响应体不得含内部细节：${raw.slice(0, 200)}`);
});

test("deviceId:null 在 split 侧放行（两模式同语义的 split 那一半）", async () => {
  // ⚠ **诚实说明覆盖边界**：本文件整进程 `ACCOUNT_MODE=http`，in-process 的三个端点在此是 404
  //    （见下方「split 门控」用例）⇒ 这里只能钉住 split 这一侧，而 split 侧本来就放行 null。
  //    真正会因回退而变红的是**另一侧**（zod `.optional()→.nullish()`），钉在
  //    `test/int/area.test.ts` 的「in-process dev-login：deviceId 为 null…」——⛔ 别以为这条覆盖了它。
  //    统一取**宽**的一侧（null 与缺省同义）：非 JS 端的序列化器普遍把空值写成 null。
  const key = testUid("dn").slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, "");
  const r = await fetch(`${portal}${ApiPath.DevLogin}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ devKey: key, deviceId: null }),
  });
  assert.equal(r.status, 200, "deviceId:null 必须与缺省同义（⛔ 不是 400）");
  const body = await r.json() as { userId?: string };
  if (body.userId) { uids.push(body.userId); }
});
