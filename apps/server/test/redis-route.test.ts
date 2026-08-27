import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRedisUrl } from "../src/core/infra/redisRoute";

test("redis route URL validation is fail-closed before client construction", () => {
  assert.equal(validateRedisUrl(" redis://127.0.0.1:6401 ", "durable[0]"), "redis://127.0.0.1:6401");
  assert.equal(validateRedisUrl("rediss://cache.example.test", "cache"), "rediss://cache.example.test");
  for (const bad of [undefined, null, "", "http://127.0.0.1:6401", "redis:", "redis:///missing-host", "not a url"]) {
    assert.throws(() => validateRedisUrl(bad, "cache"), /redis-route: cache\.url/);
  }
});
