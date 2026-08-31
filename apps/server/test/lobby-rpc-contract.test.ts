/**
 * ws-RPC 契约测试（纯内存，不需要 Redis/MySQL——infra 客户端都是首次调用才建连）。
 *
 * 兜住类型系统够不着的运行时缺口：
 *  1. loader 全集校验：shared 声明 ⇔ websocket/<域>/<接口>.ts 双向相等 + 路由名↔路径一致
 *     （collectEndpoints 内部校验，不一致直接 throw——CI 先于启动兜住）
 *  2. 幂等域 = registry 派生：def.idem 与 LOBBY_RPC_ROUTE_MODES 的 idempotent-write 集合双向相等
 *  3. 服务端 zod schema ⇔ shared validator 逐路由对拍（payload 取自 lobbyRpcVectors sidecar）
 * （信封/错误码/推送名已单源合一——服务端直接 import shared，无镜像可漂移，不再扫源。
 *  向量本体的正反向断言在 lobby-rpc-vectors.test.ts。）
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_LOBBY_RPC_TYPES,
  LOBBY_RPC_REQUEST_VALIDATORS,
  LOBBY_RPC_ROUTE_MODES,
  UserRpc,
  validateLobbyRpcRequest,
  type LobbyRpcType,
} from "@game/shared";
import { collectEndpoints } from "../src/websocket/loader";
import { defineRpc } from "../src/websocket/rpc";
import guildVectors from "./lobbyRpcVectors/guild";
import mailVectors from "./lobbyRpcVectors/mail";
import shopVectors from "./lobbyRpcVectors/shop";
import userVectors from "./lobbyRpcVectors/user";

/** sidecar 向量合并视图（集合完备性由 lobby-rpc-vectors.test.ts 双向断言）。 */
const vectors: Record<string, { request: unknown; response: unknown } | undefined> = {
  ...guildVectors,
  ...mailVectors,
  ...shopVectors,
  ...userVectors,
};

test("端点全集与 shared 声明集合相等，路由名与文件路径一致", async () => {
  const defs = await collectEndpoints(); // 内部已做双向集合校验 + 路径一致校验
  assert.equal(defs.length, ALL_LOBBY_RPC_TYPES.length);
  assert.equal(new Set(defs.map((d) => d.type)).size, defs.length, "路由名不得重复");
});

test("幂等域 = registry 派生（mode=idempotent-write ⇔ def.idem，双向）", async () => {
  const defs = await collectEndpoints();
  const registryIdem = new Set(
    (ALL_LOBBY_RPC_TYPES as readonly LobbyRpcType[]).filter((t) => LOBBY_RPC_ROUTE_MODES[t] === "idempotent-write"),
  );
  const defIdem = new Set(defs.filter((d) => d.idem === true).map((d) => d.type));
  assert.deepEqual(defIdem, registryIdem, "def.idem 集合必须与 registry 的 idempotent-write 集合相等");
  assert.ok(registryIdem.size >= 3, "幂等写路由至少含 updateProfile/claimAttach/purchase");
  for (const d of defs) {
    assert.equal(d.mode, LOBBY_RPC_ROUTE_MODES[d.type], `${d.type} 的 def.mode 必须来自 registry`);
  }
});

test("服务端 schema 与 shared request validator 逐路由保持同一规范化结果", async () => {
  const defs = await collectEndpoints();
  for (const d of defs) {
    const vector = vectors[d.type];
    assert.ok(vector, `${d.type} 缺少 lobbyRpcVectors sidecar 向量`);
    const fixture = vector.request;
    const shared = validateLobbyRpcRequest(d.type, fixture);
    assert.deepEqual(d.schema.parse(fixture), shared, `${d.type} schema 不得偏离 shared validator 输出`);

    // The two boundaries must reject the same representative malformed input.
    const malformed = { ...(fixture as Record<string, unknown>), __extra: true };
    assert.throws(() => d.schema.parse(malformed), `${d.type} server schema 接受了 extra key`);
    assert.throws(() => validateLobbyRpcRequest(d.type, malformed), `${d.type} shared validator 接受了 extra key`);
  }
  assert.deepEqual(new Set(Object.keys(LOBBY_RPC_REQUEST_VALIDATORS)), new Set(ALL_LOBBY_RPC_TYPES));
});

test("defineRpc 在发送前校验 handler response，禁止 malformed reply 穿过服务端边界", async () => {
  const def = defineRpc(UserRpc.GetUserId, {
    // Extra properties are structurally assignable in TypeScript; runtime
    // response validation is what makes the wire boundary exact.
    handler: async () => ({ uid: "u1", extra: true }),
  });
  await assert.rejects(
    def.handler({ uid: "u1", sessionId: "s1", push: () => {} }, {}),
    /WIRE_KEYS/,
  );
});
