import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverSmokeEndpoints } from "./smoke";

const selected = { gameWsUrl: "wss://directory.example" };
const legacy = { name: "game-server", gameRoomProtocol: 8, lobbyProtocol: 7 };
const split = { ...legacy, lobbyWs: "wss://lobby.example", gameWs: "wss://match.example", worldWs: "wss://world.example" };
const response = (body: unknown, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("smoke PS2：从SERVER_URL/version发现独立角色，旧响应与缺字段按目录WS回落", async () => {
    const calls: string[] = [];
    assert.deepEqual(await discoverSmokeEndpoints(selected, { serverUrl: "https://http.example/" }, async (url) => {
        calls.push(url); return response(split)();
    }), { lobbyUrl: split.lobbyWs, gameUrl: split.gameWs });
    assert.deepEqual(calls, ["https://http.example/version"]);
    assert.deepEqual(await discoverSmokeEndpoints(selected, { serverUrl: "https://http.example" }, response(legacy)),
        { lobbyUrl: selected.gameWsUrl, gameUrl: selected.gameWsUrl });
    assert.deepEqual(await discoverSmokeEndpoints(selected, { serverUrl: "https://http.example" }, response({ ...legacy, gameWs: split.gameWs, lobbyWs: "" })),
        { lobbyUrl: selected.gameWsUrl, gameUrl: split.gameWs });
});

test("smoke PS2：LOBBY_URL/GAME_URL各自覆盖发现，允许SDK支持的HTTP(S)与WS(S) origin", async () => {
    assert.deepEqual(await discoverSmokeEndpoints(selected, {
        serverUrl: "http://127.0.0.1:2568", lobbyUrl: "http://127.0.0.1:2569", gameUrl: "ws://127.0.0.1:2572",
    }, response(split)), { lobbyUrl: "http://127.0.0.1:2569", gameUrl: "ws://127.0.0.1:2572" });
    assert.deepEqual(await discoverSmokeEndpoints(selected, {
        serverUrl: "https://http.example", lobbyUrl: "", gameUrl: "wss://override.example",
    }, response(split)), { lobbyUrl: split.lobbyWs, gameUrl: "wss://override.example" });
    await assert.rejects(discoverSmokeEndpoints(selected, {
        serverUrl: "https://http.example", lobbyUrl: "wss://host.example/path",
    }, response(split)), /WIRE_URL_PATH/);
});

test("smoke PS2：HTTP/网络/坏version均失败，即使显式覆盖也不降级", async () => {
    const config = { serverUrl: "https://http.example", lobbyUrl: "wss://lobby.example", gameUrl: "wss://game.example" };
    await assert.rejects(discoverSmokeEndpoints(selected, config, response(legacy, 503)), /HTTP 503/);
    await assert.rejects(discoverSmokeEndpoints(selected, config, async () => { throw new Error("network down"); }), /network down/);
    await assert.rejects(discoverSmokeEndpoints(selected, config, response({ ...legacy, lobbyWs: "https://wrong.example" })), /WIRE_URL_PROTOCOL/);
    await assert.rejects(discoverSmokeEndpoints(selected, config, response({ status: "ok" })), /WIRE_KEYS/);
});
