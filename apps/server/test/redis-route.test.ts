import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { BUCKETS } from "../src/core/infra/config";
import {
  _redisRouteTestHooks,
  parseRedisRouteDocument,
  validateRedisUrl,
} from "../src/core/infra/redisRoute";

const routeDir = mkdtempSync(join(tmpdir(), "game-redis-route-"));
const previousRouteFile = process.env.REDIS_ROUTE_FILE;
const previousDurableUrl = process.env.REDIS_DURABLE_URL;
const previousCacheUrl = process.env.REDIS_CACHE_URL;

after(() => {
  if (previousRouteFile === undefined) delete process.env.REDIS_ROUTE_FILE;
  else process.env.REDIS_ROUTE_FILE = previousRouteFile;
  if (previousDurableUrl === undefined) delete process.env.REDIS_DURABLE_URL;
  else process.env.REDIS_DURABLE_URL = previousDurableUrl;
  if (previousCacheUrl === undefined) delete process.env.REDIS_CACHE_URL;
  else process.env.REDIS_CACHE_URL = previousCacheUrl;
  _redisRouteTestHooks.resetTable();
  rmSync(routeDir, { recursive: true, force: true });
});

test("redis route URL validation is fail-closed before client construction", () => {
  assert.equal(validateRedisUrl("redis://127.0.0.1:6401", "durable[0]"), "redis://127.0.0.1:6401");
  assert.equal(validateRedisUrl("rediss://cache.example.test", "cache"), "rediss://cache.example.test");
  for (const bad of [
    undefined,
    null,
    "",
    " redis://127.0.0.1:6401",
    "redis://127.0.0.1:6401 ",
    "http://127.0.0.1:6401",
    "redis:",
    "redis:///missing-host",
    "not a url",
  ]) {
    assert.throws(() => validateRedisUrl(bad, "cache"), /redis-route: cache\.url/);
  }
});

function validYaml(): string {
  return [
    `buckets: ${BUCKETS}`,
    "durable:",
    "  - url: redis://127.0.0.1:6402",
    "    range: [8192, 16383]",
    "  - url: redis://127.0.0.1:6401",
    "    range: [0, 8191]",
    "cache:",
    "  url: rediss://cache.example.test",
    "",
  ].join("\n");
}

function loadYaml(text: string): ReturnType<typeof _redisRouteTestHooks.loadTable> {
  const path = join(routeDir, "routes.yaml");
  writeFileSync(path, text, "utf8");
  process.env.REDIS_ROUTE_FILE = path;
  _redisRouteTestHooks.resetTable();
  return _redisRouteTestHooks.loadTable();
}

test("REDIS_ROUTE_FILE loader parses, sorts, and returns a complete bucket cover", () => {
  const table = loadYaml(validYaml());
  assert.deepEqual(table.durable, [
    { url: "redis://127.0.0.1:6401", range: [0, 8191] },
    { url: "redis://127.0.0.1:6402", range: [8192, 16383] },
  ]);
  assert.equal(table.cacheUrl, "rediss://cache.example.test");
});

test("REDIS_ROUTE_FILE loader rejects every structural and coverage failure before routing", () => {
  const base = {
    buckets: BUCKETS,
    durable: [
      { url: "redis://127.0.0.1:6401", range: [0, 8191] },
      { url: "redis://127.0.0.1:6402", range: [8192, BUCKETS - 1] },
    ],
    cache: { url: "redis://127.0.0.1:6403" },
  };
  const cases: Array<[string, unknown, RegExp]> = [
    ["scalar document", "route", /YAML object/],
    ["wrong buckets", { ...base, buckets: BUCKETS - 1 }, /buckets=/],
    ["missing durable", { ...base, durable: [] }, /durable/],
    ["missing cache", { ...base, cache: undefined }, /cache/],
    ["non-object durable entry", { ...base, durable: ["bad"] }, /durable\[0\]/],
    ["short range", { ...base, durable: [{ url: "redis://a", range: [0] }] }, /range/],
    ["non-integer range", { ...base, durable: [{ url: "redis://a", range: [0, "8191"] }] }, /range/],
    ["negative range", { ...base, durable: [{ url: "redis://a", range: [-1, 8191] }] }, /range/],
    ["range above bucket limit", { ...base, durable: [{ url: "redis://a", range: [0, BUCKETS] }] }, /range/],
    ["reversed range", { ...base, durable: [{ url: "redis://a", range: [8191, 0] }] }, /range/],
    ["invalid durable URL", { ...base, durable: [{ url: "http://a", range: [0, BUCKETS - 1] }] }, /durable\[0\]\.url/],
    ["gap", { ...base, durable: [{ url: "redis://a", range: [0, 100] }, { url: "redis://b", range: [102, BUCKETS - 1] }] }, /未覆盖/],
    ["overlap", { ...base, durable: [{ url: "redis://a", range: [0, 100] }, { url: "redis://b", range: [100, BUCKETS - 1] }] }, /未覆盖/],
    ["invalid cache URL", { ...base, cache: { url: "http://cache" } }, /cache\.url/],
  ];
  for (const [name, document, matcher] of cases) {
    assert.throws(() => parseRedisRouteDocument(document), matcher, `${name} 应拒绝`);
  }

  // The route-file path must exercise the same parser, including YAML decode.
  assert.throws(() => loadYaml("- scalar\n"), /YAML object/);
});

test("REDIS_ROUTE_FILE loader validates fallback URLs when the file is absent", () => {
  delete process.env.REDIS_ROUTE_FILE;
  process.env.REDIS_DURABLE_URL = "http://not-redis";
  process.env.REDIS_CACHE_URL = "redis://127.0.0.1:6402";
  _redisRouteTestHooks.resetTable();
  assert.throws(() => _redisRouteTestHooks.loadTable(), /durable\[0\]\.url/);
});
