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
  EFFECT_MAX_VALUE_BYTES,
  GameHttpContractMap,
  GamePhase,
  GameplayModeId,
  LobbyPush,
  LOBBY_RPC_REQUEST_VALIDATORS,
  LOBBY_RPC_RESPONSE_VALIDATORS,
  S2C,
  S2C_RUNTIME_VALIDATORS,
  WebPlatformHttpContractMap,
  validateC2SPayload,
  validateGameRoomState,
  validateHttpOrigin,
  validateLobbyPush,
  validateLobbyRpcRequest,
  validateLobbyRpcResponse,
  validateLobbyRoomJoinOptions,
  validateGameRoomJoinOptions,
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
  hasExactKeys,
  isPlainRecord,
  normalizeEffect,
  utf8ByteLength,
  validateEffect,
  validateGrant,
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

test("HTTP/WS origin：拒绝非 canonical 空白、非法 DNS label 与多重尾斜杠", () => {
  assert.equal(validateHttpOrigin("https://example.test"), "https://example.test");
  assert.equal(validateHttpOrigin("https://example.test/"), "https://example.test/");
  assertInvalid(() => validateHttpOrigin(" https://example.test "), "WIRE_URL");
  assertInvalid(() => validateHttpOrigin("https://-evil.example"), "WIRE_URL_HOST");
  assertInvalid(() => validateHttpOrigin("https://foo.-bar.example"), "WIRE_URL_HOST");
  assertInvalid(() => validateHttpOrigin("https://example.test//"), "WIRE_URL_PATH");
});

