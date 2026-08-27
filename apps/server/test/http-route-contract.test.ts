import assert from "node:assert/strict";
import { test } from "node:test";
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
