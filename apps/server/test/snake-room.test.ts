/** Snake Endless V2 的 GameRoom/个人 run 集成测试（无外部基础设施）。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    ErrorCode,
    GamePhase,
    GAMEPLAY_CATALOG,
    GAME_ROOM_PROTOCOL_VERSION,
    S2C,
    SnakeRunEndReason,
    SnakeRunState,
    validateSnakeRoomState,
    type IGameRoomJoinOptions,
    type ISnakeWorldDelta,
} from "@game/shared";
import { SNAKE_RELIVE_COIN_COSTS, SNAKE_RULESET } from "@game/shared/gameplays/snake/ruleset";
import { GameRoom } from "../src/rooms/GameRoom";
import { createSnakeGameMode, type SnakeGameMode } from "../src/rooms/modes/snake/index";
import {
    DeterministicTestReliveEconomy,
    RedisDemoReliveEconomy,
    resolveS2ReliveEconomy,
} from "../src/rooms/modes/snake/lifecycle";
import {
    SnakeDemoCosmeticStore,
    __grantSnakeFragmentsForTest,
    __resetSnakeCosmeticProfilesForTest,
} from "../src/rooms/modes/snake/cosmeticProfile";
import { SNAKE_FRAGMENT_SKIN_THRESHOLDS } from "../src/rooms/modes/snake/skinBusinessCatalog";
import { resolveRoomProfile, type RoomProfile } from "../src/rooms/core/RoomProfile";
import { SnakeRoomState } from "../src/rooms/schema/GameRoomState";

const MODE_ID = "snake";
const DROP_IN_PROFILE: RoomProfile = resolveRoomProfile(MODE_ID, "dropIn");

type SentMessage = readonly [string, unknown];
type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string; profile: string };
    sent: SentMessage[];
    send(type: string, payload: unknown): void;
};

function client(sessionId: string): FakeClient {
    const sent: SentMessage[] = [];
    return {
        sessionId,
        auth: { userId: `u-${sessionId}`, sId: 0, mode: MODE_ID, profile: "dropIn" },
        sent,
        send(type, payload) { sent.push([type, payload]); },
    };
}

function joinOptions(): IGameRoomJoinOptions {
    return {
        v: GAME_ROOM_PROTOCOL_VERSION,
        sId: 0,
        mode: MODE_ID,
        modeVersion: GAMEPLAY_CATALOG.snake.modeVersion,
        profile: "dropIn",
    };
}

interface Harness {
    readonly room: GameRoom;
    readonly mode: SnakeGameMode;
    readonly economy: DeterministicTestReliveEconomy;
    readonly epoch: string;
    view(): SnakeRoomState;
}

async function buildSnakeRoom(economy = new DeterministicTestReliveEconomy()): Promise<Harness> {
    const mode = createSnakeGameMode({ reliveEconomy: economy, runtimeEnvironment: "test" });
    let epochCalls = 0;
    const room = new GameRoom({
        seed: 17,
        clock: () => 0,
        fixedStepMs: 50,
        matchId: () => `snake-epoch-${++epochCalls}`,
        mode,
        profile: DROP_IN_PROFILE,
    });
    const internals = room as unknown as {
        setSimulationInterval(callback: () => void, delay: number): void;
        lock(): Promise<void>;
        unlock(): Promise<void>;
        roomId: string;
    };
    internals.setSimulationInterval = () => undefined;
    internals.lock = async () => undefined;
    internals.unlock = async () => undefined;
    internals.roomId = "snake-room";
    await room.onCreate(joinOptions());
    const view = room.state as unknown as SnakeRoomState;
    assert.equal(epochCalls, 1);
    assert.equal(view.roomEpochId, "snake-epoch-1", "epoch 必须在首个 admission 前已建立");
    assert.equal(view.matchId, view.roomEpochId);
    return { room, mode, economy, epoch: view.roomEpochId, view: () => room.state as unknown as SnakeRoomState };
}

async function seat(harness: Harness, sessionId: string): Promise<FakeClient> {
    const joiner = client(sessionId);
    (harness.room.clients as unknown as FakeClient[]).push(joiner);
    await harness.room.onJoin(joiner as never, joinOptions());
    return joiner;
}

function dispatch(room: GameRoom, type: string, sender: FakeClient, payload: unknown): void {
    (room.messages as unknown as { _: (c: unknown, t: string, p: unknown) => void })._(sender, type, payload);
}

function step(room: GameRoom, count: number): void {
    for (let index = 0; index < count; index += 1) room.stepFixed();
}

function messages<T>(client: FakeClient, type: string): T[] {
    return client.sent.filter(([candidate]) => candidate === type).map(([, payload]) => payload as T);
}

function killByWall(harness: Harness, sessionId: string): void {
    const snake = harness.mode.__probeWorld()?.get(sessionId);
    assert.ok(snake?.alive);
    snake.protectUntilTick = 0;
    snake.points = [{ x: 100_000, y: 0 }];
    snake.direction = 0;
    snake.targetDirection = 0;
    harness.room.stepFixed();
    assert.equal(harness.view().players.get(sessionId)?.runState, SnakeRunState.DeadPresentation);
}

function advanceToOffer(harness: Harness, sessionId: string): void {
    step(harness.room, SNAKE_RULESET.humanDeathPresentationTicks);
    assert.equal(harness.view().players.get(sessionId)?.runState, SnakeRunState.PendingRelive);
}

function acceptCurrentOffer(harness: Harness, joiner: FakeClient, suffix: string): void {
    const player = harness.view().players.get(joiner.sessionId);
    assert.ok(player);
    dispatch(harness.room, C2S.SnakeReliveDecision, joiner, {
        runId: player.runId,
        deathSeq: player.deathSeq,
        clientReqId: `${player.runId}:accept:${suffix}`,
        decision: "accept",
    });
    assert.equal(player.runState, SnakeRunState.ReliveSpawning);
    step(harness.room, 2);
    assert.equal(player.runState, SnakeRunState.Active);
}

test("首人即无尽开局：稳定 epoch/meta、17 蛇、1030 食物和分块 baseline", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    const view = harness.view();
    assert.equal(view.phase, GamePhase.Playing);
    assert.equal(view.matchId, harness.epoch);
    assert.equal(view.playingStartedTick, 0);
    assert.equal(view.totalTime, 0);
    assert.equal(view.matchDurationTicks, 0);
    assert.equal(view.hasDeadline, false);
    assert.equal(view.endTick, 0, "schema sentinel 不得被解释为 deadline");
    assert.equal(view.onlineCoinReliveEnabled, false);
    assert.equal(view.players.get("first")?.skinId, 1);
    assert.equal(view.players.get("first")?.coinBalance, 10_000);
    const world = harness.mode.__probeWorld();
    assert.ok(world);
    assert.equal(world.snakes.length, 17);
    assert.equal(world.countHumans(), 1);
    assert.equal(world.countAi(), 16);
    assert.equal(world.foodList().length, 1030);
    assert.equal(messages(first, S2C.SnakeBaselineBegin).length, 1);
    assert.ok(messages(first, S2C.SnakeBaselineChunk).length > 8);
    assert.equal(messages(first, S2C.SnakeBaselineEnd).length, 1);
});

test("1～8 真人始终 17 条活动蛇，只淘汰 level-401；离场只补 401", async () => {
    const harness = await buildSnakeRoom();
    const clients: FakeClient[] = [];
    for (let index = 1; index <= 8; index += 1) clients.push(await seat(harness, `p${index}`));
    const world = harness.mode.__probeWorld();
    assert.ok(world);
    assert.equal(world.snakes.length, 17);
    assert.equal(world.countHumans(), 8);
    assert.equal(world.countAi(), 9);
    assert.equal(world.snakes.filter((snake) => snake.aiLevel === 401).length, 1);
    assert.equal(world.snakes.filter((snake) => snake.aiLevel === 402).length, 4);
    assert.equal(world.snakes.filter((snake) => snake.aiLevel === 403).length, 2);
    assert.equal(world.snakes.filter((snake) => snake.aiLevel === 404).length, 2);
    step(harness.room, SNAKE_RULESET.snapshotEveryTicks);
    const observerDeltaCount = messages(clients[0], S2C.SnakeDelta).length;
    await harness.room.onLeave(clients[7] as never, 4000);
    step(harness.room, SNAKE_RULESET.snapshotEveryTicks);
    assert.equal(world.countHumans(), 7);
    assert.equal(world.countAi(), 10);
    assert.equal(world.snakes.filter((snake) => snake.aiLevel === 401).length, 2);
    const leaveDelta = messages<ISnakeWorldDelta>(clients[0], S2C.SnakeDelta).slice(observerDeltaCount)
        .find((delta) => delta.runRemovals.includes("p8"));
    assert.ok(leaveDelta, `真人最终离场必须用 runRemovals 收敛，不能让客户端依赖 checksum resync：${JSON.stringify(
        messages<ISnakeWorldDelta>(clients[0], S2C.SnakeDelta).slice(observerDeltaCount)
            .map((delta) => [delta.tick, delta.runRemovals, delta.runUpdates.map((run) => run.id)]),
    )}`);
});

test("schema 允许 AI 千分位 wreck 进入真人分数投影", async () => {
    const harness = await buildSnakeRoom();
    await seat(harness, "fractional");
    const player = harness.view().players.get("fractional");
    assert.ok(player);
    player.score = 3.001;
    assert.equal(validateSnakeRoomState(harness.view().toJSON()).players.get("fractional")?.score, 3.001);
});

test("1800/1801 后仍 Playing；delta 有序且移动使用 append/trim", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    step(harness.room, 1801);
    assert.equal(harness.view().phase, GamePhase.Playing);
    assert.equal(harness.mode.__probeWorld()?.tick, 1801);
    const deltas = messages<ISnakeWorldDelta>(first, S2C.SnakeDelta);
    assert.ok(deltas.length > 800);
    assert.ok(deltas.every((delta, index) => index === 0 || delta.seq === deltas[index - 1].seq + 1));
    assert.ok(deltas.some((delta) => delta.snakePathDeltas.some((path) => path.append.length > 0
        && path.trimTail >= 0)), `稳定移动应使用路径增量而不是全路径重发：${JSON.stringify(deltas.slice(28, 34)
            .map((delta) => [delta.tick, delta.snakeUpserts.length, delta.snakePathDeltas.length]))}`);
    assert.ok(deltas.every((delta) => delta.envelopeTick === delta.tick));
});

test("输入 exact/seq 闸与 baseline 重取", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    step(harness.room, SNAKE_RULESET.countdownTicks + 2);
    dispatch(harness.room, C2S.SnakeInput, first, { dirX: 1, dirY: 0, boost: false, seq: 1 });
    assert.equal(harness.view().players.get("first")?.ackSeq, 1);
    dispatch(harness.room, C2S.SnakeInput, first, { dirX: 0, dirY: 1, boost: false, seq: 1 });
    assert.equal(harness.view().players.get("first")?.ackSeq, 1);
    const errorsBefore = messages(first, S2C.Error).length;
    dispatch(harness.room, C2S.SnakeInput, first, { dirX: 2, dirY: 0, boost: false, seq: 2 });
    assert.equal((messages<{ code: number }>(first, S2C.Error).at(-1)?.code), ErrorCode.BadRequest);
    assert.equal(messages(first, S2C.Error).length, errorsBefore + 1);
    const baselines = messages(first, S2C.SnakeBaselineBegin).length;
    dispatch(harness.room, C2S.SnakeBaselineRequest, first, { roomEpochId: harness.epoch, afterSeq: 0 });
    assert.equal(messages(first, S2C.SnakeBaselineBegin).length, baselines + 1);
});

test("磁铁拾取在一个 delta 原子包含 tool removal、蛇 buff 与真人累计", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    const world = harness.mode.__probeWorld();
    const snake = world?.get("first");
    assert.ok(world && snake);
    snake.protectUntilTick = 1_000;
    step(harness.room, 300);
    const tool = world?.toolList()[0];
    assert.ok(tool);
    snake.protectUntilTick = world.tick + 20;
    snake.points = [{ x: tool.x, y: tool.y }];
    snake.direction = 0;
    snake.targetDirection = 0;
    const before = first.sent.length;
    step(harness.room, 2);
    const delta = first.sent.slice(before)
        .filter(([type]) => type === S2C.SnakeDelta)
        .map(([, payload]) => payload as ISnakeWorldDelta)
        .find((entry) => entry.toolRemovals.includes(tool.id));
    assert.ok(delta, `拾取后的下一流 seq 必须携带 tool removal：${JSON.stringify(first.sent.slice(before)
        .filter(([type]) => type === S2C.SnakeDelta)
        .map(([, payload]) => {
            const entry = payload as ISnakeWorldDelta;
            return [entry.tick, entry.toolRemovals, entry.toolUpserts.map((item) => item.id),
                entry.snakeUpserts.map((item) => [item.id, item.alive, item.magnetUntilTick])];
        }))}; alive=${String(snake.alive)} tools=${world.toolList().map((entry) => entry.id).join(",")}`);
    assert.ok(delta.snakeUpserts.some((entry) => entry.id === "first" && entry.magnetUntilTick !== null));
    assert.ok(delta.runUpdates.some((entry) => entry.id === "first" && entry.magnetCollected === 1));
});

test("五次金币复活费用 100/200/300/300/300；第六死无 offer，buff 清零但累计保留", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    step(harness.room, SNAKE_RULESET.countdownTicks + SNAKE_RULESET.spawnProtectionTicks + 2);
    const player = harness.view().players.get("first");
    const snake = harness.mode.__probeWorld()?.get("first");
    assert.ok(player && snake);
    player.magnetCollected = 3;
    player.starCollected = 4;
    snake.magnetUntilTick = (harness.mode.__probeWorld()?.tick ?? 0) + 100;
    for (let index = 0; index < 5; index += 1) {
        killByWall(harness, "first");
        assert.equal(player.deathCause, "wall");
        assert.equal(player.magnetUntilTick, 0);
        advanceToOffer(harness, "first");
        assert.equal(player.coinCost, SNAKE_RELIVE_COIN_COSTS[index]);
        acceptCurrentOffer(harness, first, String(index + 1));
        assert.equal(player.relivesUsed, index + 1);
        assert.equal(player.magnetCollected, 3);
        assert.equal(player.starCollected, 4);
        assert.equal(player.deathCause, "");
        assert.equal(harness.mode.__probeWorld()?.get("first")?.magnetUntilTick, 0);
    }
    const offeredBeforeSixth = messages(first, S2C.SnakeReliveOffered).length;
    killByWall(harness, "first");
    step(harness.room, SNAKE_RULESET.humanDeathPresentationTicks);
    assert.equal(player.runState, SnakeRunState.Finalized);
    assert.equal(player.terminalIntent, SnakeRunEndReason.DeathNoOffer);
    assert.equal(messages(first, S2C.SnakeReliveOffered).length, offeredBeforeSixth);
    assert.equal(messages<{ rewardStatus: string }>(first, S2C.SnakeRunResult).at(-1)?.rewardStatus, "notEnabled");
    assert.equal(harness.economy.commitCount, 5);
    assert.equal(harness.economy.testBalance, 8_800);
    assert.equal(player.coinBalance, 8_800);
});

test("复活 decision CAS：同 ID 同 payload 重放，同 ID 异 payload 不改状态", async () => {
    const economy = new DeterministicTestReliveEconomy(50);
    const harness = await buildSnakeRoom(economy);
    const first = await seat(harness, "first");
    step(harness.room, 100);
    killByWall(harness, "first");
    advanceToOffer(harness, "first");
    const player = harness.view().players.get("first");
    assert.ok(player);
    const request = { runId: player.runId, deathSeq: player.deathSeq, clientReqId: "same", decision: "accept" as const };
    dispatch(harness.room, C2S.SnakeReliveDecision, first, request);
    step(harness.room, 1);
    assert.equal(player.runState, SnakeRunState.PendingRelive);
    assert.equal(economy.commitCount, 1);
    const results = messages(first, S2C.SnakeReliveDecisionResult).length;
    dispatch(harness.room, C2S.SnakeReliveDecision, first, request);
    assert.equal(messages(first, S2C.SnakeReliveDecisionResult).length, results + 1);
    assert.equal(economy.commitCount, 1);
    dispatch(harness.room, C2S.SnakeReliveDecision, first, { ...request, decision: "decline" });
    assert.equal(player.runState, SnakeRunState.PendingRelive);
    assert.equal(messages<{ result: string }>(first, S2C.SnakeReliveResolved).at(-1)?.result, "ineligible");
});

test("deadline 等值时 timeout 获胜；decline/accept 只允许第一个 CAS 结果", async () => {
    const timeoutHarness = await buildSnakeRoom();
    const timeoutClient = await seat(timeoutHarness, "timeout");
    step(timeoutHarness.room, 100);
    killByWall(timeoutHarness, "timeout");
    advanceToOffer(timeoutHarness, "timeout");
    const timeoutPlayer = timeoutHarness.view().players.get("timeout");
    const timeoutWorld = timeoutHarness.mode.__probeWorld();
    assert.ok(timeoutPlayer && timeoutWorld);
    timeoutWorld.tick = timeoutPlayer.decisionDeadlineTick;
    dispatch(timeoutHarness.room, C2S.SnakeReliveDecision, timeoutClient, {
        runId: timeoutPlayer.runId,
        deathSeq: timeoutPlayer.deathSeq,
        clientReqId: "at-deadline",
        decision: "accept",
    });
    assert.equal(timeoutPlayer.runState, SnakeRunState.Finalized);
    assert.equal(timeoutPlayer.terminalIntent, SnakeRunEndReason.ReliveTimeout);
    assert.equal(messages<{ result: string }>(timeoutClient, S2C.SnakeReliveResolved).at(-1)?.result, "timeout");
    assert.equal(timeoutHarness.economy.commitCount, 0);

    const casHarness = await buildSnakeRoom();
    const casClient = await seat(casHarness, "cas");
    step(casHarness.room, 100);
    killByWall(casHarness, "cas");
    advanceToOffer(casHarness, "cas");
    const casPlayer = casHarness.view().players.get("cas");
    assert.ok(casPlayer);
    dispatch(casHarness.room, C2S.SnakeReliveDecision, casClient, {
        runId: casPlayer.runId,
        deathSeq: casPlayer.deathSeq,
        clientReqId: "winner",
        decision: "decline",
    });
    assert.equal(casPlayer.runState, SnakeRunState.Finalized);
    dispatch(casHarness.room, C2S.SnakeReliveDecision, casClient, {
        runId: casPlayer.runId,
        deathSeq: casPlayer.deathSeq,
        clientReqId: "late-accept",
        decision: "accept",
    });
    assert.equal(casPlayer.terminalIntent, SnakeRunEndReason.ReliveDeclined);
    assert.equal(casHarness.economy.commitCount, 0);
});

test("安全点最多搜索 20 tick 且失败不调用经济；retryable 可用新 ID 重试，systemFailure 终局", async () => {
    const spawnHarness = await buildSnakeRoom();
    const spawnClient = await seat(spawnHarness, "spawn");
    step(spawnHarness.room, 100);
    killByWall(spawnHarness, "spawn");
    advanceToOffer(spawnHarness, "spawn");
    const spawnPlayer = spawnHarness.view().players.get("spawn");
    const spawnWorld = spawnHarness.mode.__probeWorld();
    assert.ok(spawnPlayer && spawnWorld);
    spawnWorld.tryPickHumanReliveSpawn = () => null;
    dispatch(spawnHarness.room, C2S.SnakeReliveDecision, spawnClient, {
        runId: spawnPlayer.runId,
        deathSeq: spawnPlayer.deathSeq,
        clientReqId: "no-space",
        decision: "accept",
    });
    step(spawnHarness.room, 19);
    assert.equal(spawnPlayer.runState, SnakeRunState.ReliveSpawning);
    step(spawnHarness.room, 1);
    assert.equal(spawnPlayer.runState, SnakeRunState.Finalized);
    assert.equal(spawnPlayer.terminalIntent, SnakeRunEndReason.ReliveSpawnFailed);
    assert.equal(spawnHarness.economy.commitCount, 0);

    const retryEconomy = new DeterministicTestReliveEconomy(1_000, (input) =>
        input.clientReqId === "retry-1" ? "retryableFailure" : "success");
    const retryHarness = await buildSnakeRoom(retryEconomy);
    const retryClient = await seat(retryHarness, "retry");
    step(retryHarness.room, 100);
    killByWall(retryHarness, "retry");
    advanceToOffer(retryHarness, "retry");
    const retryPlayer = retryHarness.view().players.get("retry");
    assert.ok(retryPlayer);
    dispatch(retryHarness.room, C2S.SnakeReliveDecision, retryClient, {
        runId: retryPlayer.runId, deathSeq: retryPlayer.deathSeq, clientReqId: "retry-1", decision: "accept",
    });
    step(retryHarness.room, 1);
    assert.equal(retryPlayer.runState, SnakeRunState.PendingRelive);
    assert.equal(retryPlayer.relivesUsed, 0);
    dispatch(retryHarness.room, C2S.SnakeReliveDecision, retryClient, {
        runId: retryPlayer.runId, deathSeq: retryPlayer.deathSeq, clientReqId: "retry-2", decision: "accept",
    });
    step(retryHarness.room, 2);
    assert.equal(retryPlayer.runState, SnakeRunState.Active);
    assert.equal(retryPlayer.relivesUsed, 1);
    assert.equal(retryEconomy.commitCount, 2);

    const failedEconomy = new DeterministicTestReliveEconomy(1_000, () => "systemFailure");
    const failedHarness = await buildSnakeRoom(failedEconomy);
    const failedClient = await seat(failedHarness, "failed");
    step(failedHarness.room, 100);
    killByWall(failedHarness, "failed");
    advanceToOffer(failedHarness, "failed");
    const failedPlayer = failedHarness.view().players.get("failed");
    assert.ok(failedPlayer);
    dispatch(failedHarness.room, C2S.SnakeReliveDecision, failedClient, {
        runId: failedPlayer.runId, deathSeq: failedPlayer.deathSeq, clientReqId: "system", decision: "accept",
    });
    step(failedHarness.room, 1);
    assert.equal(failedPlayer.runState, SnakeRunState.Finalized);
    assert.equal(failedPlayer.terminalIntent, SnakeRunEndReason.ReliveSystemFailed);
});

test("复活保护包含 provisional 首 tick 共 60 tick；activeTicks 从其下一 step 恢复", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "protected");
    step(harness.room, 100);
    killByWall(harness, "protected");
    advanceToOffer(harness, "protected");
    const player = harness.view().players.get("protected");
    assert.ok(player);
    const activeBefore = player.activeTicks;
    acceptCurrentOffer(harness, first, "protection");
    const world = harness.mode.__probeWorld();
    const snake = world?.get("protected");
    assert.ok(world && snake);
    const firstActiveTick = world.tick;
    assert.equal(snake.protectUntilTick, firstActiveTick + 60);
    assert.equal(player.activeTicks, activeBefore, "activation gate 的 provisional step 不计 activeTicks");
    step(harness.room, 59);
    assert.equal(world.tick, firstActiveTick + 59);
    assert.equal(world.tick < snake.protectUntilTick, true);
    assert.equal(player.activeTicks, activeBefore + 59);
    step(harness.room, 1);
    assert.equal(world.tick, snake.protectUntilTick);
    assert.equal(world.buildSnapshot(harness.epoch, 1, []).snakes.find((entry) => entry.id === "protected")?.protectUntilTick, null);
});

test("断线关闭 boost/暂停 activeTicks，绝对磁铁与 offer deadline 继续；重连沿用同一 run", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "reconnect");
    step(harness.room, 100);
    const player = harness.view().players.get("reconnect");
    const world = harness.mode.__probeWorld();
    const snake = world?.get("reconnect");
    assert.ok(player && world && snake);
    const runId = player.runId;
    const activeBefore = player.activeTicks;
    snake.boostIntent = true;
    snake.boostActive = true;
    snake.magnetUntilTick = world.tick + 5;
    player.magnetUntilTick = snake.magnetUntilTick;
    let reconnect!: () => void;
    const reconnectGate = new Promise<void>((resolve) => { reconnect = resolve; });
    (harness.room as unknown as { allowReconnection(): Promise<void> }).allowReconnection = () => reconnectGate;
    const leaving = harness.room.onLeave(first as never, 1006);
    assert.equal(player.connected, false);
    assert.equal(snake.boostIntent, false);
    assert.equal(snake.boostActive, false);
    step(harness.room, 6);
    assert.equal(player.activeTicks, activeBefore);
    assert.equal(world.buildSnapshot(harness.epoch, 1, []).snakes.find((entry) => entry.id === "reconnect")?.magnetUntilTick, null);
    reconnect();
    await leaving;
    assert.equal(player.connected, true);
    assert.equal(player.runId, runId);

    killByWall(harness, "reconnect");
    advanceToOffer(harness, "reconnect");
    const deadline = player.decisionDeadlineTick;
    let reconnectOffer!: () => void;
    const offerGate = new Promise<void>((resolve) => { reconnectOffer = resolve; });
    (harness.room as unknown as { allowReconnection(): Promise<void> }).allowReconnection = () => offerGate;
    const offerLeaving = harness.room.onLeave(first as never, 1006);
    step(harness.room, deadline - world.tick);
    assert.equal(player.runState, SnakeRunState.Finalized);
    assert.equal(player.terminalIntent, SnakeRunEndReason.ReliveTimeout);
    reconnectOffer();
    await offerLeaving;
    assert.equal(player.runId, runId);
});

test("final-leave/churn 集合回落；dispose 进入 Draining 并释放世界、游标与任务", async () => {
    const harness = await buildSnakeRoom();
    for (let index = 0; index < 20; index += 1) {
        const joiner = await seat(harness, `churn-${index}`);
        step(harness.room, 2);
        await harness.room.onLeave(joiner as never, 4000);
        const clients = harness.room.clients as unknown as FakeClient[];
        const clientIndex = clients.indexOf(joiner);
        if (clientIndex >= 0) clients.splice(clientIndex, 1);
        const diagnostics = harness.mode.__probeDiagnostics();
        assert.equal(harness.view().players.size, 0);
        assert.equal(diagnostics.deathSnapshots, 0);
        assert.equal(diagnostics.runStats, 0, "S4-01 的 per-run 统计不得随 churn 泄漏");
        assert.equal(diagnostics.spawnAttempts, 0);
        assert.equal(diagnostics.pendingSpawns, 0);
        assert.equal(diagnostics.decisionRecords, 0);
        assert.equal(diagnostics.streamCursors, 0);
        assert.equal(diagnostics.baselineNeeded, 0);
        assert.equal(diagnostics.queuedEvents, 0);
        assert.equal(diagnostics.snakes, 17, "空房尚未触发 harness dispose 前只保留当前房级 AI 集合");
    }
    const tickBeforeDispose = harness.view().tick;
    await harness.room.onDispose();
    assert.equal(harness.view().draining, true);
    assert.deepEqual(harness.mode.__probeDiagnostics(), {
        deathSnapshots: 0,
        runStats: 0,
        spawnAttempts: 0,
        pendingSpawns: 0,
        decisionRecords: 0,
        streamCursors: 0,
        baselineNeeded: 0,
        queuedEvents: 0,
        snakes: 0,
        pendingAiRespawns: 0,
        tools: 0,
    });
    harness.room.stepFixed();
    assert.equal(harness.view().tick, tickBeforeDispose, "dispose 后 fixed-step 必须停止");
});

test("结束本次只终结本人；生产环境不能绑定测试或 demo 经济", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    await seat(harness, "second");
    step(harness.room, 100);
    const player = harness.view().players.get("first");
    assert.ok(player);
    dispatch(harness.room, C2S.SnakeEndRun, first, { runId: player.runId, clientReqId: "end-1" });
    harness.room.stepFixed();
    assert.equal(player.runState, SnakeRunState.Finalized);
    assert.equal(player.terminalIntent, SnakeRunEndReason.ExplicitExit);
    assert.equal(harness.view().players.get("second")?.runState, SnakeRunState.Active);
    assert.equal(harness.view().phase, GamePhase.Playing);
    assert.throws(() => resolveS2ReliveEconomy(new DeterministicTestReliveEconomy(), "production"),
        /production cannot bind/u);
    assert.throws(() => resolveS2ReliveEconomy(new RedisDemoReliveEconomy(), "production"),
        /production cannot bind/u);
    assert.equal(resolveS2ReliveEconomy(undefined, "production").kind, "disabled");
});

test("S3-03 run 起始锁存装备皮肤：join ⛔ 无自报通道；run 中换装不改当前蛇，下一 run 才生效", async () => {
    __resetSnakeCosmeticProfilesForTest();
    const store = new SnakeDemoCosmeticStore({
        persistence: async () => {},
        hydration: async () => [null, null, null],
    });
    // 预热 u-p1 的衣柜：解锁并装备 401（uid 形态由 harness 的 auth.userId 决定）。
    __grantSnakeFragmentsForTest("u-p1", 401, SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(401)!);
    assert.equal(store.unlock("u-p1", 401).kind, "ok");
    assert.equal(store.equip("u-p1", 401).kind, "ok");

    const harness = await buildSnakeRoom();
    await seat(harness, "p1");
    const player = harness.view().players.get("p1");
    assert.ok(player);
    assert.equal(player.skinId, 401, "createPlayer 必须锁存已预热 profile 的装备皮肤");

    // ⛔ join 自报皮肤无效：IGameRoomJoinOptions 里根本没有皮肤字段，
    // 连伪造一个都进不了 mode——服务端只认从准入身份反查的 uid（拍板 A）。
    assert.equal("skinId" in joinOptions(), false);
    assert.equal("skin" in joinOptions(), false);

    // run 中换装：profile 变了，但当前蛇的锁存值不动。
    assert.equal(store.equip("u-p1", 1).kind, "ok");
    assert.equal(store.getSnapshot("u-p1").equippedSkinId, 1);
    step(harness.room, 20);
    assert.equal(harness.view().players.get("p1")?.skinId, 401, "⛔ 换装不得改变当前 run 的外观");

    // 未预热的 uid 回退默认皮肤 1，⛔ 不因衣柜缺数据阻塞进房。
    await seat(harness, "p2");
    assert.equal(harness.view().players.get("p2")?.skinId, 1);

    __resetSnakeCosmeticProfilesForTest();
});

test("S4-01 per-run 统计：峰值长度、有效输入去重计数、复活消耗累计，且随新 run 归零", async () => {
    const harness = await buildSnakeRoom();
    const joiner = await seat(harness, "s4");
    const player = harness.view().players.get("s4");
    assert.ok(player);
    // 必须跨过 3 秒准备期：Preparing 状态下输入命令直接被丢弃。
    step(harness.room, 100);
    assert.equal(player.runState, SnakeRunState.Active);

    const first = harness.mode.__probeRunStats("s4");
    assert.ok(first, `runStats 应已建立，probe=${JSON.stringify(harness.mode.__probeDiagnostics())}`);
    assert.ok(first.maxLength >= SNAKE_RULESET.spawnLength, "峰值长度至少是出生长度");
    assert.equal(first.reliveCoinSpent, 0);

    // 有效输入按「朝向/加速变化」计数，⛔ 不逐包累加：连发同一个方向只算一次。
    const before = harness.mode.__probeRunStats("s4")!.meaningfulInputCount;
    dispatch(harness.room, C2S.SnakeInput, joiner, { dirX: 1, dirY: 0, boost: false, seq: 1 });
    dispatch(harness.room, C2S.SnakeInput, joiner, { dirX: 1, dirY: 0, boost: false, seq: 2 });
    dispatch(harness.room, C2S.SnakeInput, joiner, { dirX: 1, dirY: 0, boost: false, seq: 3 });
    harness.room.stepFixed();
    const afterSameDir = harness.mode.__probeRunStats("s4")!.meaningfulInputCount;
    assert.equal(afterSameDir, before + 1, "重复同一朝向只计一次");

    dispatch(harness.room, C2S.SnakeInput, joiner, { dirX: 0, dirY: 1, boost: true, seq: 4 });
    harness.room.stepFixed();
    assert.equal(harness.mode.__probeRunStats("s4")!.meaningfulInputCount, afterSameDir + 1, "换向 + 加速算新的一次");

    // 玩家离开后统计随之清理，⛔ 不泄漏。
    await harness.room.onLeave(joiner as never, 4000);
    assert.equal(harness.mode.__probeRunStats("s4"), undefined);
    assert.equal(harness.mode.__probeDiagnostics().runStats, 0);
});
