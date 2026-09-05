/**
 * 兑换码插件（plugins/redeem）服务端用例：查码/首兑/重兑/多码累计 + Lua 返回解析。
 * 用内存 store 走用例层；Redis 实现的 Lua 文本由 REDEEM_CLAIM 钉 sha（与 evalshaWithReload 同口径）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { RpcFault } from "../src/core/errors";
import { claimRedeemCode } from "../src/core/redeem/claim";
import { createMemoryRedeemStore, createRedisRedeemStore, kRedeemClaimed, kRedeemWallet, REDEEM_CLAIM } from "../src/core/redeem/store";

test("redeem：未登记码 → REDEEM_CODE_INVALID，且不动余额", async () => {
  const store = createMemoryRedeemStore();
  await assert.rejects(claimRedeemCode(store, "u1", "NOPE1234"), (error: unknown) =>
    error instanceof RpcFault && error.rpcCode === "REDEEM_CODE_INVALID");
  assert.equal(store.balances.get("u1"), undefined);
});

test("redeem：首兑成功回显码与奖励；同码再兑 → REDEEM_CODE_USED；不同码累计余额", async () => {
  const store = createMemoryRedeemStore();
  const first = await claimRedeemCode(store, "u1", "WELCOME2026");
  assert.deepEqual(first, { code: "WELCOME2026", reward: { kind: "coins", amount: 100 }, balance: 100 });
  await assert.rejects(claimRedeemCode(store, "u1", "WELCOME2026"), (error: unknown) =>
    error instanceof RpcFault && error.rpcCode === "REDEEM_CODE_USED");
  const second = await claimRedeemCode(store, "u1", "SNAKE90");
  assert.equal(second.balance, 190);
  // 另一用户互不影响
  const other = await claimRedeemCode(store, "u2", "WELCOME2026");
  assert.equal(other.balance, 100);
});

test("redeem：Redis 实现两键同 {uid} 槽，Lua 返回 ok/used 解析正确，异常形状 fail-fast", async () => {
  assert.match(kRedeemClaimed("u9"), /ft:redeem:claimed:\{u9\}$/u);
  assert.match(kRedeemWallet("u9"), /ft:redeem:wallet:\{u9\}$/u);
  assert.equal(REDEEM_CLAIM.name, "redeemClaim");
  const calls: unknown[][] = [];
  let reply: unknown = ["ok", 42];
  const fakeClient = {
    evalsha: async (...args: unknown[]) => { calls.push(args); return reply; },
    call: async () => { throw new Error("unexpected SCRIPT LOAD"); },
  } as unknown as import("ioredis").Redis;
  const store = createRedisRedeemStore(() => fakeClient);
  assert.deepEqual(await store.claim("u9", "DEVTEST", 1), { kind: "ok", balance: 42 });
  assert.deepEqual(calls[0], [REDEEM_CLAIM.sha, 2, kRedeemClaimed("u9"), kRedeemWallet("u9"), "DEVTEST", 1]);
  reply = ["used"];
  assert.deepEqual(await store.claim("u9", "DEVTEST", 1), { kind: "used" });
  reply = ["weird"];
  await assert.rejects(store.claim("u9", "DEVTEST", 1), /Lua 返回形状异常/u);
});
