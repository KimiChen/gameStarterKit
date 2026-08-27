/**
 * ws-RPC 契约测试（纯内存，不需要 Redis/MySQL——infra 客户端都是首次调用才建连）。
 *
 * 兜住类型系统够不着的运行时缺口：
 *  1. loader 全集校验：shared 声明 ⇔ websocket/<域>/<接口>.ts 双向相等 + 路由名↔路径一致
 *     （collectEndpoints 内部校验，不一致直接 throw——CI 先于启动兜住）
 *  2. idem 路由的 zod schema 必须拒绝缺 clientReqId 的请求（09·I2 的运行时面）
 *  3. schema 要求 clientReqId 的路由必须开 idem（09·I1 反向）
 * （信封/错误码/推送名已单源合一——服务端直接 import shared，无镜像可漂移，不再扫源。）
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_LOBBY_RPC_TYPES, GuildRpc, MailRpc, ShopRpc, UserRpc,
  LOBBY_RPC_REQUEST_VALIDATORS,
  validateLobbyRpcRequest,
} from "@game/shared";
import { collectEndpoints } from "../src/websocket/loader";
import { defineRpc, sharedRpcSchema } from "../src/websocket/rpc";

test("端点全集与 shared 声明集合相等，路由名与文件路径一致", async () => {
  const defs = await collectEndpoints(); // 内部已做双向集合校验 + 路径一致校验
  assert.equal(defs.length, ALL_LOBBY_RPC_TYPES.length);
  assert.equal(new Set(defs.map((d) => d.type)).size, defs.length, "路由名不得重复");
});

// 每条路由的最小合法 payload。严格 schema 不再接受「把所有字段塞在一起」的旧 probe；
// 这张表也让新增路由漏写测试样例时在 CI 立即暴露。
const validPayloads: Record<string, Record<string, unknown>> = {
  [UserRpc.GetUserId]: {},
  [UserRpc.GetInfo]: {},
  [UserRpc.GetProfile]: { uid: "u_test" },
  [UserRpc.UpdateProfile]: { clientReqId: "c1" },
  [MailRpc.List]: {},
  [MailRpc.ClaimAttach]: { clientReqId: "c1", mailId: 1 },
  [MailRpc.MarkRead]: { mailId: 1 },
  [ShopRpc.Purchase]: { clientReqId: "c1", sku: "x" },
  [ShopRpc.QueryOp]: { opId: "x" },
  [GuildRpc.Join]: { clientReqId: "c1", guildId: 1 },
  [GuildRpc.Leave]: { clientReqId: "c1" },
  [GuildRpc.GetEvents]: { sinceSeq: 0 },
};

test("idem 路由的 schema 必须强制 clientReqId（09·I2）", async () => {
  const defs = await collectEndpoints();
  const idemDefs = defs.filter((d) => d.idem === true);
  assert.ok(idemDefs.length >= 3, "幂等写路由至少含 updateProfile/claimAttach/purchase");
  for (const d of idemDefs) {
    const valid = validPayloads[d.type];
    assert.ok(valid, `${d.type} 缺少 valid payload fixture`);
    const { clientReqId: _id, ...withoutId } = valid;
    assert.equal(d.schema.safeParse(withoutId).success, false,
      `${d.type} 的 schema 必须拒绝缺 clientReqId 的 payload`);
    assert.equal(d.schema.safeParse(valid).success, true,
      `${d.type} 的 schema 使用最小合法 payload 应通过`);
    assert.equal(d.schema.safeParse({ ...valid, __extra: true }).success, false,
      `${d.type} 的 schema 必须拒绝未知字段`);
  }
});

test("schema 要求 clientReqId 的路由必须开 idem: true（09·I1 反向；defineRpc 重载在编译期挡，这里兜运行时）", async () => {
  const defs = await collectEndpoints();
  for (const d of defs) {
    const valid = validPayloads[d.type];
    assert.ok(valid, `${d.type} 缺少 valid payload fixture`);
    const { clientReqId: _id, ...withoutId } = valid;
    const needsReqId = !d.schema.safeParse(withoutId).success
      && d.schema.safeParse(valid).success;
    if (needsReqId) {
      assert.equal(d.idem, true, `${d.type} 的 schema 要求 clientReqId 但未开 idem——占位/结果缓存整条链失效`);
    }
  }
});

test("服务端 schema 与 shared request validator 逐路由保持同一规范化结果", async () => {
  const defs = await collectEndpoints();
  for (const d of defs) {
    const fixture = validPayloads[d.type];
    assert.ok(fixture, `${d.type} 缺少 valid payload fixture`);
    const shared = validateLobbyRpcRequest(d.type, fixture);
    assert.deepEqual(d.schema.parse(fixture), shared, `${d.type} schema 不得偏离 shared validator 输出`);

    // The two boundaries must reject the same representative malformed input.
    const malformed = { ...fixture, __extra: true };
    assert.throws(() => d.schema.parse(malformed), `${d.type} server schema 接受了 extra key`);
    assert.throws(() => validateLobbyRpcRequest(d.type, malformed), `${d.type} shared validator 接受了 extra key`);
  }
  assert.deepEqual(new Set(Object.keys(LOBBY_RPC_REQUEST_VALIDATORS)), new Set(ALL_LOBBY_RPC_TYPES));
});

test("defineRpc 在发送前校验 handler response，禁止 malformed reply 穿过服务端边界", async () => {
  const def = defineRpc(UserRpc.GetUserId, {
    schema: sharedRpcSchema(UserRpc.GetUserId),
    // Extra properties are structurally assignable in TypeScript; runtime
    // response validation is what makes the wire boundary exact.
    handler: async () => ({ uid: "u1", extra: true }),
  });
  await assert.rejects(
    def.handler({ uid: "u1", sessionId: "s1", push: () => {} }, {}),
    /WIRE_KEYS/,
  );
});
