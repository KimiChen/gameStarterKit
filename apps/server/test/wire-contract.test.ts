/**
 * Shared runtime contract vectors. These tests intentionally feed plain JSON values,
 * not TypeScript-cast objects, so malformed 2xx/RPC/S2C payloads are caught at the
 * same boundary used by clients and servers.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiPath,
  C2S,
  C2S_RUNTIME_VALIDATORS,
  GameHttpContractMap,
  GamePhase,
  LobbyPush,
  LOBBY_RPC_REQUEST_VALIDATORS,
  LOBBY_RPC_RESPONSE_VALIDATORS,
  S2C,
  S2C_RUNTIME_VALIDATORS,
  WebPlatformHttpContractMap,
  validateC2SPayload,
  validateGameRoomState,
  validateLobbyPush,
  validateLobbyRpcRequest,
  validateLobbyRpcResponse,
  validateRoomJoinOptions,
  validateRpcEnvelope,
  validateRpcReply,
  validateS2CPayload,
  validateWebPlatformAreaListResponse,
  validateWebPlatformHasCharacterResponse,
  validateWebPlatformLoginResponse,
  validateWebPlatformRegisterCharacterResponse,
  validateWebPlatformVerifySessionRequest,
  validateWebPlatformVerifySessionResponse,
  type LobbyRpcType,
} from "@game/shared";

const assertInvalid = (fn: () => unknown, code?: string): void => {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof Error)) return false;
    return code === undefined || error.message.startsWith(code);
  });
};

test("HTTP contract map：路径/方法唯一且响应 validator 拒绝 extra、NaN 和非法 origin", () => {
  const contracts = Object.values(GameHttpContractMap);
  assert.equal(new Set(contracts.map((item) => `${item.method} ${item.path}`)).size, contracts.length);
  assert.equal(GameHttpContractMap.Health.path, ApiPath.Health);
  assert.equal(GameHttpContractMap.Version.path, ApiPath.Version);
  assertInvalid(() => GameHttpContractMap.Health.response({ status: "ok", serverTime: 1, version: "3", extra: true }), "WIRE_KEYS");
  assertInvalid(() => GameHttpContractMap.ClockNow.response({ serverTime: Number.NaN }), "WIRE_INTEGER");
  assertInvalid(() => validateWebPlatformAreaListResponse({ hash: "h", isOps: false, myServerIds: [], servers: [{
    serverId: 1, name: "s1", status: "smooth", tag: "normal", openTime: 0,
    gameHttpUrl: "https://game.example/path", gameWsUrl: "wss://game.example",
  }] }), "WIRE_URL_PATH");
  assertInvalid(() => validateWebPlatformLoginResponse({ userId: "u", accessToken: "t", isNewAccount: false, extra: 1 }), "WIRE_KEYS");
});

test("join/RPC envelope：exact keys、有限数值和错误码联合严格收口", () => {
  assert.deepEqual(validateRoomJoinOptions({ v: 3, token: "t", sId: 1, listHash: "h" }), { v: 3, token: "t", sId: 1, listHash: "h" });
  assertInvalid(() => validateRoomJoinOptions({ sId: Number.POSITIVE_INFINITY }), "WIRE_INTEGER");
  assertInvalid(() => validateRoomJoinOptions({ sId: 1, unknown: true }), "WIRE_KEYS");

  assert.deepEqual(validateRpcEnvelope({ id: "r1", type: "user.getInfo", payload: {} }), { id: "r1", type: "user.getInfo", payload: {} });
  assertInvalid(() => validateRpcEnvelope({ id: "r1", type: "user.getInfo", extra: 1 }), "WIRE_KEYS");
  assert.deepEqual(validateRpcReply({ id: "r1", ok: true, data: { uid: "u1" } }), { id: "r1", ok: true, data: { uid: "u1" } });
  assertInvalid(() => validateRpcReply({ id: "r1", ok: true, err: { code: "INTERNAL", msg: "x" } }), "RPC_REPLY_SHAPE");
  assertInvalid(() => validateRpcReply({ id: "r1", ok: false, err: { code: "NOPE", msg: "x" } }), "RPC_ERR_CODE");
  assert.deepEqual(validateRpcReply({ id: "r1", ok: false, err: { code: "INVALID_PAYLOAD", msg: "bad" } }), { id: "r1", ok: false, err: { code: "INVALID_PAYLOAD", msg: "bad" } });
});

test("C2S/S2C：每个消息都有 exact runtime validator，坏包不进入回调", () => {
  assert.deepEqual(validateC2SPayload(C2S.Ping, { clientTime: 1 }), { clientTime: 1 });
  assertInvalid(() => validateC2SPayload(C2S.Move, { dirX: 0, dirY: 0, extra: 1 }), "WIRE_KEYS");
  assertInvalid(() => validateC2SPayload(C2S.Move, { dirX: Number.NaN, dirY: 0 }), "WIRE_NUMBER");
  assertInvalid(() => validateC2SPayload(C2S.Chat, { text: "   " }), "MESSAGE_TEXT");
  assertInvalid(() => validateC2SPayload("c2s.unknown" as never, {}), "MESSAGE_TYPE");
  assert.deepEqual(validateS2CPayload(S2C.Welcome, { sessionId: "s1", tickRate: 20, motd: "ok" }), { sessionId: "s1", tickRate: 20, motd: "ok" });
  assertInvalid(() => validateS2CPayload(S2C.Pong, { clientTime: 1, serverTime: 2, extra: 0 }), "WIRE_KEYS");
  assertInvalid(() => validateS2CPayload(S2C.Error, { code: 1, message: "x", extra: true }), "WIRE_KEYS");
  assertInvalid(() => validateS2CPayload("s2c.unknown" as never, {}), "MESSAGE_TYPE");
  assert.equal(Object.keys(C2S_RUNTIME_VALIDATORS).length, 4);
  assert.equal(Object.keys(S2C_RUNTIME_VALIDATORS).length, 5);
});

const requestFixtures: Record<LobbyRpcType, unknown> = {
  "user.getUserId": {},
  "user.getInfo": {},
  "user.getProfile": { uid: "u1" },
  "user.updateProfile": { clientReqId: "c1", nickname: "n", avatarId: 1, province: "p", musicOn: true, sfxOn: false },
  "mail.list": { before: 10, limit: 20 },
  "mail.claimAttach": { clientReqId: "c1", mailId: 1 },
  "mail.markRead": { mailId: 1 },
  "shop.purchase": { clientReqId: "c1", sku: "sku1" },
  "shop.queryOp": { opId: "op1" },
  "guild.join": { clientReqId: "c1", guildId: 1 },
  "guild.leave": { clientReqId: "c1" },
  "guild.getEvents": { sinceSeq: 0 },
};

const ok = { ok: true };
const purchase = { opId: "op1", status: "done", balance: 10, granted: [{ kind: "item", itemId: 1, count: 1 }] };
const responseFixtures: Record<LobbyRpcType, unknown> = {
  "user.getUserId": { uid: "u1" },
  "user.getInfo": { user: { uid: "u1", star: 0, maxRound: 0, wins: 0, losses: 0, stamina: 30, lastStaminaRecoverAt: 0, musicOn: true, sfxOn: true, guildId: 0, ver: 1 } },
  "user.getProfile": { profile: null },
  "user.updateProfile": ok,
  "mail.list": { mails: [] },
  "mail.claimAttach": purchase,
  "mail.markRead": ok,
  "shop.purchase": purchase,
  "shop.queryOp": purchase,
  "guild.join": { ok: true, seq: 1 },
  "guild.leave": ok,
  "guild.getEvents": { events: [], latestSeq: 0, guildId: 0 },
};

test("Lobby route vectors：shared request/response map 覆盖全集且 extra key/NaN 均拒绝", () => {
  const types = Object.keys(LOBBY_RPC_REQUEST_VALIDATORS) as LobbyRpcType[];
  assert.deepEqual(new Set(types), new Set(Object.keys(LOBBY_RPC_RESPONSE_VALIDATORS)));
  for (const type of types) {
    assert.doesNotThrow(() => validateLobbyRpcRequest(type, requestFixtures[type]), type);
    assert.doesNotThrow(() => validateLobbyRpcResponse(type, responseFixtures[type]), type);
    assertInvalid(() => validateLobbyRpcRequest(type, { ...(requestFixtures[type] as Record<string, unknown>), extra: true }), "WIRE_KEYS");
  }
  assertInvalid(() => validateLobbyRpcRequest("mail.list", { limit: Number.NaN }), "WIRE_INTEGER");
  assertInvalid(() => validateLobbyRpcRequest("unknown.route" as never, {}), "RPC_TYPE");
  assertInvalid(() => validateLobbyRpcResponse("shop.queryOp", { ...purchase, balance: Number.POSITIVE_INFINITY }), "WIRE_INTEGER");
});

test("push/state vectors：未知推送、非法 phase、状态 extra key 在渲染前拒绝", () => {
  assert.deepEqual(validateLobbyPush({ type: LobbyPush.MailNew, data: { mailId: 1 } }), { type: LobbyPush.MailNew, data: { mailId: 1 } });
  assertInvalid(() => validateLobbyPush({ type: LobbyPush.MailNew, data: { mailId: 1, extra: 1 } }), "WIRE_KEYS");
  assertInvalid(() => validateLobbyPush({ type: "unknown", data: {} }), "PUSH_TYPE");
  const state = validateGameRoomState({ tick: 0, phase: GamePhase.Waiting, matchId: "", players: {} });
  assert.equal(state.players.size, 0);
  const mapSchemaLike = { entries: () => new Map([["s1", { id: "s1", name: "p", x: 0, y: 0, hp: 1, maxHp: 1, alive: true }]]).entries() };
  assert.equal(validateGameRoomState({ tick: 0, phase: GamePhase.Waiting, matchId: "", players: mapSchemaLike }).players.size, 1);
  assertInvalid(() => validateGameRoomState({ tick: 0, phase: "broken", matchId: "", players: {} }), "STATE_PHASE");
  assertInvalid(() => validateGameRoomState({ tick: 0, phase: GamePhase.Waiting, matchId: "", players: {}, extra: 1 }), "WIRE_KEYS");
});

test("WebPlatform contract map：Public consumer endpoints 都有 method/path 与 validator", () => {
  assert.equal(WebPlatformHttpContractMap.DevLogin.method, "POST");
  assert.equal(WebPlatformHttpContractMap.ListAreas.method, "GET");
  assert.equal(WebPlatformHttpContractMap.VerifySession.method, "POST");
  assert.equal(WebPlatformHttpContractMap.RegisterCharacter.method, "PUT");
  assert.equal(WebPlatformHttpContractMap.HasCharacter.method, "GET");
  assert.deepEqual(WebPlatformHttpContractMap.DevLogin.request({ devKey: "d", serverId: 1 }), { devKey: "d", serverId: 1 });
  assertInvalid(() => WebPlatformHttpContractMap.DevLogin.request({ devKey: "d", serverId: 1, extra: true }), "WIRE_KEYS");
  assert.deepEqual(
    validateWebPlatformVerifySessionRequest({ accessToken: "t", serverId: 1 }),
    { accessToken: "t", serverId: 1 },
  );
  assert.deepEqual(
    validateWebPlatformVerifySessionResponse({ valid: true, userId: "u1", issuedAtMs: 1 }),
    { valid: true, userId: "u1", issuedAtMs: 1 },
  );
  assert.deepEqual(
    validateWebPlatformVerifySessionResponse({ valid: false, reason: "MISMATCH" }),
    { valid: false, reason: "MISMATCH" },
  );
  assertInvalid(() => validateWebPlatformVerifySessionResponse({ valid: true, userId: "u1", issuedAtMs: 1, reason: "MISMATCH" }), "WIRE_KEYS");
  assertInvalid(() => validateWebPlatformVerifySessionResponse({ valid: false, reason: "NOPE" }), "HTTP_VERIFY_REASON");
  assertInvalid(() => validateWebPlatformVerifySessionResponse({ valid: true, userId: "u1", issuedAtMs: Number.POSITIVE_INFINITY }), "WIRE_INTEGER");
  assert.deepEqual(validateWebPlatformRegisterCharacterResponse({ registered: true }), { registered: true });
  assert.deepEqual(validateWebPlatformHasCharacterResponse({ exists: false }), { exists: false });
  assertInvalid(() => validateWebPlatformRegisterCharacterResponse({ registered: true, extra: 1 }), "WIRE_KEYS");
  assertInvalid(() => validateWebPlatformHasCharacterResponse({ exists: "true" }), "HTTP_BOOLEAN");
});
