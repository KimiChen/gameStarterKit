import assert from "node:assert/strict";
import { test } from "node:test";
import { GameHttpContractMap, type GameHttpContractKey } from "@game/shared";
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

/** `[label, value, expectedAccepted]`：expectedAccepted 是写死的绝对期望，不从被测实现推导。 */
type RequestVector = readonly [string, unknown, boolean];

/**
 * 直接钉住绝对接受域：route 上安装的 schema 与 shared validator 都必须给出同一个**期望**结果。
 * ⛔ 不允许把 shared 的实际行为当成期望值（那会退化成自洽恒等式，放宽 shared 也不会变红）。
 */
async function assertRequestDomain(
  key: GameHttpContractKey,
  route: typeof gameRouteDefinitions[keyof typeof gameRouteDefinitions],
  vectors: readonly RequestVector[],
): Promise<void> {
  for (const [label, value, accepted] of vectors) {
    const result = await routeBodyResult(route, value) as { value?: unknown; issues?: unknown };
    assert.equal(Boolean(result.issues), !accepted, `${key} ${label} route schema 接受域与契约不符`);
    assert.equal(
      sharedAccepts(GameHttpContractMap[key].request, value),
      accepted,
      `${key} ${label} shared validator 接受域与契约不符`,
    );
  }
}

test("HTTP request schemas pin the absolute shared uid/amountFen domains", async () => {
  const admin = gameRouteDefinitions.AdminKick;
  // 同一性断言是「schema 确实来自 shared 单源」的注入证据；接受域由下面的绝对向量单独钉住。
  assert.strictEqual(
    admin.options.body,
    GameHttpContractMap.AdminKick.requestSchema,
    "AdminKick 必须直接安装 shared contract 生成的 request schema",
  );
  assert.equal(admin.options.body?.["~standard"].vendor, "@game/shared/http");
  await assertRequestDomain("AdminKick", admin, [
    // uid 的契约接受域是 1..128 个字符，两端闭区间。
    ["uid 1 字符", { uid: "u" }, true],
    ["uid 128 字符", { uid: "u".repeat(128) }, true],
    ["uid 129 字符", { uid: "u".repeat(129) }, false],
    ["uid 空串", { uid: "" }, false],
    ["uid 非字符串", { uid: 1 }, false],
  ]);

  const pay = gameRouteDefinitions.PayWxNotify;
  assert.strictEqual(
    pay.options.body,
    GameHttpContractMap.PayWxNotify.requestSchema,
    "PayWxNotify 必须直接安装 shared contract 生成的 request schema",
  );
  assert.equal(pay.options.body?.["~standard"].vendor, "@game/shared/http");
  await assertRequestDomain("PayWxNotify", pay, [
    // amountFen 的契约接受域是 1..MAX_SAFE_INTEGER 的安全整数，两端闭区间。
    ["amountFen 1", { orderId: "o", wxTxnId: "w", amountFen: 1 }, true],
    ["amountFen MAX_SAFE_INTEGER", { orderId: "o", wxTxnId: "w", amountFen: Number.MAX_SAFE_INTEGER }, true],
    ["amountFen 0", { orderId: "o", wxTxnId: "w", amountFen: 0 }, false],
    ["amountFen 1.5", { orderId: "o", wxTxnId: "w", amountFen: 1.5 }, false],
    ["amountFen MAX_SAFE_INTEGER+1", { orderId: "o", wxTxnId: "w", amountFen: Number.MAX_SAFE_INTEGER + 1 }, false],
    ["amountFen Infinity", { orderId: "o", wxTxnId: "w", amountFen: Number.POSITIVE_INFINITY }, false],
  ]);
});
