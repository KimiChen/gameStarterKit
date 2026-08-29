import assert from "node:assert/strict";
import { test } from "node:test";
import { GameHttpContractMap } from "@game/shared";
import { assertGameHttpRoutes, gameRouteDefinitions } from "../src/http/index";

test("HTTP route definitions match shared contract keys and method/path", () => {
  assert.doesNotThrow(() => assertGameHttpRoutes());

  const { PayWxNotify: _pay, ...missing } = gameRouteDefinitions;
  assert.throws(
    () => assertGameHttpRoutes(missing),
    /route key 不一致.*PayWxNotify/,
  );

  const wrongHealth = Object.assign(async () => ({}), {
    path: "/healthz-v2",
    options: { method: "GET" },
  });
  assert.throws(
    () => assertGameHttpRoutes({ ...gameRouteDefinitions, Health: wrongHealth }),
    /Health method\/path 不一致/,
  );
});

/** Run the same Standard Schema adapter used by Better-Call for a route body. */
async function routeBodyResult(route: typeof gameRouteDefinitions[keyof typeof gameRouteDefinitions], body: unknown): Promise<unknown> {
  const schema = route.options.body;
  assert.ok(schema, "POST route must expose a body schema");
  return schema["~standard"].validate(body);
}

function sharedAccepts(validator: (value: unknown) => unknown, value: unknown): boolean {
  try {
    validator(value);
    return true;
  } catch {
    return false;
  }
}

test("HTTP request schemas stay aligned with shared uid/amountFen domains", async () => {
  const admin = gameRouteDefinitions.AdminKick;
  assert.strictEqual(
    admin.options.body,
    GameHttpContractMap.AdminKick.requestSchema,
    "AdminKick 必须直接安装 shared contract 生成的 request schema",
  );
  assert.equal(admin.options.body?.["~standard"].vendor, "@game/shared/http");
  const adminVectors: readonly [string, unknown][] = [
    ["uid min", { uid: "u" }],
    ["uid max shared", { uid: "u".repeat(128) }],
    ["uid over max", { uid: "u".repeat(129) }],
    ["uid empty", { uid: "" }],
  ];
  for (const [label, value] of adminVectors) {
    const shared = sharedAccepts(GameHttpContractMap.AdminKick.request, value);
    const route = await routeBodyResult(admin, value) as { value?: unknown; issues?: unknown };
    assert.equal(Boolean(route.issues), !shared, `AdminKick ${label} route/shared 接受集合漂移`);
  }

  const pay = gameRouteDefinitions.PayWxNotify;
  assert.strictEqual(
    pay.options.body,
    GameHttpContractMap.PayWxNotify.requestSchema,
    "PayWxNotify 必须直接安装 shared contract 生成的 request schema",
  );
  assert.equal(pay.options.body?.["~standard"].vendor, "@game/shared/http");
  const payVectors: readonly [string, unknown][] = [
    ["amount min", { orderId: "o", wxTxnId: "w", amountFen: 1 }],
    ["amount max shared", { orderId: "o", wxTxnId: "w", amountFen: Number.MAX_SAFE_INTEGER }],
    ["amount over safe max", { orderId: "o", wxTxnId: "w", amountFen: Number.MAX_SAFE_INTEGER + 1 }],
    ["amount infinity", { orderId: "o", wxTxnId: "w", amountFen: Number.POSITIVE_INFINITY }],
    ["amount fractional", { orderId: "o", wxTxnId: "w", amountFen: 1.5 }],
    ["amount zero", { orderId: "o", wxTxnId: "w", amountFen: 0 }],
  ];
  for (const [label, value] of payVectors) {
    const shared = sharedAccepts(GameHttpContractMap.PayWxNotify.request, value);
    const route = await routeBodyResult(pay, value) as { value?: unknown; issues?: unknown };
    assert.equal(Boolean(route.issues), !shared, `PayWxNotify ${label} route/shared 接受集合漂移`);
  }
});
