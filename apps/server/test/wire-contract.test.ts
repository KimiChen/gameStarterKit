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
  CORE_C2S,
  CORE_S2C,
  EFFECT_RESERVED_FIELDS,
  EFFECT_MAX_VALUE_BYTES,
  GAMEPLAY_CATALOG,
  GAME_WIRE_OWNERS,
  gameplayC2STokens,
  gameplayS2CTokens,
  GameHttpContractMap,
  GamePhase,
  GameplayModeId,
  LobbyPush,
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
  // §4.8 拆分：/version 同时报告两类协议身份；旧单一 protocol 字段已删除，携带即拒。
  assert.deepEqual(
    GameHttpContractMap.Version.response({ name: "demo-server", gameRoomProtocol: 7, lobbyProtocol: 7 }),
    { name: "demo-server", gameRoomProtocol: 7, lobbyProtocol: 7 },
  );
  assertInvalid(() => GameHttpContractMap.Version.response({ name: "demo-server", protocol: 7 }), "WIRE_KEYS");
  assertInvalid(() => GameHttpContractMap.Version.response({ name: "demo-server", gameRoomProtocol: 7 }), "WIRE_KEYS");
  assertInvalid(
    () => GameHttpContractMap.Version.response({ name: "demo-server", gameRoomProtocol: Number.NaN, lobbyProtocol: 7 }),
    "WIRE_INTEGER",
  );
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
  // v8 必填切换（§4.4）：modeVersion/profile 缺一即拒；access/modeData 条件展开、原样保序。
  assert.deepEqual(
    validateGameRoomJoinOptions({ v: 8, token: "t", sId: 1, mode: GameplayModeId.Idle, modeVersion: 3, profile: "default" }),
    { v: 8, token: "t", sId: 1, mode: GameplayModeId.Idle, modeVersion: 3, profile: "default" },
  );
  assert.deepEqual(
    validateGameRoomJoinOptions({
      v: 8, mode: GameplayModeId.Idle, modeVersion: 3, profile: "private",
      access: { kind: "join", ticket: "TICKETTICKETTICKET_00001" }, modeData: { lane: 2 },
    }),
    {
      v: 8, mode: GameplayModeId.Idle, modeVersion: 3, profile: "private",
      access: { kind: "join", ticket: "TICKETTICKETTICKET_00001" }, modeData: { lane: 2 },
    },
  );
  assertInvalid(() => validateGameRoomJoinOptions({ v: 8 }), "WIRE_KEYS");
  assertInvalid(
    () => validateGameRoomJoinOptions({ v: 8, mode: GameplayModeId.Idle, profile: "default" }),
    "WIRE_KEYS",
  );
  assertInvalid(
    () => validateGameRoomJoinOptions({ v: 8, mode: GameplayModeId.Idle, modeVersion: 3 }),
    "WIRE_KEYS",
  );
  assertInvalid(
    () => validateGameRoomJoinOptions({ v: 8, mode: GameplayModeId.Idle, modeVersion: 0, profile: "default" }),
    "WIRE_INTEGER",
  );
  assertInvalid(
    () => validateGameRoomJoinOptions({ v: 8, mode: GameplayModeId.Idle, modeVersion: 3, profile: " p " }),
    "ROOM_PROFILE",
  );
  assertInvalid(() => validateGameRoomJoinOptions({ mode: "", modeVersion: 3, profile: "default" }), "WIRE_STRING");
  assertInvalid(() => validateGameRoomJoinOptions({ mode: " idle ", modeVersion: 3, profile: "default" }), "ROOM_MODE");
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
  assert.deepEqual(validateC2SPayload(C2S.IdlePulse, {}), {});
  assertInvalid(() => validateC2SPayload(C2S.IdlePulse, { count: 1 }), "WIRE_KEYS");
  assertInvalid(() => validateC2SPayload(C2S.Move, { dirX: 0, dirY: 0, extra: 1 }), "WIRE_KEYS");
  assertInvalid(() => validateC2SPayload(C2S.Move, { dirX: Number.NaN, dirY: 0 }), "WIRE_NUMBER");
  assertInvalid(() => validateC2SPayload(C2S.Chat, { text: "   " }), "MESSAGE_TEXT");
  assertInvalid(() => validateC2SPayload("c2s.unknown" as never, {}), "MESSAGE_TYPE");
  assert.deepEqual(validateS2CPayload(S2C.Welcome, { sessionId: "s1", tickRate: 20, motd: "ok" }), { sessionId: "s1", tickRate: 20, motd: "ok" });
  assertInvalid(() => validateS2CPayload(S2C.Pong, { clientTime: 1, serverTime: 2, extra: 0 }), "WIRE_KEYS");
  assertInvalid(() => validateS2CPayload(S2C.Error, { code: 1, message: "x", extra: true }), "WIRE_KEYS");
  assertInvalid(() => validateS2CPayload("s2c.unknown" as never, {}), "MESSAGE_TYPE");
  // 全集来源变了：阶段 2b 起消息名由生成的 wire catalog 聚合（core + 各玩法 wire token），
  // validator 表必须与聚合常量精确同集，且 owner 表覆盖每一条消息。
  assert.deepEqual(Object.keys(C2S_RUNTIME_VALIDATORS).sort(), [...Object.values(C2S)].sort());
  assert.deepEqual(Object.keys(S2C_RUNTIME_VALIDATORS).sort(), [...Object.values(S2C)].sort());
  assert.deepEqual(
    Object.keys(GAME_WIRE_OWNERS).sort(),
    [...Object.values(C2S), ...Object.values(S2C)].sort(),
  );
});

