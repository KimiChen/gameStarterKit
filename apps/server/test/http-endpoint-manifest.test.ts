import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GameHttpContractMap, type GameHttpContractKey } from "@game/shared";
import { assertGameHttpRoutes, gameRouteDefinitions } from "../src/http/index";
import {
  assertHttpEndpointManifestFresh,
  discoverHttpEndpoints,
  writeHttpEndpointManifest,
  type HttpEndpointSource,
} from "../tools/http-endpoint-manifest";

const ALL_CONTRACT_KEYS = Object.keys(GameHttpContractMap) as readonly GameHttpContractKey[];

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function endpointSource(contractKey: string): string {
  return [
    "import { createGameEndpoint } from \"../contract\";",
    `export default createGameEndpoint(${JSON.stringify(contractKey)}, { method: \"GET\" }, async () => ({}));`,
    "",
  ].join("\n");
}

function createFixture(files: Readonly<Record<string, string>>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "http-endpoint-manifest-"));
  fs.mkdirSync(path.join(root, "src/http"), { recursive: true });
  for (const [relativePath, source] of Object.entries(files)) {
    const target = path.join(root, "src/http", relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source, "utf8");
  }
  return root;
}

test("checked-in HTTP endpoint manifest is fresh", () => {
  assert.doesNotThrow(() => assertHttpEndpointManifestFresh({ serverRoot: SERVER_ROOT }));
});

/**
 * 用 fixture 的**文件发现结果**重建「已登记 route 集合」：contractKey 来自 fixture 目录，
 * method/path 仍取自真实 endpoint 定义。旧断言只看这两样，看不到文件路径，
 * 因此对同一 key 的文件搬家完全无感 —— 而 manifest freshness 会红。
 */
function fixtureRouteDefinitions(
  endpoints: readonly HttpEndpointSource[],
): Record<string, (typeof gameRouteDefinitions)[GameHttpContractKey]> {
  return Object.fromEntries(endpoints.map(({ contractKey }) =>
    [contractKey, gameRouteDefinitions[contractKey as GameHttpContractKey]]));
}

function allKeyFixture(): string {
  return createFixture(Object.fromEntries(
    ALL_CONTRACT_KEYS.map((key) => [`misc/${key}.ts`, endpointSource(key)]),
  ));
}

