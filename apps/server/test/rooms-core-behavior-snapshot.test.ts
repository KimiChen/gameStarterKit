/**
 * MF3-B1 行为等价快照（docs/MMO.md §5.4 MF3；docs/MMO-PLAN.md MF3-B1）：把 MF3-B2 要从 `GameRoom.ts`
 * 抽进 `rooms/core/{RoomAuth,WireDispatcher,MessageBudget,ReconnectGrace,S2CPorts}` 的行为**先钉死**，
 * 抽取提交（B2）必须让本文件与下列既有用例零改动全绿。
 *
 * 覆盖清单（已有覆盖只登记，缺的在本文件补）：
 *  - onAuth 六步固定序：① join options exact 校验（多余键 → BadRequest）② `v` 协议整数
 *    （protocol-version-matrix）③ mode 已登记 / modeVersion / profile（本文件 + version-matrix）
 *    ④ sId 规范化 → WrongServer（本文件）⑤ token 非空且 options.token 逐字相等（game-room / auth-token-contract）
 *    ⑥ session verify（本文件：verify 收到标准 token + 规范化 sId、身份失败 → AUTH_REQUIRED、基础设施失败 → INTERNAL 不谎报）；
 *  - dispatcher 固定序：预算 → owner → exact validate → rateCost → phase → handler
 *    （game-room-dispatch 钉预算先于 type 判定 / owner 唯一拒绝点 / rateCost 追加；本文件补三处相对序：
 *    owner 先于 validate（他 mode 消息的 payload 零触碰）、validate 先于 rateCost（坏 payload 只扣 1）、
 *    rateCost 先于 phase（错相位仍扣满 rateCost））；
 *  - 预算：每会话独立窗口（game-room 1005）、开局 initializeMatchState 清空（本文件）；
 *  - 重连宽限与 generation fence：宽限内保座（drop-in / private-room）、dispose 后迟到 **到期** 不清理
 *    （game-room 927）；本文件补「dispose 后迟到到期 ⛔ 不跑 onPlayerLeaving / onLeave」；
 *  - S2C 出站闸：core 路径先过 shared validator（game-room 157）；本文件补 mode token 闸
 *    （dir ≠ s2c 拒、owner ∉ {core, 当前 mode} 拒、payload 过 token.validate、合法 token 落到 client.send / broadcast）。
 *
 * 变异验证（B2 抽取后仍成立）：dispatcher 里把 owner 检查挪到 exact validate 之后 → 「owner 先于 validate」
 * 转红；rateCost 追加消耗挪到 validate 之前 → 「validate 先于 rateCost」转红；删 S2CPorts 的 owner 比较 →
 * 「他 mode token」转红；删 dispose 后的 generation 短路 → 「迟到到期」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    CORE_S2C_TOKENS,
    ErrorCode,
    GAME_ROOM_PROTOCOL_VERSION,
    GAMEPLAY_CATALOG,
    GamePhase,
    GameplayModeId,
    S2C,
    WireValidationError,
    gameplayC2STokens,
    gameplayS2CTokens,
    type GameplayS2CToken,
    type IGameRoomJoinOptions,
} from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import type { GameMode, GameModeContext } from "../src/rooms/GameMode";
import { createBallMoveGameMode, registerBallMoveGameMode } from "../src/rooms/modes/ballMove/index";
import { AuthRequiredError } from "../src/core/errors";
import { installWebPlatformClientForTests, WebPlatformUnavailableError, type WebPlatformClient } from "../src/platform/webPlatformClient";

registerBallMoveGameMode();

type Sent = Array<[string, unknown]>;
type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string; profile: string };
    sent: Sent;
    send(type: string, payload: unknown): void;
};

const errorsOf = (sent: Sent): number[] => sent
    .filter(([type]) => type === S2C.Error)
    .map(([, payload]) => (payload as { code: number }).code);

function fakeClient(sessionId: string, userId = `u-${sessionId}`): FakeClient {
    return {
        sessionId,
        auth: { userId, sId: 0, mode: GameplayModeId.BallMove, profile: "default" },
        sent: [],
        send(type, payload) { this.sent.push([type, payload]); },
    };
}

function joinOptions(): IGameRoomJoinOptions {
    return {
        v: GAME_ROOM_PROTOCOL_VERSION,
        sId: 0,
        mode: GameplayModeId.BallMove,
        modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
        profile: "default",
    };
}

function dispatch(room: GameRoom, type: unknown, client: unknown, payload: unknown): void {
    (room.messages as unknown as { _: (c: unknown, t: unknown, p: unknown) => void })._(client, type, payload);
}

function installLock(room: GameRoom): void {
    (room as unknown as { lock: () => Promise<void> }).lock = async () => undefined;
}

const rejectsWithCode = (code: number) => (error: unknown): boolean =>
    error instanceof Error && error.message.includes(String(code));

/** ballMove 房 + 可观察的 commands 表；clock 恒 0 ⇒ 预算窗口不滚动。 */
function probeRoom(): { room: GameRoom; sender: FakeClient; captured: string[] } {
    const captured: string[] = [];
    const commands = {
        [C2S.Move]: () => { captured.push(C2S.Move); },
        [C2S.CastSkill]: () => { captured.push(C2S.CastSkill); },
    };
    const room = new GameRoom({ seed: 1, clock: () => 0, mode: { ...createBallMoveGameMode(), commands } as never });
    return { room, sender: fakeClient("probe"), captured };
}