test("join/RPC envelope：exact keys、有限数值和错误码联合严格收口", () => {
  assert.deepEqual(validateLobbyRoomJoinOptions({ v: 5, token: "t", sId: 1 }), { v: 5, token: "t", sId: 1 });
  assertInvalid(() => validateLobbyRoomJoinOptions({ v: 5, mode: GameplayModeId.Idle }), "WIRE_KEYS");
  assert.deepEqual(
    validateGameRoomJoinOptions({ v: 5, token: "t", sId: 1, mode: GameplayModeId.Idle }),
    { v: 5, token: "t", sId: 1, mode: GameplayModeId.Idle },
  );
  assertInvalid(() => validateGameRoomJoinOptions({ v: 5 }), "WIRE_KEYS");
  assertInvalid(() => validateGameRoomJoinOptions({ mode: "" }), "WIRE_STRING");
  assertInvalid(() => validateGameRoomJoinOptions({ mode: " idle " }), "ROOM_MODE");
  assertInvalid(() => validateRoomJoinOptions({ sId: Number.POSITIVE_INFINITY }), "WIRE_INTEGER");
  assertInvalid(() => validateRoomJoinOptions({ sId: 1, listHash: "h" }), "WIRE_KEYS");

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

test("wire helpers：revoked/throwing Proxy 按非法 shape 处理，不泄漏原生 Proxy 异常", () => {
  const revoked = Proxy.revocable({}, {});
  const hostileRevoked = revoked.proxy;
  revoked.revoke();
  assert.equal(isPlainRecord(hostileRevoked), false);
  assert.equal(hasExactKeys(hostileRevoked as never, [], []), false);
  assertInvalid(() => validateRpcEnvelope(hostileRevoked), "RPC_OBJECT");

  const throwingPrototype = new Proxy({}, {
    getPrototypeOf() { throw new Error("hostile prototype"); },
  });
  assert.equal(isPlainRecord(throwingPrototype), false);
  // `hasExactKeys` assumes its caller already established record-ness; the
  // public assertion helper combines both checks and fails closed.
  assert.equal(hasExactKeys(throwingPrototype as never, [], []), true);
  assertInvalid(() => validateRpcEnvelope(throwingPrototype), "RPC_OBJECT");

  const throwingKeys = new Proxy({}, {
    ownKeys() { throw new Error("hostile keys"); },
  });
  // The prototype check succeeds, but exact-key enumeration still fails closed.
  assert.equal(isPlainRecord(throwingKeys), true);
  assert.equal(hasExactKeys(throwingKeys as never, [], []), false);
  assertInvalid(() => validateRpcEnvelope(throwingKeys), "WIRE_KEYS");

  const symbolKey = Symbol("hidden");
  const withSymbol = { id: "r1", type: "user.getInfo", payload: {} } as Record<PropertyKey, unknown>;
  withSymbol[symbolKey] = true;
  assert.equal(hasExactKeys(withSymbol as never, ["id", "type", "payload"]), false);

  const throwingGrant = new Proxy({ kind: "item", itemId: 1, count: 1 }, {
    get(_target, property) {
      if (property === "kind") throw new Error("hostile getter");
      return Reflect.get(_target, property);
    },
  });
  assertInvalid(() => validateGrant(throwingGrant), "EFFECT_DATA_CORRUPT");
  const throwingEffect = new Proxy({ schemaVersion: 1, grants: [] }, {
    get(_target, property) {
      if (property === "grants") throw new Error("hostile getter");
      return Reflect.get(_target, property);
    },
  });
  assertInvalid(() => validateEffect(throwingEffect), "EFFECT_DATA_CORRUPT");

  const throwingAreaHash = new Proxy({
    hash: "h",
    isOps: false,
    myServerIds: [],
    servers: [],
  }, {
    get(target, property, receiver) {
      if (property === "hash") throw new Error("hostile hash getter");
      return Reflect.get(target, property, receiver);
    },
  });
  assertInvalid(() => validateWebPlatformAreaListResponse(throwingAreaHash), "WIRE_DATA_CORRUPT");

  const thrown = Proxy.revocable({}, {});
  const revokedError = thrown.proxy;
  thrown.revoke();
  const throwingRevoked = new Proxy({
    hash: "h",
    isOps: false,
    myServerIds: [],
    servers: [],
  }, {
    get(target, property, receiver) {
      if (property === "hash") throw revokedError;
      return Reflect.get(target, property, receiver);
    },
  });
  assertInvalid(() => validateWebPlatformAreaListResponse(throwingRevoked), "WIRE_DATA_CORRUPT");
});

test("setField：按字段值域拒绝数字垃圾、越界值和非规范开关", () => {
  assert.deepEqual(validateGrant({ kind: "setField", field: "star", value: "42" }), {
    kind: "setField", field: "star", value: "42",
  });
  assert.deepEqual(validateGrant({ kind: "setField", field: "musicOn", value: "0" }), {
    kind: "setField", field: "musicOn", value: "0",
  });
  assertInvalid(() => validateGrant({ kind: "setField", field: "star", value: "1e3" }), "EFFECT_VALUE");
  assertInvalid(() => validateGrant({ kind: "setField", field: "star", value: "-1" }), "EFFECT_VALUE");
  assertInvalid(() => validateGrant({ kind: "setField", field: "avatarId", value: "1000" }), "EFFECT_VALUE");
  assertInvalid(() => validateGrant({ kind: "setField", field: "musicOn", value: "true" }), "EFFECT_VALUE");
  assertInvalid(() => validateGrant({ kind: "setField", field: "guildId", value: "9007199254740992" }), "EFFECT_VALUE");
  assertInvalid(() => validateGrant({ kind: "setField", field: "nickname", value: "x".repeat(129) }), "EFFECT_VALUE");
});

test("setField：文本上限统一按 UTF-8 字节，含信封级上限和代理字符", () => {
  const nicknameAtLimit = "中".repeat(42); // 126 bytes <= nickname's 128-byte rule
  const nicknameOverLimit = "中".repeat(43); // 129 bytes > nickname's 128-byte rule
  const provinceAtLimit = "中".repeat(21); // 63 bytes <= province's 64-byte rule
  const provinceOverLimit = "中".repeat(22); // 66 bytes > province's 64-byte rule
  const emojiAtLimit = "🙂".repeat(32); // 128 bytes, despite 64 UTF-16 code units
  const drainAtLimit = "中".repeat(341); // 1023 bytes <= the shared value ceiling
  const drainOverLimit = "中".repeat(342); // 1026 bytes > the shared value ceiling

  assert.equal(utf8ByteLength(nicknameAtLimit), 126);
  assert.equal(utf8ByteLength(emojiAtLimit), 128);
  assert.equal(utf8ByteLength(drainAtLimit), 1023);
  assert.equal(EFFECT_MAX_VALUE_BYTES, 1024);
  assert.deepEqual(validateGrant({ kind: "setField", field: "nickname", value: nicknameAtLimit }), {
    kind: "setField", field: "nickname", value: nicknameAtLimit,
  });
  assert.deepEqual(validateGrant({ kind: "setField", field: "province", value: provinceAtLimit }), {
    kind: "setField", field: "province", value: provinceAtLimit,
  });
  assert.deepEqual(validateGrant({ kind: "setField", field: "nickname", value: emojiAtLimit }), {
    kind: "setField", field: "nickname", value: emojiAtLimit,
  });
  assert.deepEqual(validateGrant({ kind: "setField", field: "drainProbe", value: drainAtLimit }), {
    kind: "setField", field: "drainProbe", value: drainAtLimit,
  });
  assertInvalid(() => validateGrant({ kind: "setField", field: "nickname", value: nicknameOverLimit }), "EFFECT_VALUE");
  assertInvalid(() => validateGrant({ kind: "setField", field: "province", value: provinceOverLimit }), "EFFECT_VALUE");
  assertInvalid(() => validateGrant({ kind: "setField", field: "drainProbe", value: drainOverLimit }), "EFFECT_VALUE");

  // Redis cjson rejects lone UTF-16 surrogates; reject them before a durable intent
  // can be written so the shared and Lua boundaries fail closed consistently.
  const loneSurrogate = String.fromCharCode(0xd800);
  assertInvalid(() => validateGrant({ kind: "setField", field: "nickname", value: loneSurrogate }), "EFFECT_VALUE");
});

test("所有公开 wire validator：hostile getter/iterator 统一转为可判别错误", () => {
  const getter = (value: Record<string, unknown>, key: string): Record<string, unknown> =>
    new Proxy(value, { get(target, property, receiver) {
      if (property === key) throw new Error(`hostile ${key}`);
      return Reflect.get(target, property, receiver);
    } });

  assertInvalid(() => validateRoomJoinOptions(getter({ token: "t" }, "token")), "WIRE_DATA_CORRUPT");
  assertInvalid(
    () => validateGameRoomJoinOptions(getter({ mode: GameplayModeId.BallMove }, "mode")),
    "WIRE_DATA_CORRUPT",
  );
  assertInvalid(() => validateC2SPayload(C2S.Move, getter({ dirX: 0, dirY: 0 }, "dirX")), "WIRE_DATA_CORRUPT");
  assertInvalid(() => validateS2CPayload(S2C.Pong, getter({ clientTime: 1, serverTime: 2 }, "serverTime")), "WIRE_DATA_CORRUPT");
  assertInvalid(() => validateRpcEnvelope(getter({ id: "r1", type: "user.getInfo" }, "id")), "WIRE_DATA_CORRUPT");
  assertInvalid(() => validateRpcReply(getter({ id: "r1", ok: true, data: {} }, "data")), "WIRE_DATA_CORRUPT");
  assertInvalid(() => validateLobbyPush(getter({ type: LobbyPush.MailNew, data: { mailId: 1 } }, "data")), "WIRE_DATA_CORRUPT");
  assertInvalid(() => validateGameRoomState(getter({ tick: 0, phase: GamePhase.Waiting, matchId: "", players: {} }, "players")), "WIRE_DATA_CORRUPT");
  assertInvalid(() => validateLobbyRpcRequest("user.getProfile", getter({ uid: "u1" }, "uid")), "WIRE_DATA_CORRUPT");
  assertInvalid(() => validateLobbyRpcResponse("mail.list", getter({ mails: [] }, "mails")), "WIRE_DATA_CORRUPT");

  const revokedList = Proxy.revocable([], {});
  revokedList.revoke();
  assertInvalid(() => validateLobbyRpcResponse("mail.list", { mails: revokedList.proxy }), "WIRE_DATA_CORRUPT");

  const throwingEntries = {
    entries() { throw new Error("hostile iterator"); },
  };
  assertInvalid(() => validateGameRoomState({
    tick: 0, phase: GamePhase.Waiting, matchId: "", players: throwingEntries,
  }), "STATE_PLAYERS");

  const revokedEffectArray = Proxy.revocable([], {});
  revokedEffectArray.revoke();
  assertInvalid(() => normalizeEffect(revokedEffectArray.proxy), "EFFECT_DATA_CORRUPT");
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
