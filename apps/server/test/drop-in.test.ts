/**
 * drop-in（自由加入）房型的服务端用例矩阵（StartPolicy 第三变体；语义见
 * docs/SERVER.md「StartPolicy 三变体」与 plan-v4.md 本轮登记）。
 *
 * fixture gameplay：dropInFixture（manifest maxPlayers=8、profiles=["dropIn"]、无 fragment、
 * 无 evidence）——对齐 privateFixture 的隔离先例：进 catalog 走完整单源链，⛔ 不进生产
 * mode registry/默认撮合池；本文件按注入 mode 直构 GameRoom。
 * 8 人上限是该玩法 manifest 的 maxPlayers 配置参数（→ roster.max → maxClients），
 * ⛔ 不是框架常量（shared MAX_PLAYERS=4 仅是未进 catalog 的注入 mode 兜底上界）。
 *
 * 真栈撮合行为（同房 8 人 / 第 9 人新房 / 空位回填 / 宽限占座计容量）在
 * test/int/drop-in.test.ts（真 Server + SDK joinOrCreate）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import {
    C2S,
    S2C,
    ErrorCode,
    GamePhase,
    GAMEPLAY_CATALOG,
    GAME_ROOM_PROTOCOL_VERSION,
    type IGameRoomJoinOptions,
} from "@game/shared";
import { GameRoom, type GameRoomRuntimeOptions } from "../src/rooms/GameRoom";
import type { GameMode } from "../src/rooms/GameMode";
import {
    assertProfilePoliciesCoherent,
    resolveRoomProfile,
    type RoomProfile,
} from "../src/rooms/core/RoomProfile";
import { DROP_IN_START_POLICY, OWNER_READY_START_POLICY } from "../src/rooms/core/StartPolicy";
import { INVITE_CODE_ACCESS_POLICY, MATCHMAKING_ACCESS_POLICY } from "../src/rooms/core/AccessPolicy";
import {
    DropInFixturePlayerState,
    DropInFixtureState,
    PrivateFixturePlayerState,
    PrivateFixtureState,
} from "../src/rooms/schema/GameRoomState";

const FIXTURE_MODE_ID = "dropInFixture";
const DROP_IN_PROFILE: RoomProfile = resolveRoomProfile(FIXTURE_MODE_ID, "dropIn");

type SentMessage = readonly [string, unknown];

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string; profile: string };
    sent: SentMessage[];
    send: (type: string, payload: unknown) => void;
};

function client(sessionId: string, mode = FIXTURE_MODE_ID, profile = "dropIn"): FakeClient {
    const sent: SentMessage[] = [];
    return {
        sessionId,
        auth: { userId: `u-${sessionId}`, sId: 0, mode, profile },
        sent,
        send(type, payload) { sent.push([type, payload]); },
    };
}

/** drop-in fixture mode：无玩法输入、无 evidence；roster 满足 drop-in 定义（min=1/autoStart=1）。 */
function createDropInMode(overrides: Partial<GameMode<DropInFixtureState, DropInFixturePlayerState>> = {},
): GameMode<DropInFixtureState, DropInFixturePlayerState> {
    return {
        id: FIXTURE_MODE_ID,
        roster: { min: 1, max: 8, autoStart: 1 },
        createPlayer({ sessionId, name }) {
            const player = new DropInFixturePlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
        ...overrides,
    };
}

function joinOptions(): IGameRoomJoinOptions {
    return {
        v: GAME_ROOM_PROTOCOL_VERSION,
        sId: 0,
        mode: FIXTURE_MODE_ID,
        modeVersion: GAMEPLAY_CATALOG.dropInFixture.modeVersion,
        profile: "dropIn",
    };
}

type Harness = {
    room: GameRoom;
    lockCalls: () => number;
    unlockCalls: () => number;
    view(): DropInFixtureState;
};

async function buildDropInRoom(options: {
    mode?: GameMode<DropInFixtureState, DropInFixturePlayerState>;
    runtime?: GameRoomRuntimeOptions;
} = {}): Promise<Harness> {
    const room = new GameRoom({
        seed: 17,
        clock: () => 0,
        fixedStepMs: 50,
        mode: options.mode ?? createDropInMode(),
        profile: DROP_IN_PROFILE,
        ...(options.runtime ?? {}),
    });
    let locks = 0;
    let unlocks = 0;
    const internals = room as unknown as {
        setSimulationInterval(callback: () => void, delay: number): void;
        lock(): Promise<void>;
        unlock(): Promise<void>;
        roomId: string;
    };
    internals.setSimulationInterval = () => undefined;
    internals.lock = async () => { locks++; };
    internals.unlock = async () => { unlocks++; };
    internals.roomId = "dropin-room";
    // 生产路径的 onCreate 也要过（maxClients = roster.max 的接线 + drop-in 注册期断言的
    // onCreate 位点都在这里生效）。
    await room.onCreate(joinOptions());
    return {
        room,
        lockCalls: () => locks,
        unlockCalls: () => unlocks,
        view: () => room.state as unknown as DropInFixtureState,
    };
}

async function seat(harness: Harness, sessionId: string): Promise<FakeClient> {
    const joiner = client(sessionId);
    await harness.room.onJoin(joiner as never, joinOptions());
    return joiner;
}

function dispatch(room: GameRoom, type: string, sender: FakeClient, payload: unknown): void {
    (room.messages as unknown as { _: (c: unknown, t: string, p: unknown) => void })._(sender, type, payload);
}

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

function expectJoinRefused(code: number) {
    return (error: unknown): boolean => error instanceof Error && error.message.includes(String(code));
}

// ── profile 注册表：dropIn = drop-in + matchmaking ───────────────────────────
// 变异验证：从 PROFILE_POLICIES 删除 "dropIn" 条目 → resolveRoomProfile 抛「没有 policy 定义」，
// 本用例（与本文件全部用例的模块级 DROP_IN_PROFILE 初始化）转红。
test("drop-in：profile 注册表解析 dropIn = drop-in startPolicy + matchmaking access", () => {
    assert.equal(DROP_IN_PROFILE.startPolicy.kind, "drop-in");
    assert.equal(DROP_IN_PROFILE.accessPolicy.kind, "matchmaking");
    assert.equal(DROP_IN_PROFILE.mode, FIXTURE_MODE_ID);
    // 8 人上限的单源：玩法 manifest 的 maxPlayers（→ 生成 catalog → roster cap → maxClients）。
    assert.equal(GAMEPLAY_CATALOG.dropInFixture.maxPlayers, 8);
    assert.deepEqual([...GAMEPLAY_CATALOG.dropInFixture.profiles], ["dropIn"]);
});

// ── 首人即开局 + 开局路径零 lock ─────────────────────────────────────────────
// 变异验证：去掉 performStartMatch 的 `if (!dropIn) await this.lockWithDeadline(...)` 条件
// （恢复无条件 lock）→ lock 计数断言转红；去掉 onJoin autoStart 触发的 drop-in 分支
// （只认 "auto"）→ phase===Playing 断言转红。
test("drop-in：首人入座即 Playing，开局事务 ⛔ 不调用 room.lock", async () => {
    const harness = await buildDropInRoom();
    assert.equal((harness.room as unknown as { maxClients: number }).maxClients, 8,
        "maxClients 必须来自 roster.max（= manifest maxPlayers 配置参数）");
    const first = await seat(harness, "first");
    assert.equal(harness.view().phase, GamePhase.Playing, "首人入座必须直接开局");
    assert.equal(harness.view().players.size, 1);
    assert.ok(harness.view().matchId.length > 0, "开局必须铸 matchId");
    assert.equal(harness.lockCalls(), 0, "drop-in 开局 ⛔ 不 lock（房间必须始终可撮合）");
    assert.equal(harness.unlockCalls(), 0);
    assert.ok(first.sent.some(([type]) => type === S2C.Welcome));
});

// ── starting 窗口内 join：落座成为创始成员，⛔ 不使开局失效 ──────────────────
// 变异验证：把 assertMatchStartBoundary 的 drop-in 分支删掉（走 owner-ready/auto 的整组
// roster 快照重验）→ 窗口内第二人的落座使 fence 失败、开局回滚，本用例转红。
test("drop-in：starting 窗口内第二人入座不破坏开局，两人都在局", async () => {
    const gate = deferred();
    const harness = await buildDropInRoom({
        mode: createDropInMode({ onMatchStart: () => gate.promise }),
    });
    const first = client("first");
    const firstJoin = harness.room.onJoin(first as never, joinOptions());
    // onMatchStart 挂起 = starting 窗口（starting 置位、phase 仍 Waiting）。
    assert.equal((harness.room as unknown as { starting: boolean }).starting, true);
    assert.equal(harness.view().phase, GamePhase.Waiting);
    const second = client("second");
    const secondJoin = harness.room.onJoin(second as never, joinOptions());
    assert.equal(harness.view().players.size, 2, "窗口内 join 必须允许落座");
    gate.resolve();
    await Promise.all([firstJoin, secondJoin]);
    assert.equal(harness.view().phase, GamePhase.Playing, "窗口内 join ⛔ 不得使开局失效");
    assert.equal(harness.view().players.size, 2, "Playing 发布时窗口内成员已在 players map");
    assert.ok(first.sent.some(([type]) => type === S2C.Welcome));
    assert.ok(second.sent.some(([type]) => type === S2C.Welcome));
});

// ── Playing 中准入：第 2..8 人可入座，第 9 人 RoomFull ───────────────────────
// 变异验证：把 onJoin 的 drop-in phase 分支去掉（恢复 phase!==Waiting 一律 GameAlreadyStarted）
// → 第 2 人入座转红；去掉 roster.max 容量闸 → 第 9 人 RoomFull 断言转红。
test("drop-in：Playing 中第 2..8 人入座走同一 createModePlayer 流，第 9 人 RoomFull", async () => {
    const harness = await buildDropInRoom();
    await seat(harness, "p1");
    assert.equal(harness.view().phase, GamePhase.Playing);
    for (let index = 2; index <= 8; index++) {
        const joiner = await seat(harness, `p${index}`);
        assert.ok(joiner.sent.some(([type]) => type === S2C.Welcome), `第 ${index} 人 Playing 中入座`);
    }
    assert.equal(harness.view().players.size, 8, "8 人上限内全部入座");
    assert.equal(harness.view().phase, GamePhase.Playing, "后续入座不重开局");
    await assert.rejects(
        harness.room.onJoin(client("p9") as never, joinOptions()),
        expectJoinRefused(ErrorCode.RoomFull),
        "第 9 人必须被容量闸拒绝（maxClients 是 Colyseus 层的第二重闸，int 层钉）",
    );
});

// ── 重连宽限占座计入容量 ─────────────────────────────────────────────────────
// 变异验证：让 drop（非主动断线）立即 removePlayer（不走 allowReconnection 保座）→
// players.size 掉到 7、第 9 人入座成功，本用例转红。
test("drop-in：宽限内断线成员保留座位并计入容量，第 9 人仍被拒", async () => {
    const harness = await buildDropInRoom();
    const members: FakeClient[] = [];
    for (let index = 1; index <= 8; index++) members.push(await seat(harness, `p${index}`));
    const reconnectGate = deferred();
    (harness.room as unknown as { allowReconnection(client: unknown, seconds: number): Promise<unknown> })
        .allowReconnection = () => reconnectGate.promise;
    const leavePromise = harness.room.onLeave(members[7] as never, CloseCode.ABNORMAL_CLOSURE);
    assert.equal(harness.view().players.size, 8, "宽限内座位保留（占座）");
    await assert.rejects(
        harness.room.onJoin(client("p9") as never, joinOptions()),
        expectJoinRefused(ErrorCode.RoomFull),
        "宽限占座必须计入容量",
    );
    reconnectGate.resolve();
    await leavePromise;
    assert.equal(harness.view().players.size, 8, "重连归位后满员依旧");
});

// ── 收局后拒收：Settle ⛔ 不再入座 ────────────────────────────────────────────
// 变异验证：把 drop-in 的 phase 闸放宽到含 Settle → 本用例转红。
test("drop-in：Settle 后 join 被 GameAlreadyStarted 拒绝", async () => {
    const harness = await buildDropInRoom({
        mode: createDropInMode({ shouldSettle: () => true }),
    });
    await seat(harness, "p1");
    const second = await seat(harness, "p2");
    assert.equal(harness.view().phase, GamePhase.Playing);
    await harness.room.onLeave(second as never, CloseCode.CONSENTED);
    assert.equal(harness.view().phase, GamePhase.Settle, "mode.shouldSettle 归 mode（drop-in 不改结算）");
    await assert.rejects(
        harness.room.onJoin(client("late") as never, joinOptions()),
        expectJoinRefused(ErrorCode.GameAlreadyStarted),
    );
});

// ── 既有两策略行为零变：auto 的 Playing 拒入闸原样（回归钉）──────────────────
// 变异验证：把 onJoin 的 phase 闸整体替换成 drop-in 的宽松版（对所有策略放行 Playing）→ 转红。
test("回归钉：auto 房 Playing 中 join 仍被 GameAlreadyStarted 拒绝", async () => {
    const { createIdleGameMode } = await import("../src/rooms/modes/IdleGameMode");
    const room = new GameRoom({ seed: 5, clock: () => 0, mode: createIdleGameMode() });
    const internals = room as unknown as {
        setSimulationInterval(callback: () => void, delay: number): void;
        lock(): Promise<void>;
    };
    internals.setSimulationInterval = () => undefined;
    internals.lock = async () => undefined;
    const idleOptions = {
        v: GAME_ROOM_PROTOCOL_VERSION,
        sId: 0,
        mode: "idle",
        modeVersion: GAMEPLAY_CATALOG.idle.modeVersion,
        profile: "default",
    };
    void room.onCreate(idleOptions);
    for (const id of ["a", "b"]) {
        const joiner = client(id, "idle", "default");
        await room.onJoin(joiner as never, idleOptions);
    }
    assert.equal((room.state as { phase: string }).phase, GamePhase.Playing, "auto 达 autoStart=2 开局");
    await assert.rejects(
        room.onJoin(client("late", "idle", "default") as never, idleOptions),
        expectJoinRefused(ErrorCode.GameAlreadyStarted),
        "auto 的 Playing 拒入闸必须原样",
    );
});

// ── 既有两策略行为零变：owner-ready 的 Playing 拒入闸原样（回归钉）────────────
// 变异验证：同上（phase 闸对非 drop-in 策略放行 Playing）→ 转红。
test("回归钉：owner-ready 房 Playing 中 join 仍被 GameAlreadyStarted 拒绝", async () => {
    // 注入 owner-ready + matchmaking 的组合（避开邀请码假件），直接驱动 startMatch 进 Playing。
    const ownerReadyProfile: RoomProfile = {
        id: "private",
        mode: "privateFixture",
        startPolicy: OWNER_READY_START_POLICY,
        accessPolicy: MATCHMAKING_ACCESS_POLICY,
    };
    const mode: GameMode<PrivateFixtureState, PrivateFixturePlayerState> = {
        id: "privateFixture",
        roster: { min: 2, max: 4, autoStart: 4 },
        createPlayer({ sessionId, name }) {
            const player = new PrivateFixturePlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
    };
    const room = new GameRoom({ seed: 7, clock: () => 0, mode, profile: ownerReadyProfile });
    const internals = room as unknown as {
        setSimulationInterval(callback: () => void, delay: number): void;
        lock(): Promise<void>;
    };
    internals.setSimulationInterval = () => undefined;
    internals.lock = async () => undefined;
    for (const id of ["a", "b"]) {
        const joiner = client(id, "privateFixture", "private");
        await room.onJoin(joiner as never, {
            v: GAME_ROOM_PROTOCOL_VERSION,
            sId: 0,
            mode: "privateFixture",
            modeVersion: GAMEPLAY_CATALOG.privateFixture.modeVersion,
            profile: "private",
        });
    }
    assert.equal(await room.startMatch(), true);
    assert.equal((room.state as { phase: string }).phase, GamePhase.Playing);
    await assert.rejects(
        room.onJoin(client("late", "privateFixture", "private") as never, {
            v: GAME_ROOM_PROTOCOL_VERSION,
            sId: 0,
            mode: "privateFixture",
            modeVersion: GAMEPLAY_CATALOG.privateFixture.modeVersion,
            profile: "private",
        }),
        expectJoinRefused(ErrorCode.GameAlreadyStarted),
        "owner-ready 的 Playing 拒入闸必须原样",
    );
});

// ── 互斥断言反例①：drop-in ⛔ 不与 invite-code 组合（注册期 fail-fast）────────
// 变异验证：把 assertProfilePoliciesCoherent 的判定删掉 → 本用例转红。
test("drop-in：与 invite-code AccessPolicy 的组合在注册期被拒（未设计的组合）", () => {
    assert.throws(
        () => assertProfilePoliciesCoherent({
            id: "dropIn",
            mode: FIXTURE_MODE_ID,
            startPolicy: DROP_IN_START_POLICY,
            accessPolicy: INVITE_CODE_ACCESS_POLICY,
        }),
        /未设计的组合/,
    );
    // 既有合法组合不受影响（回归钉）。
    assert.doesNotThrow(() => assertProfilePoliciesCoherent(resolveRoomProfile("privateFixture", "private")));
    assert.doesNotThrow(() => assertProfilePoliciesCoherent(resolveRoomProfile("ballMove", "default")));
});

// ── 互斥断言反例②：drop-in ⛔ 不与 mode.evidence capability 组合 ──────────────
// 变异验证：把 assertDropInModeCompatible 的 evidence 分支删掉 → 本用例转红。
test("drop-in：声明 evidence capability 的 mode 在构造期被拒（动态 roster 与冻结 initialRoster 矛盾）", () => {
    const evidenceMode = createDropInMode({
        evidence: {
            assertRosterCompatible: () => undefined,
            captureInitialState: () => undefined,
            build: () => null,
        },
    });
    assert.throws(
        () => new GameRoom({ seed: 1, mode: evidenceMode, profile: DROP_IN_PROFILE }),
        /evidence[\s\S]*动态 roster/,
    );
});

// ── 注册期前提：roster.min === 1 && roster.autoStart === 1 ───────────────────
// 变异验证：把 assertDropInModeCompatible 的 roster 分支删掉 → 两个反例都转红。
test("drop-in：roster.min/autoStart ≠ 1 的 mode 配 dropIn profile 注册期被拒", () => {
    assert.throws(
        () => new GameRoom({
            seed: 1,
            mode: createDropInMode({ roster: { min: 2, max: 8, autoStart: 2 } }),
            profile: DROP_IN_PROFILE,
        }),
        /roster\.min === 1/,
    );
    assert.throws(
        () => new GameRoom({
            seed: 1,
            mode: createDropInMode({ roster: { min: 1, max: 8, autoStart: 2 } }),
            profile: DROP_IN_PROFILE,
        }),
        /roster\.min === 1/,
    );
});

// ── Ready/Start 对 drop-in 不接线（owner-ready 专属，其余策略 BadRequest 原样）──
// 变异验证：把 handleRoomReady/handleRoomStart 的策略闸放宽到 drop-in → 转红。
test("drop-in：C2S Ready/Start 回 BadRequest（waitingDeadline/邀请码同样不接线）", async () => {
    const harness = await buildDropInRoom();
    const first = await seat(harness, "first");
    for (const type of [C2S.RoomReady, C2S.RoomStart]) {
        const before = first.sent.length;
        dispatch(harness.room, type, first, type === C2S.RoomReady ? { ready: true } : {});
        const [sentType, payload] = first.sent[before] ?? [];
        assert.equal(sentType, S2C.Error, `${type} 必须回 s2c.error`);
        assert.equal((payload as { code: number }).code, ErrorCode.BadRequest);
    }
    // 不接线的定时面：drop-in 无 invite policy，waitingDeadline 恒 0。
    assert.equal((harness.room as unknown as { waitingDeadlineAtMs: number }).waitingDeadlineAtMs, 0);
});