function budgetOf(room: GameRoom, sessionId: string): number | undefined {
    return (room as unknown as { messageBudget: Map<string, { count: number }> }).messageBudget.get(sessionId)?.count;
}

// ── onAuth 六步 ──────────────────────────────────────────────────────────────

test("onAuth ①：join options 多余键先于一切被 exact 校验拒绝（BadRequest，⛔ 不落到 token 闸）", async () => {
    await assert.rejects(
        GameRoom.onAuth("", { ...joinOptions(), extra: true } as never, undefined as never),
        rejectsWithCode(ErrorCode.BadRequest),
    );
});

test("onAuth ③：未登记 mode 在 token 闸之前即 BadRequest；④：非法 sId 在 token 闸之前即 WrongServer", async () => {
    // token 为空串本应 TokenExpired；先被 mode / sId 闸拒绝 ⇒ 证明这两步排在 token 之前。
    await assert.rejects(
        GameRoom.onAuth("", { ...joinOptions(), mode: "notRegisteredMode" }, undefined as never),
        rejectsWithCode(ErrorCode.BadRequest),
    );
    for (const badSid of [-1, 1.5, 70_000]) {
        await assert.rejects(
            GameRoom.onAuth("", { ...joinOptions(), sId: badSid } as never, undefined as never),
            rejectsWithCode(ErrorCode.WrongServer),
            `sId=${badSid} 必须是 WrongServer`,
        );
    }
});

test("onAuth ⑥：session verify 收到标准 token 与 sId；身份失败 → AUTH_REQUIRED；基础设施失败 → INTERNAL 不谎报", async () => {
    const verified: Array<[string, number]> = [];
    const stub = (verify: WebPlatformClient["verify"]): WebPlatformClient => ({
        verify,
        registerCharacter: async () => undefined,
        hasCharacter: async () => true,
    });
    // ⚠ verifyAndCacheWebPlatformSession 在 verify 成功后会写组 sess 缓存（Redis）；本用例只钉
    //   verify 的**失败**映射与「verify 被调且拿到标准 token + sId」这两件可离线观察的事。
    let restore = installWebPlatformClientForTests(stub(async (token, serverId) => {
        verified.push([token, serverId]);
        throw new AuthRequiredError("token 校验失败(EXPIRED)");
    }));
    try {
        // verify 侧的身份失败经 toErrCode 映射成 RPC 错误码字符串（joinRefusedAuth），⛔ 不是数字业务码。
        await assert.rejects(
            GameRoom.onAuth("standard-token", joinOptions(), undefined as never),
            (error: unknown) => error instanceof Error && error.message === "AUTH_REQUIRED",
        );
    } finally {
        restore();
    }
    assert.deepEqual(verified, [["standard-token", 0]], "verify 必须收到标准 token 与规范化后的 sId");

    restore = installWebPlatformClientForTests(stub(async () => {
        throw new WebPlatformUnavailableError("verify timeout");
    }));
    try {
        await assert.rejects(
            GameRoom.onAuth("standard-token", joinOptions(), undefined as never),
            (error: unknown) => error instanceof Error && error.message === "INTERNAL",
            "WebPlatform 不可达必须保持 INTERNAL，⛔ 不能谎报成 AUTH_REQUIRED / token 过期",
        );
    } finally {
        restore();
    }
});

