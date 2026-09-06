/**
 * Lobby RPC 向量 sidecar 通用测试（Non-intrusive §5.6 阶段 3）。
 *
 * 中央向量表（原 wire-contract 的 requestFixtures/responseFixtures 与 lobby-rpc-contract
 * 的 validPayloads）已迁入 test/lobbyRpcVectors/<域>.ts，登记表由 codegen:plugins 生成
 * （lobbyRpcVectors/index.generated.ts）；本文件按清单自动验证：
 *  ① sidecar 文件集合 ⇔ registry 域集合双向相等；
 *  ② 路由 ⇔ 向量双向相等（漏 / 多 / 未知路由都红）；
 *  ③ 全部 request/response 向量通过 shared validator；
 *  ④ request 与 response 各自加未知字段必拒（WIRE_KEYS）；
 *  ⑤ idempotent-write 去掉 clientReqId 必拒；
 *  ⑥ query / natural-write 的向量按约定不含 clientReqId（markRead 现状无）；
 *  ⑦ endpoint 无法覆盖 schema/mode/idem：运行时断言 def.mode/def.idem 与 registry 一致
 *    （编译期负例见 lobby-rpc-modes.typecheck.ts）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ALL_LOBBY_RPC_TYPES,
  LOBBY_RPC_DOMAINS,
  LOBBY_RPC_ROUTE_MODES,
  validateLobbyRpcRequest,
  validateLobbyRpcResponse,
  type LobbyRpcType,
} from "@game/shared";
import { collectEndpoints } from "../src/websocket/loader";
import { LOBBY_RPC_VECTOR_FILES } from "./lobbyRpcVectors/index.generated";

const VECTORS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "lobbyRpcVectors");

/**
 * 域 → sidecar default：来自 `codegen:plugins` 生成的登记表（新增域只新建 lobbyRpcVectors/<域>.ts
 * 并重跑 codegen，⛔ 本文件不再手写登记行；生成器已做 domain ⇔ sidecar 双向对齐，① 再核一遍）。
 */
const VECTOR_FILES = LOBBY_RPC_VECTOR_FILES;

const assertInvalid = (fn: () => unknown, code?: string): void => {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof Error)) return false;
    return code === undefined || error.message.startsWith(code);
  });
};

function mergedVectors(): Map<LobbyRpcType, { request: unknown; response: unknown }> {
  const merged = new Map<LobbyRpcType, { request: unknown; response: unknown }>();
  for (const [domain, file] of Object.entries(VECTOR_FILES)) {
    for (const [route, vector] of Object.entries(file) as [LobbyRpcType, { request: unknown; response: unknown }][]) {
      assert.ok(!merged.has(route), `路由 ${route} 的向量在多个 sidecar 文件里重复`);
      assert.ok(route.startsWith(`${domain}.`), `路由 ${route} 的向量放错了 sidecar 文件（lobbyRpcVectors/${domain}.ts）`);
      assert.ok(vector && typeof vector === "object", `${route} 向量必须是 { request, response } 对象`);
      assert.deepEqual(Object.keys(vector).sort(), ["request", "response"], `${route} 向量必须且只能有 request/response`);
      merged.set(route, vector);
    }
  }
  return merged;
}

test("① sidecar 文件集合 ⇔ registry 域集合双向相等", () => {
  const files = fs.readdirSync(VECTORS_DIR)
    .filter((name) => name.endsWith(".ts") && name !== "vectorTypes.ts" && !name.endsWith(".generated.ts"))
    .map((name) => name.slice(0, -".ts".length))
    .sort();
  assert.deepEqual(files, [...LOBBY_RPC_DOMAINS].sort(), "lobbyRpcVectors/ 文件集合必须与 LOBBY_RPC_DOMAINS 相等");
  assert.deepEqual(Object.keys(VECTOR_FILES).sort(), files, "生成的 LOBBY_RPC_VECTOR_FILES 登记表必须覆盖全部 sidecar 文件");
});

test("② 路由 ⇔ 向量双向相等（漏/多/未知路由都红）", () => {
  const merged = mergedVectors();
  assert.deepEqual(new Set(merged.keys()), new Set(ALL_LOBBY_RPC_TYPES));
});

test("③/④ 向量通过 shared validator，加未知字段后 request/response 都被拒", () => {
  const merged = mergedVectors();
  for (const [type, vector] of merged) {
    assert.doesNotThrow(() => validateLobbyRpcRequest(type, vector.request), `${type} request 向量应合法`);
    assert.doesNotThrow(() => validateLobbyRpcResponse(type, vector.response), `${type} response 向量应合法`);
    assertInvalid(
      () => validateLobbyRpcRequest(type, { ...(vector.request as Record<string, unknown>), extra: true }),
      "WIRE_KEYS",
    );
    assertInvalid(
      () => validateLobbyRpcResponse(type, { ...(vector.response as Record<string, unknown>), extra: true }),
      "WIRE_KEYS",
    );
  }
});

test("⑤/⑥ 幂等向量去 clientReqId 必拒；query/natural-write 向量不含 clientReqId", () => {
  const merged = mergedVectors();
  let idemCount = 0;
  for (const [type, vector] of merged) {
    const mode = LOBBY_RPC_ROUTE_MODES[type];
    const request = vector.request as Record<string, unknown>;
    if (mode === "idempotent-write") {
      idemCount += 1;
      assert.ok(
        Object.prototype.hasOwnProperty.call(request, "clientReqId"),
        `${type} 是 idempotent-write，向量必须携带 clientReqId`,
      );
      const { clientReqId: _id, ...withoutId } = request;
      assertInvalid(() => validateLobbyRpcRequest(type, withoutId), "WIRE_KEYS");
    } else {
      // 约定断言：query/natural-write 的请求不带 clientReqId（shop.queryOp 带的是原操作
      // opId——正是「⛔ 不得按结构推断幂等」的反例，displayed by registry mode 而非字段）。
      assert.ok(
        !Object.prototype.hasOwnProperty.call(request, "clientReqId"),
        `${type}（${mode}）的向量不应含 clientReqId`,
      );
    }
  }
  assert.ok(idemCount >= 3, "幂等写路由至少含 updateProfile/claimAttach/purchase");
});

test("⑦ endpoint 无法覆盖 schema/mode/idem：def.mode/def.idem 必须与 registry 派生一致", async () => {
  const defs = await collectEndpoints();
  for (const def of defs) {
    const mode = LOBBY_RPC_ROUTE_MODES[def.type];
    assert.equal(def.mode, mode, `${def.type} 的 def.mode 必须来自 registry`);
    assert.equal(def.idem === true, mode === "idempotent-write",
      `${def.type} 的 idem 派生位必须与 mode=idempotent-write 一致`);
  }
});

test("NaN/未知路由/响应越界（自 wire-contract 中央表用例迁移）", () => {
  assertInvalid(() => validateLobbyRpcRequest("mail.list", { limit: Number.NaN }), "WIRE_INTEGER");
  assertInvalid(() => validateLobbyRpcRequest("unknown.route" as never, {}), "RPC_TYPE");
  const purchase = (VECTOR_FILES.shop["shop.queryOp"] as unknown as { response: Record<string, unknown> }).response;
  assertInvalid(
    () => validateLobbyRpcResponse("shop.queryOp", { ...purchase, balance: Number.POSITIVE_INFINITY }),
    "WIRE_INTEGER",
  );
});
