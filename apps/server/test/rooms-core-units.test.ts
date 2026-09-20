/**
 * MF3-B2 共享层单元测试（docs/MMO.md §5.4 MF3）：五件抽出物各自的契约，不经 GameRoom。
 *  - MessageBudget：1 s 滚动窗口、时钟倒退开新窗、Map 形态的读写口；
 *  - WireDispatcher：固定序（预算 → owner → validate → rateCost → phase → handler）用假 host 逐步观察；
 *  - ReconnectGrace：reconnected / expired / stale 三态（dispose 或代际前移 ⇒ stale）；
 *  - RoomAuth：六步全部经注入依赖，协议整数来自 deps（⛔ 不在类内写死房型常量）；
 *  - S2CPorts：disposed 短路、validator 先于 transport、token 闸。
 * 变异验证：WireDispatcher 把 owner 检查挪到 validate 之后 → 「owner 先于 validate」转红；
 * ReconnectGrace 删 generation 比较 → 「代际前移 ⇒ stale」转红；RoomAuth 用 GAME_ROOM_PROTOCOL_VERSION
 * 代替 deps.protocolVersion → 「协议整数注入」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    CORE_S2C_TOKENS,
    defineS2C,
    ErrorCode,
    GAME_ROOM_PROTOCOL_VERSION,
    GAMEPLAY_CATALOG,
    GamePhase,
    GameplayModeId,
    S2C,
    WireValidationError,
    gameplayS2CTokens,
    type C2SType,
    type GameplayS2CToken,
    type IGameRoomJoinOptions,
    GAME_WIRE_PER_SESSION,
} from "@game/shared";
import { MessageBudget } from "../src/rooms/core/MessageBudget";
import { WireDispatcher, defaultWireRateCost, type WireDispatcherHost } from "../src/rooms/core/WireDispatcher";
import { ReconnectGrace, RECONNECT_GRACE_S } from "../src/rooms/core/ReconnectGrace";
import { RoomAuth, createRoomAuth, type RoomAuthDeps } from "../src/rooms/core/RoomAuth";
import { S2CPorts, assertPerSessionCatalogConsistent, isPerSessionToken } from "../src/rooms/core/S2CPorts";

const rejectsWithCode = (code: number) => (error: unknown): boolean =>
    error instanceof Error && error.message.includes(String(code));

// ── MessageBudget ────────────────────────────────────────────────────────────

test("MessageBudget：1 s 滚动窗口按会话计数，跨窗 / 时钟倒退开新窗，Map 形态读写口", () => {
    let now = 1_000;
    const budget = new MessageBudget(3, () => now);
    assert.deepEqual([budget.consume("a"), budget.consume("a"), budget.consume("a"), budget.consume("a")], [true, true, true, false]);
    assert.equal(budget.consume("b"), true, "另一会话独立计数");
    assert.deepEqual(budget.get("a"), { windowStart: 1_000, count: 4 });
    now = 1_999;
    assert.equal(budget.consume("a"), false, "同一窗口内继续超限");
    now = 2_000;
    assert.equal(budget.consume("a"), true, "满 1 s 开新窗");
    assert.deepEqual(budget.get("a"), { windowStart: 2_000, count: 1 });
    now = 500;
    assert.equal(budget.consume("a"), true, "时钟倒退（注入时钟）按新窗处理，⛔ 不 NaN / 不永久封锁");
    assert.equal(budget.get("a")?.windowStart, 500);
    budget.set("a", { windowStart: 500, count: 2 });
    assert.equal(budget.consume("a"), true);
    assert.equal(budget.consume("a"), false);
    assert.equal(budget.delete("a"), true);
    assert.equal(budget.size, 1);
    budget.clear();
    assert.equal(budget.size, 0);
});

// ── WireDispatcher ───────────────────────────────────────────────────────────

function fakeHost(overrides: Partial<WireDispatcherHost> = {}): { host: WireDispatcherHost; log: string[] } {
    const log: string[] = [];
    const host: WireDispatcherHost = {
        isDisposed: () => false,
        requireModeId: () => GameplayModeId.BallMove,
        rateCostOf: defaultWireRateCost,
        currentPhase: () => GamePhase.Playing,
        corePhaseAllows: (type, phase) => { log.push(`phase:${type}:${phase}`); return type === C2S.Ping; },
        sendError: (_client, code) => { log.push(`error:${code}`); },
        handleCore: (_client, type) => { log.push(`core:${type}`); },
        handleMode: (_client, type, payload) => { log.push(`mode:${type}:${JSON.stringify(payload)}`); },
        ...overrides,
    };
    return { host, log };
}
const client = { sessionId: "s1" } as never;

test("WireDispatcher：固定序 预算 → owner → validate → rateCost → phase → handler", () => {
    const { host, log } = fakeHost({ rateCostOf: (type) => (type === C2S.Move ? 2 : 1) });
    const dispatcher = new WireDispatcher(host, { limitPerSecond: 4, now: () => 0 });
    // owner 先于 validate：他 mode 消息不触碰 payload
    let touched = 0;
    dispatcher.dispatch(client, C2S.IdlePulse, new Proxy({}, { get() { touched++; return undefined; }, ownKeys() { touched++; return []; } }));
    assert.equal(touched, 0);
    assert.deepEqual(log, [`error:${ErrorCode.BadRequest}`]);
    assert.equal(dispatcher.budget.get("s1")?.count, 1, "owner 拒绝仍计 1 份基础预算");
    // validate 先于 rateCost：坏 payload 只扣 1
    log.length = 0;
    dispatcher.dispatch(client, C2S.Move, { dirX: 2, dirY: 0 });
    assert.deepEqual(log, [`error:${ErrorCode.BadRequest}`]);
    assert.equal(dispatcher.budget.get("s1")?.count, 2);
    // rateCost 先于 phase → handler：合法 Move 扣 2，交 mode
    log.length = 0;
    dispatcher.dispatch(client, C2S.Move, { dirX: 1, dirY: 0 });
    assert.deepEqual(log, [`mode:${C2S.Move}:{"dirX":1,"dirY":0}`]);
    assert.equal(dispatcher.budget.get("s1")?.count, 4);
    // 预算耗尽：连 type 判定都不做
    log.length = 0;
    dispatcher.dispatch(client, C2S.Ping, { clientTime: 1 });
    assert.deepEqual(log, [`error:${ErrorCode.BadRequest}`]);
});

test("WireDispatcher：core 消息走注入的 phase 谓词；disposed 短路；未选定 mode fail-fast", () => {
    const { host, log } = fakeHost();
    const dispatcher = new WireDispatcher(host, { limitPerSecond: 60, now: () => 0 });
    dispatcher.dispatch(client, C2S.Ping, { clientTime: 1 });
    dispatcher.dispatch(client, C2S.Chat, { text: "x" });
    assert.deepEqual(log, [`phase:${C2S.Ping}:${GamePhase.Playing}`, `core:${C2S.Ping}`, `phase:${C2S.Chat}:${GamePhase.Playing}`, `error:${ErrorCode.BadRequest}`]);
    const disposed = fakeHost({ isDisposed: () => true });
    new WireDispatcher(disposed.host, { limitPerSecond: 60, now: () => 0 }).dispatch(client, C2S.Ping, { clientTime: 1 });
    assert.deepEqual(disposed.log, [], "disposed 房间不计费不回错");
    const noMode = fakeHost({ requireModeId: () => { throw new Error("no mode"); } });
    assert.throws(() => new WireDispatcher(noMode.host, { limitPerSecond: 60, now: () => 0 }).dispatch(client, C2S.Ping, {}), /no mode/u);
});

// ── ReconnectGrace ───────────────────────────────────────────────────────────

test("ReconnectGrace：reconnected / expired / stale 三态；代际前移或 dispose ⇒ stale", async () => {
    let generation = 0;
    let disposed = false;
    let seconds = 0;
    let settle!: { resolve(): void; reject(e: Error): void };
    const grace = new ReconnectGrace({
        allowReconnection: (_client, s) => { seconds = s; return new Promise<void>((resolve, reject) => { settle = { resolve, reject }; }); },
        generation: () => generation,
        isDisposed: () => disposed,
    });
    let pending = grace.await(client);
    settle.resolve();
    assert.equal(await pending, "reconnected");
    assert.equal(seconds, RECONNECT_GRACE_S);
    pending = grace.await(client);
    settle.reject(new Error("expired"));
    assert.equal(await pending, "expired");
    pending = grace.await(client);
    generation += 1;
    settle.resolve();
    assert.equal(await pending, "stale", "await 期间代际前移 ⇒ 重连成功也是 stale");
    pending = grace.await(client);
    disposed = true;
    settle.reject(new Error("expired"));
    assert.equal(await pending, "stale", "dispose 后到期同样 stale");
});

// ── RoomAuth ─────────────────────────────────────────────────────────────────

function authDeps(overrides: Partial<RoomAuthDeps> = {}): RoomAuthDeps & { verified: Array<[string, number]> } {
    const verified: Array<[string, number]> = [];
    return {
        protocolVersion: 42,
        modeRegistered: (mode) => mode === GameplayModeId.BallMove,
        catalogModeVersion: (mode) => (mode === GameplayModeId.BallMove ? GAMEPLAY_CATALOG.ballMove.modeVersion : null),
        modeDeclaresProfile: (_mode, profile) => profile === "default",
        verifySession: async (token, sId) => { verified.push([token, sId]); return `uid-of-${token}`; },
        verified,
        ...overrides,
    };
}
const envelope = (v: number): IGameRoomJoinOptions => ({
    v, sId: 3, mode: GameplayModeId.BallMove, modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion, profile: "default",
});

test("RoomAuth：协议整数只来自注入 deps（42 通过、GAME_ROOM_PROTOCOL_VERSION 被拒），六步全经依赖", async () => {
    const deps = authDeps();
    const auth: RoomAuth = createRoomAuth(deps);
    assert.notEqual(GAME_ROOM_PROTOCOL_VERSION, 42, "本用例依赖两者不同");
    await assert.rejects(auth.authenticate("tok", envelope(GAME_ROOM_PROTOCOL_VERSION)), rejectsWithCode(ErrorCode.ProtocolMismatch));
    assert.throws(() => auth.assertEnvelope(envelope(GAME_ROOM_PROTOCOL_VERSION)), rejectsWithCode(ErrorCode.ProtocolMismatch));
    const result = await auth.authenticate("tok", envelope(42));
    assert.deepEqual(result, { userId: "uid-of-tok", sId: 3, mode: GameplayModeId.BallMove, profile: "default" });
    assert.deepEqual(deps.verified, [["tok", 3]]);
    await assert.rejects(auth.authenticate("tok", { ...envelope(42), mode: GameplayModeId.Idle }), rejectsWithCode(ErrorCode.BadRequest));
    await assert.rejects(auth.authenticate("tok", { ...envelope(42), modeVersion: 999 }), rejectsWithCode(ErrorCode.ProtocolMismatch));
    await assert.rejects(auth.authenticate("tok", { ...envelope(42), profile: "private" }), rejectsWithCode(ErrorCode.BadRequest));
    await assert.rejects(auth.authenticate("", envelope(42)), rejectsWithCode(ErrorCode.TokenExpired));
    await assert.rejects(auth.authenticate("tok", { ...envelope(42), token: "other" }), rejectsWithCode(ErrorCode.TokenExpired));
    assert.equal(deps.verified.length, 1, "任何一步失败都不得再打 verify");
    const failing = createRoomAuth(authDeps({ verifySession: async () => { throw new Error("boom"); } }));
    await assert.rejects(failing.authenticate("tok", envelope(42)), (error: unknown) => error instanceof Error && error.message === "INTERNAL");
});

// ── S2CPorts ─────────────────────────────────────────────────────────────────

test("S2CPorts：disposed 短路、validator 先于 transport、token 闸按注入的 modeId 判 owner", () => {
    let disposed = false;
    const broadcasts: Array<[string, unknown]> = [];
    const ports = new S2CPorts({ isDisposed: () => disposed, modeId: () => GameplayModeId.BallMove, broadcast: (t, w) => { broadcasts.push([t, w]); } });
    const sent: Array<[string, unknown]> = [];
    const fake = { send: (t: string, p: unknown) => { sent.push([t, p]); } };
    ports.send(fake, S2C.Pong, { clientTime: 1, serverTime: 2 });
    assert.deepEqual(sent, [[S2C.Pong, { clientTime: 1, serverTime: 2 }]]);
    assert.throws(() => ports.send(fake, S2C.Pong, { clientTime: 1 }), (e: unknown) => e instanceof WireValidationError);
    ports.sendError(fake, ErrorCode.BadRequest);
    assert.equal(sent.length, 2);
    assert.equal((sent[1][1] as { code: number }).code, ErrorCode.BadRequest);
    ports.send(undefined, S2C.Pong, { clientTime: 1, serverTime: 2 }); // 无 client 也不 throw
    ports.send({ send() { throw new Error("closing"); } }, S2C.Pong, { clientTime: 1, serverTime: 2 }); // 将死连接吞掉
    const own = gameplayS2CTokens.ballMove["s2c.skillResult"];
    ports.broadcastToken(own, { casterId: "a", skillId: 1, damage: 1 });
    assert.deepEqual(broadcasts, [["s2c.skillResult", { casterId: "a", skillId: 1, damage: 1 }]]);
    const foreign = gameplayS2CTokens.snake["s2c.snake.runFinalizing"] as unknown as GameplayS2CToken<unknown>;
    assert.throws(() => ports.sendToken(fake, foreign, {}), /不得发送/u);
    assert.throws(() => ports.sendToken(fake, { type: C2S.Move, dir: "c2s", validate: (x: unknown) => x } as never, {}), /s2c wire token/u);
    ports.sendToken(fake, CORE_S2C_TOKENS.Pong, { clientTime: 3, serverTime: 4 });
    assert.equal(sent.length, 3);
    disposed = true;
    ports.send(fake, S2C.Pong, { clientTime: 1 } as never); // disposed：连 validate 都不跑
    ports.broadcast(S2C.Chat, {} as never);
    assert.equal(sent.length, 3);
    assert.equal(broadcasts.length, 1);
    const _type: C2SType = C2S.Ping; void _type;
});

// ── MMO MF5a-B3：perSession token 的广播闸（docs/MMO.md §5.4 MF5a；变异：删 broadcastToken 的 perSession 判定 → 本例转红）──

test("S2CPorts：perSession token 广播 fail-closed（发送期，先于 owner 闸）；按会话 sendToken 照常；生成表 ⇄ 运行时 token 启动期一致", () => {
    const broadcasts: Array<[string, unknown]> = [];
    const ports = new S2CPorts({ isDisposed: () => false, modeId: () => GameplayModeId.BallMove, broadcast: (t, w) => { broadcasts.push([t, w]); } });
    const identity = (input: unknown): Record<string, unknown> => input as Record<string, unknown>;
    const enter = defineS2C("s2c.fx.enter", identity, { perSession: true });
    assert.equal(isPerSessionToken(enter as GameplayS2CToken<unknown>), true);
    assert.throws(() => ports.broadcastToken(enter, { id: "a" }), /perSession token，⛔ 不得广播/u);
    assert.deepEqual(broadcasts, [], "被拒的广播 ⛔ 不进扇出");
    // 全房 token 不受影响（owner 闸照旧）
    const own = gameplayS2CTokens.ballMove["s2c.skillResult"];
    assert.equal(isPerSessionToken(own as unknown as GameplayS2CToken<unknown>), false);
    ports.broadcastToken(own, { casterId: "a", skillId: 1, damage: 1 });
    assert.equal(broadcasts.length, 1);

    // 启动期断言：生成表与运行时 token 逐条一致才放行
    assert.doesNotThrow(() => assertPerSessionCatalogConsistent());
    const plain = defineS2C("s2c.fx.plain", identity) as unknown as GameplayS2CToken<unknown>;
    const update = defineS2C("s2c.fx.update", identity, { perSession: true, coalesceKey: "id" }) as unknown as GameplayS2CToken<unknown>;
    // 合成表：第三参给空 core 表（真仓的 core 表在上面的缺省断言里）
    assert.doesNotThrow(() => assertPerSessionCatalogConsistent({ "s2c.fx.update": "id" }, { fx: { "s2c.fx.plain": plain, "s2c.fx.update": update } }, {}));
    assert.throws(() => assertPerSessionCatalogConsistent({}, { fx: { "s2c.fx.update": update } }, {}), /s2c\.fx\.update 不一致/u, "token 声明 perSession 但表缺席");
    assert.throws(() => assertPerSessionCatalogConsistent({ "s2c.fx.plain": null }, { fx: { "s2c.fx.plain": plain } }, {}), /不一致/u, "表列了、token 没声明");
    assert.throws(() => assertPerSessionCatalogConsistent({ "s2c.fx.update": null }, { fx: { "s2c.fx.update": update } }, {}), /不一致/u, "coalesceKey 不同");
    assert.throws(() => assertPerSessionCatalogConsistent({ "s2c.fx.ghost": null }, { fx: {} }, {}), /运行时不存在的 token/u);
    // MMO MF6b：core 表的 perSession token（s2c.world.chat）同受本断言——表里漏掉它 ⇒ 启动期红
    const withoutCore = Object.fromEntries(Object.entries(GAME_WIRE_PER_SESSION).filter(([type]) => type !== "s2c.world.chat"));
    assert.throws(() => assertPerSessionCatalogConsistent(withoutCore), /core 的 s2c\.world\.chat 不一致/u, "core perSession token 缺席生成表");
});