// ── dispatcher 相对序 ────────────────────────────────────────────────────────

test("dispatcher：owner 闸先于 exact validate——他 mode 消息的 payload 零触碰", () => {
    const { room, sender, captured } = probeRoom();
    room.state.phase = GamePhase.Playing;
    let touched = 0;
    const payload = new Proxy({}, {
        get() { touched += 1; return undefined; },
        has() { touched += 1; return false; },
        ownKeys() { touched += 1; return []; },
        getOwnPropertyDescriptor() { touched += 1; return undefined; },
        getPrototypeOf() { touched += 1; return Object.prototype; },
    });
    dispatch(room, C2S.IdlePulse, sender, payload);
    assert.equal(touched, 0, "owner ∉ {core, 当前 mode} 的消息在 validate 之前就被拒，validator 不得触碰 payload");
    assert.deepEqual(errorsOf(sender.sent), [ErrorCode.BadRequest]);
    assert.deepEqual(captured, []);
    assert.equal(budgetOf(room, sender.sessionId), 1, "被 owner 闸拒绝的消息仍消耗 1 份基础预算");
});

test("dispatcher：exact validate 先于 rateCost 追加消耗——坏 payload 只扣 1 份预算", () => {
    const { room, sender, captured } = probeRoom();
    room.state.phase = GamePhase.Playing;
    (room as unknown as { wireRateCost(type: string): number }).wireRateCost = (type) => (type === C2S.Move ? 3 : 1);
    dispatch(room, C2S.Move, sender, { dirX: Number.NaN, dirY: 0 });
    assert.deepEqual(captured, []);
    assert.deepEqual(errorsOf(sender.sent), [ErrorCode.BadRequest]);
    assert.equal(budgetOf(room, sender.sessionId), 1, "validate 失败的消息不得再追加 rateCost−1 份消耗");
});

test("dispatcher：rateCost 追加消耗先于 phase 闸——错相位的合法 payload 仍扣满 rateCost", () => {
    const { room, sender, captured } = probeRoom();
    assert.equal(room.state.phase, GamePhase.Waiting);
    (room as unknown as { wireRateCost(type: string): number }).wireRateCost = (type) => (type === C2S.Move ? 3 : 1);
    dispatch(room, C2S.Move, sender, { dirX: 1, dirY: 0 });
    assert.deepEqual(captured, [], "Waiting 相位的玩法输入不得到达 commands");
    assert.deepEqual(errorsOf(sender.sent), [ErrorCode.BadRequest]);
    assert.equal(budgetOf(room, sender.sessionId), 3, "phase 拒绝发生在 rateCost 追加消耗之后");
});

