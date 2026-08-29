import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertGameHttpRoutes } from "../src/http/index";
import {
  assertHttpEndpointManifestFresh,
  discoverHttpEndpoints,
  writeHttpEndpointManifest,
} from "../tools/http-endpoint-manifest";

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

test("file discovery catches an endpoint that the registered-route set cannot see", () => {
  const root = createFixture({ "misc/healthz.ts": endpointSource("Health") });
  try {
    writeHttpEndpointManifest({ serverRoot: root, expectedContractKeys: ["Health"] });
    fs.writeFileSync(path.join(root, "src/http/misc/version.ts"), endpointSource("Version"), "utf8");

    // The historical assertion only sees the already imported definitions and
    // therefore remains green when an unrelated endpoint file is omitted.
    assert.doesNotThrow(() => assertGameHttpRoutes());
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
