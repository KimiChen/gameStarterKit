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
import { ApiPath, LOBBY_MSG_RPC, PROTOCOL_VERSION, RoomName } from "@game/shared";
import type { FastifyInstance } from "fastify";
import { buildServer } from "@game/webplatform";
import { server } from "../../src/app.config";
import { stopMailWakeLoop } from "../../src/websocket/push";
import { activeLruBucketOf, kActiveLru, kSess } from "../../src/core/infra/keys";
import { clientFor, closeRedis, indexClientFor } from "../../src/core/infra/redisRoute";
import { closeMysql, getPool } from "../../src/core/infra/mysql";
import { assertRedisUp, cleanupUser, testUid } from "./helpers";

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
    await pool.execute("DELETE FROM accounts WHERE user_id = ?", [u]);
    await cleanupUser(u); // onJoin ensureCharacter 建的 s0 基础档
    await clientFor(u).unlink(kSess(u));
    const b = activeLruBucketOf(u);
    await indexClientFor(b).zrem(kActiveLru(b), u);
  }
  await closeRedis();
  await closeMysql();
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
  assert.equal(await clientFor(login.userId).exists(kSess(login.userId)), 0, "登录在 WebPlatform，组 sess 尚未建");

  // 2) SDK 入大厅：LobbyRoom.onAuth 走 account=httpAccount.verify(strict) → 远程 /verify → **懒填组 sess**
  colyseus.sdk.auth.token = login.token;
  const room = await colyseus.sdk.joinOrCreate(RoomName.Lobby, { v: PROTOCOL_VERSION });
  try {
    assert.ok(await clientFor(login.userId).hget(kSess(login.userId), "tokenHash"), "onAuth 已懒填组 sess:{uid}");

    // 3) 快路径 RPC（每消息 verifySession 命中懒填的组缓存，不再打 WebPlatform）
    const reply = await rpc(room, "user.getInfo", {});
    assert.ok(reply.ok, `快路径 getInfo 成功（split 懒填 sess 命中）；err=${reply.err?.code ?? ""}`);
  } finally {
    await room.leave();
  }
});