test("dispatcher：core 消息的 phase 规则归 shell——Settle 相位 Ping 放行、Chat 拒绝", async () => {
    const { room } = probeRoom();
    installLock(room);
    const a = fakeClient("a");
    const b = fakeClient("b");
    await room.onJoin(a as never, joinOptions());
    await room.onJoin(b as never, joinOptions());
    assert.equal(room.state.phase, GamePhase.Playing);
    room.state.phase = GamePhase.Settle;
    a.sent.length = 0;
    dispatch(room, C2S.Ping, a, { clientTime: 7 });
    assert.equal(a.sent.filter(([type]) => type === S2C.Pong).length, 1, "结算阶段心跳必须活着");
    dispatch(room, C2S.Chat, a, { text: "late" });
    assert.deepEqual(errorsOf(a.sent), [ErrorCode.BadRequest], "结算阶段聊天按 shell 规则拒绝");
});

// ── 预算 ────────────────────────────────────────────────────────────────────

test("预算：开局 initializeMatchState 清空全部会话窗口", async () => {
    const { room } = probeRoom();
    installLock(room);
    const a = fakeClient("a");
    await room.onJoin(a as never, joinOptions());
    dispatch(room, C2S.Ping, a, { clientTime: 1 });
    assert.equal(budgetOf(room, a.sessionId), 1);
    const b = fakeClient("b");
    await room.onJoin(b as never, joinOptions());
    assert.equal(room.state.phase, GamePhase.Playing, "第二人入座即自动开局");
    assert.equal(budgetOf(room, a.sessionId), undefined, "开局必须重置每会话预算窗口");
});

// ── 重连宽限 / generation fence ──────────────────────────────────────────────

test("重连宽限：dispose 后迟到到期 ⛔ 不跑 onPlayerLeaving / onLeave、不动 players", async () => {
    const hooks: string[] = [];
    const base = createBallMoveGameMode();
    const mode: GameMode<any, any> = {
        ...base,
        onPlayerLeaving(context) { hooks.push(`leaving:${context.client.sessionId}`); base.onPlayerLeaving?.(context); },
        onLeave(context) { hooks.push(`leave:${context.client.sessionId}`); },
        onConnectionChanged(context) { hooks.push(`conn:${context.client.sessionId}:${context.connected}`); },
    } as GameMode<any, any>;
    const room = new GameRoom({ seed: 3, clock: () => 0, mode });
    installLock(room);
    const a = fakeClient("a");
    await room.onJoin(a as never, joinOptions());
    let expire!: (reason: Error) => void;
    (room as unknown as { allowReconnection: () => Promise<void> }).allowReconnection = () =>
        new Promise<void>((_, reject) => { expire = reject; });
    const pending = room.onLeave(a as never, 4001);
    await Promise.resolve();
    assert.deepEqual(hooks, ["conn:a:false"], "断线进入宽限只通知 connection-changed");
    await room.onDispose();
    expire(new Error("grace expired"));
    await pending;
    assert.deepEqual(hooks, ["conn:a:false"], "dispose 后迟到的到期不得再跑离场钩子");
    assert.equal(room.state.players!.has("a"), true);
});

test("重连宽限：主动离开（CONSENTED）不进宽限，直接最终离场", async () => {
    const { room } = probeRoom();
    installLock(room);
    let reconnectAsked = 0;
    (room as unknown as { allowReconnection: () => Promise<void> }).allowReconnection = () => {
        reconnectAsked += 1;
        return new Promise<void>(() => undefined);
    };
    const a = fakeClient("a");
    await room.onJoin(a as never, joinOptions());
    await room.onLeave(a as never, 4000);
    assert.equal(reconnectAsked, 0, "CONSENTED 关闭码不得进入 allowReconnection");
    assert.equal(room.state.players!.has("a"), false);
});

// ── S2C 出站 token 闸 ────────────────────────────────────────────────────────

async function captureContext(): Promise<{ room: GameRoom; context: GameModeContext<any> }> {
    let context: GameModeContext<any> | null = null;
    const base = createBallMoveGameMode();
    const mode: GameMode<any, any> = {
        ...base,
        onMatchStart(ctx) { context = ctx; return base.onMatchStart?.(ctx); },
    } as GameMode<any, any>;
    const room = new GameRoom({ seed: 5, clock: () => 0, mode });
    installLock(room);
    await room.onJoin(fakeClient("a") as never, joinOptions());
    await room.onJoin(fakeClient("b") as never, joinOptions());
    assert.ok(context, "开局后 mode 必须拿到 context");
    return { room, context: context! };
}