test("wire catalog 闭合：validator 表 ≡ core 表 ∪ 各玩法 token 表，且 owner 双向一致", () => {
  // ⚠ 这里刻意**不**写 `length === 11 / 16` 这类随玩法数增长的魔数：每加一个玩法都要回来
  // 改数字，改错了也只是数字对不上，说不出是哪条消息漏了。判别力意图不变——
  //   · 绕过 wire catalog 直接往 validator 表塞消息（无 owner / 不属任何 token 表）→ 必红；
  //   · 声明了 owner 却没进 validator 表（token 表有、validator 表无）→ 必红。
  // 左右两侧来自**不同投影**，⛔ 不是同义反复：
  //   左 = CORE_C2S/CORE_S2C（手写单源 protocol/messages.ts）∪ gameplay*Tokens（每玩法 wire.ts）
  //   右 = C2S/S2C_RUNTIME_VALIDATORS（生成的 validator 字面量块）
  const modes = Object.keys(GAMEPLAY_CATALOG).sort();
  const owners = GAME_WIRE_OWNERS as Readonly<Record<string, string>>;

  for (const [direction, coreTable, tokenTable, validators] of [
    ["c2s", CORE_C2S, gameplayC2STokens, C2S_RUNTIME_VALIDATORS],
    ["s2c", CORE_S2C, gameplayS2CTokens, S2C_RUNTIME_VALIDATORS],
  ] as const) {
    const tokens = tokenTable as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    // token 表的 mode 键必须就是 catalog 的玩法集——否则「Σ 各玩法」会静默漏掉一个玩法，
    // 那条玩法的消息就能既不在左侧、也不被下面的并集断言察觉。
    assert.deepEqual(Object.keys(tokens).sort(), modes, `${direction}: token table modes must equal catalog modes`);

    const coreKeys = [...Object.values(coreTable)] as string[];
    const gameplayKeys = modes.flatMap((mode) => Object.keys(tokens[mode]!));
    const expected = [...coreKeys, ...gameplayKeys];
    // 并集内不得有重名（core 与玩法、或两个玩法撞名会让「和 === 总数」虚假成立）。
    assert.equal(new Set(expected).size, expected.length, `${direction}: duplicate message name across owners`);

    const actual = Object.keys(validators);
    // 恰好等于：无遗漏（token 表有而 validator 表无）、无孤儿（validator 表有而无人声明）。
    assert.deepEqual(expected.slice().sort(), actual.slice().sort(), `${direction}: validator set must equal core ∪ gameplay tokens`);
    // 数量以「core 条数 + Σ 各玩法条数 === validator 键数」表达，与玩法数无关。
    assert.equal(
      coreKeys.length + modes.reduce((sum, mode) => sum + Object.keys(tokens[mode]!).length, 0),
      actual.length,
      `${direction}: core + Σ gameplay counts must equal validator count`,
    );

    for (const key of actual) {
      const owner = owners[key];
      // 每条 validator 都要有 owner，且 owner ∈ {"core"} ∪ catalog。
      assert.ok(owner !== undefined, `${direction}: ${key} has no owner in GAME_WIRE_OWNERS`);
      assert.ok(owner === "core" || modes.includes(owner), `${direction}: ${key} has unknown owner ${owner}`);
      // 双向一致：owner 说 core 就必须在 core 表里，说某玩法就必须在该玩法 token 表里。
      // 单看「有 owner」不够——owner 写错玩法仍会被这条抓住。
      const declaredBy = owner === "core" ? coreKeys : Object.keys(tokens[owner]!);
      assert.ok(declaredBy.includes(key), `${direction}: ${key} claims owner ${owner} but that source does not declare it`);
    }
  }
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

test("setField：角色登记 marker 与复核时间戳永久保留", () => {
  for (const field of ["characterRegistration", "characterRegistrationCheckedAt"] as const) {
    assert.ok(EFFECT_RESERVED_FIELDS.includes(field), `${field} 必须属于 shared reserved 集合`);
    assertInvalid(
      () => validateGrant({ kind: "setField", field, value: "client-controlled" }),
      "EFFECT_RESERVED_FIELD",
    );
  }
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
    () => validateGameRoomJoinOptions(
      getter({ mode: GameplayModeId.BallMove, modeVersion: 3, profile: "default" }, "mode"),
    ),
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

// Lobby 路由的 request/response 向量已迁入 feature-owned sidecar
// （test/lobbyRpcVectors/<域>.ts），正反向断言见 lobby-rpc-vectors.test.ts。

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
