import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";
import { GameHttpContractMap } from "@game/shared";

const legacy = { name: "game-server", gameRoomProtocol: 8, lobbyProtocol: 1 };

test("PS2 Version契约：旧三字段响应与独立可选WS兼容，未知字段和非WS origin拒绝", () => {
  const validate = GameHttpContractMap.Version.response;
  assert.deepEqual(validate(legacy), legacy);
  assert.deepEqual(validate({ ...legacy, lobbyWs: "", gameWs: "wss://game.example:443", worldWs: "ws://localhost:3012" }),
    { ...legacy, lobbyWs: "", gameWs: "wss://game.example:443", worldWs: "ws://localhost:3012" });
  for (const key of ["lobbyWs", "gameWs", "worldWs"]) {
    for (const value of [undefined, null, 1, "http://example.com", "wss://user@example.com", "wss://example.com/path", "wss://example.com?token=x", "wss://example.com:65536"]) {
      assert.throws(() => validate({ ...legacy, [key]: value }), /WIRE_/, `${key}=${String(value)}`);
    }
  }
  assert.throws(() => validate({ ...legacy, wsUrl: "wss://unknown.example" }), /WIRE_KEYS/);
});

test("PS2 /version真实handler：空配置保留旧响应，显式三角色地址独立发布", () => {
  const source = 'import endpoint from "./src/http/misc/version.ts"; console.log(JSON.stringify(await endpoint({})));';
  const invoke = (overrides: Record<string, string>) => JSON.parse(execFileSync(process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", source], {
      cwd: new URL("../", import.meta.url), encoding: "utf8",
      env: { ...process.env, LOBBY_PUBLIC_WS_URL: "", GAME_PUBLIC_WS_URL: "", WORLD_PUBLIC_WS_URL: "", ...overrides },
    }).trim());
  const old = invoke({});
  assert.deepEqual(Object.keys(old).sort(), ["gameRoomProtocol", "lobbyProtocol", "name"]);
  const split = invoke({ LOBBY_PUBLIC_WS_URL: "wss://lobby.example", GAME_PUBLIC_WS_URL: "wss://game.example", WORLD_PUBLIC_WS_URL: "wss://world.example" });
  assert.deepEqual(split, { ...old, lobbyWs: "wss://lobby.example", gameWs: "wss://game.example", worldWs: "wss://world.example" });
  assert.deepEqual(invoke({ WORLD_PUBLIC_WS_URL: "ws://localhost:3012" }), { ...old, worldWs: "ws://localhost:3012" });
  assert.deepEqual(invoke({ LOBBY_PUBLIC_WS_URL: "  wss://lobby.example  ", GAME_PUBLIC_WS_URL: " \t", WORLD_PUBLIC_WS_URL: " \n" }),
    { ...old, lobbyWs: "wss://lobby.example" });
});

test("PS2 WS配置：三角色非法DNS在加载配置时拒绝，错误点名配置变量", async (t) => {
  for (const key of ["LOBBY_PUBLIC_WS_URL", "GAME_PUBLIC_WS_URL", "WORLD_PUBLIC_WS_URL"]) {
    await t.test(key, () => {
      for (const host of ["-lobby.example", "lobby-.example", ".example", "example.", "a..b", `${"a".repeat(64)}.example`]) {
        const result = spawnSync(process.execPath,
          ["--import", "tsx", "--input-type=module", "-e", 'await import("./src/core/infra/config.ts");'], {
            cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 15_000,
            env: { ...process.env, LOBBY_PUBLIC_WS_URL: "", GAME_PUBLIC_WS_URL: "", WORLD_PUBLIC_WS_URL: "", [key]: `ws://${host}:28100` },
          });
        assert.equal(result.error, undefined);
        assert.notEqual(result.status, 0, `${key} accepted invalid DNS host ${host}`);
        assert.match(result.stderr, new RegExp(key));
      }
    });
  }
});