test("file discovery catches an endpoint file move that the registered-route set cannot see", () => {
  const root = allKeyFixture();
  try {
    assert.equal(writeHttpEndpointManifest({
      serverRoot: root,
      expectedContractKeys: ALL_CONTRACT_KEYS,
    }), true);

    // 把 Version 端点挪到另一个域目录：contractKey 集合与 method/path 都没变，只有文件路径漂移。
    fs.mkdirSync(path.join(root, "src/http/deploy"), { recursive: true });
    fs.renameSync(
      path.join(root, "src/http/misc/Version.ts"),
      path.join(root, "src/http/deploy/Version.ts"),
    );
    const discovered = discoverHttpEndpoints({
      serverRoot: root,
      expectedContractKeys: ALL_CONTRACT_KEYS,
    });

    // 对照：作用在 fixture 作用域的已登记 route 集合上，旧断言仍然误绿。
    assert.doesNotThrow(() => assertGameHttpRoutes(fixtureRouteDefinitions(discovered)));
    // 同一个对照断言在 fixture 少一个 endpoint 时会红，说明它确实有判别力而不是恒绿。
    assert.throws(
      () => assertGameHttpRoutes(fixtureRouteDefinitions(
        discovered.filter((endpoint) => endpoint.contractKey !== "Version"),
      )),
      /route key 不一致：缺少=\[Version\]/,
    );

    assert.throws(
      () => assertHttpEndpointManifestFresh({
        serverRoot: root,
        expectedContractKeys: ALL_CONTRACT_KEYS,
      }),
      /manifest 缺失或陈旧.*Version:deploy\/Version\.ts/,
    );

    assert.equal(writeHttpEndpointManifest({
      serverRoot: root,
      expectedContractKeys: ALL_CONTRACT_KEYS,
    }), true);
    assert.doesNotThrow(() => assertHttpEndpointManifestFresh({
      serverRoot: root,
      expectedContractKeys: ALL_CONTRACT_KEYS,
    }));
    assert.match(
      fs.readFileSync(path.join(root, "src/http/manifest.generated.ts"), "utf8"),
      /import endpoint\d+ from "\.\/deploy\/Version";/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("manifest freshness catches a newly added endpoint file", () => {
  const root = createFixture({ "misc/healthz.ts": endpointSource("Health") });
  try {
    writeHttpEndpointManifest({ serverRoot: root, expectedContractKeys: ["Health"] });
    fs.writeFileSync(path.join(root, "src/http/misc/version.ts"), endpointSource("Version"), "utf8");

    assert.throws(
      () => assertHttpEndpointManifestFresh({
        serverRoot: root,
        expectedContractKeys: ["Health", "Version"],
      }),
      /manifest 缺失或陈旧.*Version:misc\/version\.ts/,
    );

    assert.equal(writeHttpEndpointManifest({
      serverRoot: root,
      expectedContractKeys: ["Health", "Version"],
    }), true);
    assert.doesNotThrow(() => assertHttpEndpointManifestFresh({
      serverRoot: root,
      expectedContractKeys: ["Health", "Version"],
    }));
    assert.match(
      fs.readFileSync(path.join(root, "src/http/manifest.generated.ts"), "utf8"),
      /"Version": endpoint1/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("HTTP endpoint discovery rejects missing, unknown and duplicate contract keys", () => {
  const missingRoot = createFixture({ "misc/healthz.ts": endpointSource("Health") });
  const unknownRoot = createFixture({ "misc/unknown.ts": endpointSource("UnknownContract") });
  const duplicateRoot = createFixture({
    "misc/healthz.ts": endpointSource("Health"),
    "other/healthz.ts": endpointSource("Health"),
  });
  try {
    assert.throws(
      () => discoverHttpEndpoints({ serverRoot: missingRoot, expectedContractKeys: ["Health", "Version"] }),
      /contractKey 集合不一致：缺少=\[Version\] 未知=\[\]/,
    );
    assert.throws(
      () => discoverHttpEndpoints({ serverRoot: unknownRoot, expectedContractKeys: ["Health"] }),
      /contractKey 集合不一致：缺少=\[Health\] 未知=\[UnknownContract\]/,
    );
    assert.throws(
      () => discoverHttpEndpoints({ serverRoot: duplicateRoot, expectedContractKeys: ["Health"] }),
      /contractKey 重复：Health=\[misc\/healthz\.ts,other\/healthz\.ts\]/,
    );
  } finally {
    for (const root of [missingRoot, unknownRoot, duplicateRoot]) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("root infrastructure, README and the explicit support directory are excluded from endpoint discovery", () => {
  const root = createFixture({
    "README.md": "# HTTP fixture\n",
    "_support/helper.ts": "export const helper = true;\n",
    "contract.ts": "export const createGameEndpoint = () => undefined;\n",
    "index.ts": "export const routes = {};\n",
    "manifest.generated.ts": "export const gameRouteDefinitions = {};\n",
  });
  try {
    assert.deepEqual(discoverHttpEndpoints({ serverRoot: root, expectedContractKeys: [] }), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("every domain .ts must import the official factory and use a literal direct default call", () => {
  const missingFactoryRoot = createFixture({ "misc/helper.ts": "export const helper = true;\n" });
  const localFactoryRoot = createFixture({
    "misc/local.ts": [
      "const createGameEndpoint = (...args: unknown[]) => args;",
      "export default createGameEndpoint(\"Local\", {}, async () => ({}));",
      "",
    ].join("\n"),
  });
  const wrongModuleRoot = createFixture({
    "misc/wrong.ts": [
      "import { createGameEndpoint } from \"./wrongFactory\";",
      "export default createGameEndpoint(\"Wrong\", {}, async () => ({}));",
      "",
    ].join("\n"),
  });
  const brokenRoot = createFixture({
    "misc/broken.ts": [
      "import { createGameEndpoint } from \"../contract\";",
      "export const broken = createGameEndpoint(\"Broken\", { method: \"GET\" }, async () => ({}));",
      "",
    ].join("\n"),
  });
  const dynamicKeyRoot = createFixture({
    "misc/dynamic.ts": [
      "import { createGameEndpoint } from \"../contract\";",
      "const key = \"Dynamic\";",
      "export default createGameEndpoint(key, { method: \"GET\" }, async () => ({}));",
      "",
    ].join("\n"),
  });
  const aliasRoot = createFixture({
    "misc/alias.ts": [
      "import { createGameEndpoint as defineEndpoint } from \"../contract\";",
      "export default defineEndpoint(\"Alias\", { method: \"GET\" }, async () => ({}));",
      "",
    ].join("\n"),
  });
  try {
    for (const root of [missingFactoryRoot, localFactoryRoot, wrongModuleRoot]) {
      assert.throws(
        () => discoverHttpEndpoints({ serverRoot: root, expectedContractKeys: [] }),
        /必须从 \.\.\/contract 命名导入 createGameEndpoint/,
      );
    }
    assert.throws(
      () => discoverHttpEndpoints({ serverRoot: brokenRoot, expectedContractKeys: [] }),
      /misc\/broken\.ts 必须且只能 default export 一个 createGameEndpoint/,
    );
    assert.throws(
      () => discoverHttpEndpoints({ serverRoot: dynamicKeyRoot, expectedContractKeys: [] }),
      /misc\/dynamic\.ts 的 createGameEndpoint contractKey 必须是非空字符串字面量/,
    );
    assert.deepEqual(
      discoverHttpEndpoints({ serverRoot: aliasRoot, expectedContractKeys: ["Alias"] }),
      [{ contractKey: "Alias", relativePath: "misc/alias.ts" }],
    );
  } finally {
    for (const root of [
      missingFactoryRoot,
      localFactoryRoot,
      wrongModuleRoot,
      brokenRoot,
      dynamicKeyRoot,
      aliasRoot,
    ]) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
