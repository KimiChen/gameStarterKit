/**
 * snake 玩法的房间层集成测试（drop-in 自由加入语义；GameRoom + 注入 mode 直构，
 * 对齐 drop-in.test.ts 先例；真栈撮合在 test/int/snake.test.ts）。
 *
 * 覆盖：首人即开局（3s 倒计时冻结）、Playing 中入座即出生 + AI 让位、真人离开
 * AI 补刷、Settle 拒入、输入闸（phase/seq）、Schema 摘要投影、快照节奏与 wire
 * 校验、限时到点收局（无 evidence——drop-in × evidence 互斥的注册期闸另有
 * drop-in.test.ts 反例守着）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S,
    ErrorCode,
    GamePhase,
    GAMEPLAY_CATALOG,
    GAME_ROOM_PROTOCOL_VERSION,
    S2C,
    type IGameRoomJoinOptions,
    type ISnakeWorldSnapshot,
} from "@game/shared";
import { SNAKE_RULESET } from "@game/shared/gameplays/snake/ruleset";
import { GameRoom } from "../src/rooms/GameRoom";
import { createSnakeGameMode } from "../src/rooms/modes/snake/index";
import { resolveRoomProfile, type RoomProfile } from "../src/rooms/core/RoomProfile";
import { SnakeRoomState } from "../src/rooms/schema/GameRoomState";

const MODE_ID = "snake";
const DROP_IN_PROFILE: RoomProfile = resolveRoomProfile(MODE_ID, "dropIn");

type SentMessage = readonly [string, unknown];

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string; profile: string };
    sent: SentMessage[];
    send: (type: string, payload: unknown) => void;
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

type Harness = {
    room: GameRoom;
    snapshots: ISnakeWorldSnapshot[];
    view(): SnakeRoomState;
};

async function buildSnakeRoom(): Promise<Harness> {
    const room = new GameRoom({
        seed: 17,
        clock: () => 0,
        fixedStepMs: 50,
        mode: createSnakeGameMode(),
        profile: DROP_IN_PROFILE,
    });
    const snapshots: ISnakeWorldSnapshot[] = [];
    const internals = room as unknown as {
        setSimulationInterval(callback: () => void, delay: number): void;
        lock(): Promise<void>;
        unlock(): Promise<void>;
        roomId: string;
        broadcastModeS2C(token: unknown, payload: unknown): void;
    };
    internals.setSimulationInterval = () => undefined;
    internals.lock = async () => undefined;
    internals.unlock = async () => undefined;
    internals.roomId = "snake-room";
    const realBroadcast = internals.broadcastModeS2C.bind(room);
    // ⚠ 先真实广播（内含 wire token validate）再记录——顺序反过来会让未过校验的
    // 快照也被记进 snapshots，测试在错误出口面前变假绿（S3 曾实测撞上：foods 未量化）。
    internals.broadcastModeS2C = (token, payload) => {
        realBroadcast(token, payload);
        if ((token as { type?: string }).type === S2C.SnakeSnapshot) {
            snapshots.push(payload as ISnakeWorldSnapshot);
        }
    };
    await room.onCreate(joinOptions());
    return { room, snapshots, view: () => room.state as unknown as SnakeRoomState };
}

async function seat(harness: Harness, sessionId: string): Promise<FakeClient> {
    const joiner = client(sessionId);
    await harness.room.onJoin(joiner as never, joinOptions());
    return joiner;
}

function dispatch(room: GameRoom, type: string, sender: FakeClient, payload: unknown): void {
    (room.messages as unknown as { _: (c: unknown, t: string, p: unknown) => void })._(sender, type, payload);
}

test("snake 首人即开局：drop-in 自动开局 + 世界建好 + AI 填满到 8 蛇 + 倒计时字段", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    const view = harness.view();
    assert.equal(view.phase, GamePhase.Playing, "首人入座即 Playing（drop-in）");
    assert.equal(view.players.size, 1);
    assert.ok(view.matchId.length > 0);
    assert.equal(view.countdownEndTick, SNAKE_RULESET.countdownTicks, "倒计时窗口写入 state");
    assert.equal(view.endTick, SNAKE_RULESET.countdownTicks + SNAKE_RULESET.matchTicks);
    assert.ok(first.sent.some(([type]) => type === S2C.Welcome));
    // 推进到移动解禁后：快照里应是 1 真人 + 7 AI
    for (let i = 0; i <= SNAKE_RULESET.countdownTicks + 2; i++) harness.room.stepFixed();
    assert.ok(harness.snapshots.length > 0, "Playing 后必须有快照流出");
    const latest = harness.snapshots[harness.snapshots.length - 1];
    assert.equal(latest.snakes.length, 8, "AI 填满到总蛇数 8");
    assert.equal(latest.snakes.filter((snake) => !snake.ai).length, 1);
    assert.equal(latest.snakes.filter((snake) => snake.ai).length, 7);
    assert.equal(latest.matchId, view.matchId);
});

test("snake Playing 中入座：立即出生进世界 + 最低分 AI 死亡掉落让位", async () => {
    const harness = await buildSnakeRoom();
    await seat(harness, "first");
    for (let i = 0; i <= SNAKE_RULESET.countdownTicks + 2; i++) harness.room.stepFixed();
    const second = await seat(harness, "second");
    assert.equal(harness.view().players.size, 2, "Playing 中入座（drop-in 放行）");
    assert.ok(second.sent.some(([type]) => type === S2C.Welcome));
    for (let i = 0; i < 2; i++) harness.room.stepFixed();
    const latest = harness.snapshots[harness.snapshots.length - 1];
    assert.equal(latest.snakes.filter((snake) => !snake.ai).length, 2, "第二人已在世界");
    assert.equal(latest.snakes.filter((snake) => snake.ai).length, 6, "一条 AI 已让位");
});

test("snake 真人最终离开：蛇死亡掉落 + AI 补刷维持总蛇数", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    for (let i = 0; i <= SNAKE_RULESET.countdownTicks + 2; i++) harness.room.stepFixed();
    // 手术：离场蛇先攒出超出出生长度的长度（掉落的折算基数），否则设计上不掉落
    const probeWorld = (harness.room as unknown as {
        requireMode(): { __probeWorld(): import("../src/rooms/modes/snake/world").SnakeWorld | null };
    }).requireMode().__probeWorld();
    const worldSnake = probeWorld?.get("first");
    assert.ok(worldSnake, "世界里有真人蛇");
    worldSnake.length = 60;
    await harness.room.onLeave(first as never, 4000); // 主动离开（consented 4000 = 立即移除）
    assert.equal(harness.view().players.size, 0);
    for (let i = 0; i < 2; i++) harness.room.stepFixed();
    const latest = harness.snapshots[harness.snapshots.length - 1];
    assert.equal(latest.snakes.filter((snake) => !snake.ai).length, 0);
    assert.equal(latest.snakes.filter((snake) => snake.ai).length, 8, "AI 补刷回 8 蛇");
    assert.ok(latest.wrecks.length > 0, "离场蛇的掉落在场");
});

test("snake 输入闸：非 Playing 不可达（Settle 拒入由 drop-in 语义承担）、seq 倒退静默拒绝", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    for (let i = 0; i <= SNAKE_RULESET.countdownTicks + 2; i++) harness.room.stepFixed();
    // 合法输入
    dispatch(harness.room, C2S.SnakeInput, first, { dirX: 1, dirY: 0, boost: false, seq: 1 });
    assert.equal(harness.view().players.get("first")?.ackSeq, 1, "合法输入 ack 更新");
    const errorsBefore = first.sent.filter(([type]) => type === S2C.Error).length;
    // seq 倒退：静默消费（⛔ 不打错误——与 ballMove 死亡/未入座语义一致，防重连抖动刷错）
    dispatch(harness.room, C2S.SnakeInput, first, { dirX: 0, dirY: 1, boost: false, seq: 1 });
    assert.equal(harness.view().players.get("first")?.ackSeq, 1, "重复 seq 不改变状态");
    // 畸形输入：exact validator 拒绝 + BadRequest
    dispatch(harness.room, C2S.SnakeInput, first, { dirX: 2, dirY: 0, boost: false, seq: 2 });
    const errors = first.sent.filter(([type]) => type === S2C.Error);
    assert.equal(errors.length, errorsBefore + 1);
    assert.equal((errors[errors.length - 1][1] as { code: number }).code, ErrorCode.BadRequest);
});

test("snake 快照节奏：每 2 tick 一份（10Hz）、seq 单调、过 wire validator", async () => {
    const harness = await buildSnakeRoom();
    await seat(harness, "first");
    harness.snapshots.length = 0;
    for (let i = 0; i < 10; i++) harness.room.stepFixed();
    assert.equal(harness.snapshots.length, 5, "10 tick 必须恰好 5 份快照");
    const seqs = harness.snapshots.map((snapshot) => snapshot.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), "快照 seq 单调");
    assert.equal(harness.view().snapshotSeq, seqs[seqs.length - 1], "state.snapshotSeq 跟随最新快照");
    // wire validator 在 broadcastS2C 出口（shell 统一过 token.validate）——坏快照出不了门；
    // 这里反证快照结构合法：snakes/foods/wrecks 键与类型
    const latest = harness.snapshots[harness.snapshots.length - 1];
    assert.ok(latest.snakes[0].points.length > 0);
    assert.ok(latest.foods.length > 0);
});

test("snake 限时到点：冻结排名 + Settle + winnerId；⛔ 无 evidence（不声明能力）", async () => {
    const harness = await buildSnakeRoom();
    const first = await seat(harness, "first");
    let steps = 0;
    while (harness.view().phase === GamePhase.Playing && steps < SNAKE_RULESET.countdownTicks + SNAKE_RULESET.matchTicks + 10) {
        harness.room.stepFixed();
        steps++;
    }
    const view = harness.view();
    assert.equal(view.phase, GamePhase.Settle, "到达 endTick 必须收局");
    // winnerId = 世界排名的第一名（含 AI——7 条 AI 打满全场时挂机真人不是第一）。
    // 用 mode 测试探针的世界排名对照（⛔ 不假设真人必赢）。
    const probeWorld = (harness.room as unknown as {
        requireMode(): { __probeWorld(): import("../src/rooms/modes/snake/world").SnakeWorld | null };
    }).requireMode().__probeWorld();
    const top = probeWorld?.ranking()[0];
    assert.ok(top, "排名非空");
    assert.equal(view.winnerId, top.id, "winnerId 必须是权威排名第一名");
    // Settle 后 join 被拒（drop-in 语义：Settle 拒收新客）
    await assert.rejects(
        harness.room.onJoin(client("late") as never, joinOptions()),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.GameAlreadyStarted)),
        "Settle 后 join 必须被拒",
    );
    // Settle 后输入不再产生玩法副作用（phase 闸）
    const before = harness.snapshots.length;
    dispatch(harness.room, C2S.SnakeInput, first, { dirX: 1, dirY: 0, boost: false, seq: 99 });
    harness.room.stepFixed();
    assert.equal(harness.snapshots.length, before, "Settle 后不再产快照");
});
