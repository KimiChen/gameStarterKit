import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { pack, readPackage, legacySnapshot, install } from "./package";
import { readZip, writeZip } from "./zip";
import { generate } from "./generate";
import * as legacy from "../../../shared/src/protocol/lobbyRpc/registry.generated";
import * as native from "../../../shared/src/native/lobbyRpc/index.generated";
const root = path.resolve(__dirname, "../../../..");
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "native-kit-test-"));
const sha = (bytes: Buffer) =>
  crypto.createHash("sha256").update(bytes).digest("hex");

test("native generation is fresh and never changes the legacy server tree", () => {
  const before = legacySnapshot(root);
  generate(root, true);
  assert.equal(legacySnapshot(root), before);
  assert.equal(
    legacy.ALL_LOBBY_RPC_TYPES.some((t) => t.startsWith("gameDemo")),
    false,
  );
  assert.ok(native.ALL_LOBBY_RPC_TYPES.includes("gameDemoBoss.attack"));
});
test("native codecs validate native errors and reject forged push types", () => {
  const reply = {
    id: "n1",
    ok: false,
    err: { code: "GAME_DEMO_DEV_DISABLED", msg: "disabled" },
  };
  assert.deepEqual(native.validateRpcReply(reply), reply);
  assert.throws(() =>
    native.validateLobbyPush({ type: ["gameDemoBoss.changed"], data: {} }),
  );
  assert.throws(() => native.validateLobbyRpcRequest("__proto__" as never, {}));
});
test("every native route has a packaged request/response vector", async () => {
  const files = fs
    .readdirSync(
      path.join(root, "apps/serverNew/kits/gameDemo/verify/protocolVectors"),
    )
    .filter((f) => f.startsWith("gameDemo") && f.endsWith(".ts"));
  const vectors: Record<string, { request: unknown; response: unknown }> = {};
  for (const f of files)
    Object.assign(
      vectors,
      require(
        path.join(
          root,
          "apps/serverNew/kits/gameDemo/verify/protocolVectors",
          f,
        ),
      ).default,
    );
  assert.deepEqual(
    Object.keys(vectors).sort(),
    native.ALL_LOBBY_RPC_TYPES.filter((t) => t.startsWith("gameDemo")).sort(),
  );
  for (const [type, v] of Object.entries(vectors)) {
    native.validateLobbyRpcRequest(type as native.LobbyRpcType, v.request);
    native.validateLobbyRpcResponse(type as native.LobbyRpcType, v.response);
  }
});
test("native package is deterministic, rejects legacy ownership, corruption and incompatible hosts", () => {
  const dir = temp();
  try {
    const a = path.join(dir, "a.zip"),
      b = path.join(dir, "b.zip");
    const before = legacySnapshot(root);
    pack(root, "gameDemo", a);
    pack(root, "gameDemo", b);
    assert.deepEqual(fs.readFileSync(a), fs.readFileSync(b));
    const pkg = readPackage(fs.readFileSync(a), root);
    assert.ok(pkg.files.size > 30);
    assert.equal(legacySnapshot(root), before);
    const entries = readZip(fs.readFileSync(a));
    const metadata = JSON.parse(
      entries.find((e) => e.path === "native-kit.json")!.data.toString(),
    );
    const forbidden = "apps/server/src/injected.ts",
      bytes = Buffer.from("forbidden");
    metadata.entries.push({ path: forbidden, sha256: sha(bytes) });
    const forged = writeZip([
      ...entries.filter((e) => e.path !== "native-kit.json"),
      { path: "native-kit.json", data: Buffer.from(JSON.stringify(metadata)) },
      { path: forbidden, data: bytes },
    ]);
    assert.throws(() => readPackage(forged, root), /Forbidden native path/);
    const corrupt = Buffer.from(fs.readFileSync(a));
    corrupt[30 + corrupt.readUInt16LE(26) + corrupt.readUInt16LE(28)] ^= 1;
    assert.throws(() => readPackage(corrupt, root));
    assert.throws(
      () => readPackage(fs.readFileSync(a), dir),
      /host declaration/,
    );
    assert.throws(() => install(root, a), /Unowned or modified destination/);
    assert.equal(legacySnapshot(root), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("install refuses immutable-version changes and downgrades before touching deployment data", () => {
  const dir = temp();
  try {
    const zip = path.join(dir, "kit.zip");
    pack(root, "gameDemo", zip);
    const pkg = readPackage(fs.readFileSync(zip), root);
    const caps = "apps/serverNew/server/native-kit-capabilities.json";
    fs.mkdirSync(path.dirname(path.join(dir, caps)), { recursive: true });
    fs.copyFileSync(path.join(root, caps), path.join(dir, caps));
    const lock = path.join(dir, "apps/serverNew/kit-locks/gameDemo.json");
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(
      lock,
      JSON.stringify({ format: 1, manifest: pkg.manifest, entries: [] }),
    );
    assert.throws(() => install(dir, zip), /Same version has different bytes/);
    fs.writeFileSync(
      lock,
      JSON.stringify({
        format: 1,
        manifest: { ...pkg.manifest, version: "999.0.0" },
        entries: pkg.entries,
      }),
    );
    assert.throws(() => install(dir, zip), /Downgrade refused/);
    assert.equal(
      fs.existsSync(path.join(dir, "apps/serverNew/kits/gameDemo")),
      false,
    );
    const alias = path.join(dir, "legacy-alias");
    fs.symlinkSync(path.join(root, "apps/server"), alias, "dir");
    assert.throws(
      () => pack(root, "gameDemo", path.join(alias, "forbidden.zip")),
      /Legacy directory is read-only/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