test("S2C token 闸：dir ≠ s2c、他 mode owner 的 token 一律 throw，⛔ 不出站", async () => {
    const { context } = await captureContext();
    const client = fakeClient("a");
    const c2sToken = gameplayC2STokens.ballMove["c2s.move"] as unknown as GameplayS2CToken<unknown>;
    assert.throws(() => context.sendS2C(client as never, c2sToken, { dirX: 1, dirY: 0 }), /s2c wire token/u);
    const foreign = gameplayS2CTokens.snake["s2c.snake.runFinalizing"] as unknown as GameplayS2CToken<unknown>;
    assert.throws(() => context.sendS2C(client as never, foreign, {}), /不得发送 s2c\.snake\.runFinalizing/u);
    assert.throws(() => context.broadcastS2C(foreign, {}), /不得发送/u);
    assert.deepEqual(client.sent, [], "被闸拒绝的 token 不得到达 client.send");
});

test("S2C token 闸：payload 过 token.validate；合法 core / 本 mode token 落到 client.send 与 room.broadcast", async () => {
    const { room, context } = await captureContext();
    const client = fakeClient("a");
    assert.throws(
        () => context.sendS2C(client as never, CORE_S2C_TOKENS.Pong, { clientTime: 1, serverTime: 2, extra: 1 } as never),
        (error: unknown) => error instanceof WireValidationError,
    );
    assert.deepEqual(client.sent, []);
    context.sendS2C(client as never, CORE_S2C_TOKENS.Pong, { clientTime: 1, serverTime: 2 });
    assert.deepEqual(client.sent, [[S2C.Pong, { clientTime: 1, serverTime: 2 }]]);

    const broadcasted: Sent = [];
    (room as unknown as { broadcast: (type: string, payload: unknown) => void }).broadcast = (type, payload) => {
        broadcasted.push([type, payload]);
    };
    const own = gameplayS2CTokens.ballMove["s2c.skillResult"];
    const result = own.validate({ casterId: "a", skillId: 1, targetId: "b", damage: 1 } as never);
    context.broadcastS2C(own, result);
    assert.equal(broadcasted.length, 1);
    assert.equal(broadcasted[0][0], "s2c.skillResult");
    assert.throws(() => context.broadcastS2C(own, { ...result, damage: Number.NaN } as never),
        (error: unknown) => error instanceof WireValidationError);
    assert.equal(broadcasted.length, 1, "非法 payload 不得进入 room.broadcast");
});

// ── MF3-B2 补钉：重连成功分支的 generation fence（抽取前只有到期分支短路 disposed）────
// 变异验证：ReconnectGrace 删 generation / disposed 比较 → 本用例转红。
test("重连宽限：dispose 后迟到的**重连成功** ⛔ 不跑 connection-changed(true)、不动 state", async () => {
    const hooks: string[] = [];
    const base = createBallMoveGameMode();
    const mode: GameMode<any, any> = {
        ...base,
        onConnectionChanged(context) { hooks.push(`conn:${context.client.sessionId}:${context.connected}`); },
    } as GameMode<any, any>;
    const room = new GameRoom({ seed: 9, clock: () => 0, mode });
    installLock(room);
    const a = fakeClient("a");
    await room.onJoin(a as never, joinOptions());
    let release!: () => void;
    (room as unknown as { allowReconnection: () => Promise<void> }).allowReconnection = () =>
        new Promise<void>((resolve) => { release = resolve; });
    const pending = room.onLeave(a as never, 4001);
    await Promise.resolve();
    await room.onDispose();
    release();
    await pending;
    assert.deepEqual(hooks, ["conn:a:false"], "dispose 后迟到的重连成功不得再通知 mode");
});
