/**
 * arenaCapture（kits/arena 占领赛 mode）服务端规则：capture 计数、到 goal 结算、结算后忽略输入、离开判胜、shouldSettle。
 * 直接驱动 GameMode 接缝（状态由生成的 createRoomStateForMode 造），⛔ 不碰 GameRoom 传输层。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ArenaCaptureCapture, GamePhase, GameplayModeId } from "@game/shared";
import { ArenaCaptureRoomState, createRoomStateForMode } from "../src/rooms/schema/GameRoomState";
import {
  ARENA_CAPTURE_DEFAULT_GOAL, ARENA_CAPTURE_MAX_GOAL, createArenaCaptureGameMode, registerArenaCaptureGameMode,
} from "../src/rooms/modes/arenaCapture/index";
import { GameModeRegistry } from "../src/rooms/GameMode";

function captureState(): ArenaCaptureRoomState {
  const state = createRoomStateForMode(GameplayModeId.ArenaCapture);
  assert.ok(state instanceof ArenaCaptureRoomState);
  return state;
}

function fakeClient(sessionId: string): { sessionId: string } {
  return { sessionId };
}

test("arenaCapture：createPlayer/onMatchInitialize/capture 计数，先到 captureGoal 者胜并 settle，结算后再 capture 无效", () => {
  const mode = createArenaCaptureGameMode({ captureGoal: 3 });
  assert.equal(mode.id, "arenaCapture");
  assert.deepEqual(mode.roster, { min: 1, max: mode.roster.max, autoStart: 1 });
  const state = captureState();
  const a = mode.createPlayer({ sessionId: "s-a", name: "A" } as never);
  const b = mode.createPlayer({ sessionId: "s-b", name: "B" } as never);
  state.players.set(a.id, a);
  state.players.set(b.id, b);
  void mode.onMatchInitialize?.({ state, matchId: "m1" } as never);
  assert.equal(state.captureGoal, 3);
  assert.equal(state.winnerId, "");
  state.phase = GamePhase.Playing;

  let settled = 0;
  const capture = (sessionId: string) => (mode.commands as Record<string, (args: unknown) => void>)[ArenaCaptureCapture.type]({
    state, client: fakeClient(sessionId), settle: () => { settled += 1; },
  });
  capture("s-a"); capture("s-a"); capture("s-b");
  assert.equal(a.captures, 2);
  assert.equal(b.captures, 1);
  assert.equal(settled, 0);
  capture("s-a");
  assert.equal(a.captures, 3);
  assert.equal(state.winnerId, "s-a");
  assert.equal(settled, 1);
  capture("s-b");
  assert.equal(b.captures, 1, "结算后输入必须被忽略");
  assert.equal(settled, 1);
  assert.equal(mode.shouldSettle?.({ state } as never), true);
  capture("s-zzz");
  assert.equal(settled, 1);
});

test("arenaCapture：captureGoal 归一化（非法 → 缺省、超上限 → 缺省）；rollback 复位", () => {
  const state = captureState();
  const p = createArenaCaptureGameMode().createPlayer({ sessionId: "s", name: "S" } as never);
  state.players.set(p.id, p);
  for (const [input, expected] of [[undefined, ARENA_CAPTURE_DEFAULT_GOAL], [0, ARENA_CAPTURE_DEFAULT_GOAL], [1.5, ARENA_CAPTURE_DEFAULT_GOAL], [ARENA_CAPTURE_MAX_GOAL + 1, ARENA_CAPTURE_DEFAULT_GOAL], [7, 7]] as const) {
    const mode = createArenaCaptureGameMode(input === undefined ? {} : { captureGoal: input });
    p.captures = 5; state.winnerId = "s";
    void mode.onMatchRollback?.({ state } as never);
    assert.equal(state.captureGoal, expected, `captureGoal=${String(input)}`);
    assert.equal(p.captures, 0);
    assert.equal(state.winnerId, "");
  }
  assert.equal(ARENA_CAPTURE_DEFAULT_GOAL, 5, "与 state.json 的 captureGoal default 一致");
});

test("arenaCapture：对局中离开——剩最后一人即胜；等待期离开不判；空房 shouldSettle", () => {
  const mode = createArenaCaptureGameMode();
  const state = captureState();
  const a = mode.createPlayer({ sessionId: "s-a", name: "A" } as never);
  const b = mode.createPlayer({ sessionId: "s-b", name: "B" } as never);
  const c = mode.createPlayer({ sessionId: "s-c", name: "C" } as never);
  state.players.set(a.id, a); state.players.set(b.id, b); state.players.set(c.id, c);
  void mode.onPlayerLeaving?.({ state, client: fakeClient("s-c"), duringMatch: false } as never);
  assert.equal(state.winnerId, "", "等待期离开不判胜");
  state.players.delete("s-c");
  void mode.onPlayerLeaving?.({ state, client: fakeClient("s-b"), duringMatch: true } as never);
  assert.equal(state.winnerId, "s-a", "对局中剩最后一人即胜");
  assert.equal(mode.shouldSettle?.({ state } as never), true);
  assert.equal(mode.shouldSettle?.({ state: captureState() } as never), true, "空房收局");
});

test("arenaCapture：registerArenaCaptureGameMode 登记到给定 registry，create 过 roster 闸，注销后消失", () => {
  const registry = new GameModeRegistry();
  const unregister = registerArenaCaptureGameMode(registry);
  assert.equal(registry.has(GameplayModeId.ArenaCapture), true);
  assert.doesNotThrow(() => registry.create(GameplayModeId.ArenaCapture));
  unregister();
  assert.equal(registry.has(GameplayModeId.ArenaCapture), false);
});
