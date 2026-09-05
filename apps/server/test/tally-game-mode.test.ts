/**
 * tally 插件（plugins/tally）服务端规则：tap 计数、到 goal 结算、结算后忽略输入、离开判胜、shouldSettle。
 * 直接驱动 GameMode 接缝（状态由生成的 createRoomStateForMode 造），⛔ 不碰 GameRoom 传输层。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GamePhase, GameplayModeId, TallyTap } from "@game/shared";
import { createRoomStateForMode, TallyRoomState } from "../src/rooms/schema/GameRoomState";
import { TALLY_DEFAULT_TAP_GOAL, TALLY_MAX_TAP_GOAL, createTallyGameMode, registerTallyGameMode } from "../src/rooms/modes/tally/index";
import { GameModeRegistry } from "../src/rooms/GameMode";

function tallyState(): TallyRoomState {
  const state = createRoomStateForMode(GameplayModeId.Tally);
  assert.ok(state instanceof TallyRoomState);
  return state;
}

function fakeClient(sessionId: string): { sessionId: string } {
  return { sessionId };
}

test("tally：createPlayer/onMatchInitialize/tap 计数，先到 tapGoal 者胜并 settle，结算后再 tap 无效", () => {
  const mode = createTallyGameMode({ tapGoal: 3 });
  assert.equal(mode.id, "tally");
  assert.deepEqual(mode.roster, { min: 1, max: mode.roster.max, autoStart: 1 });
  const state = tallyState();
  const a = mode.createPlayer({ sessionId: "s-a", name: "A" } as never);
  const b = mode.createPlayer({ sessionId: "s-b", name: "B" } as never);
  state.players.set(a.id, a);
  state.players.set(b.id, b);
  void mode.onMatchInitialize?.({ state, matchId: "m1" } as never);
  assert.equal(state.tapGoal, 3);
  assert.equal(state.winnerId, "");
  state.phase = GamePhase.Playing;

  let settled = 0;
  const tap = (sessionId: string) => (mode.commands as Record<string, (args: unknown) => void>)[TallyTap.type]({
    state, client: fakeClient(sessionId), settle: () => { settled += 1; },
  });
  tap("s-a"); tap("s-a"); tap("s-b");
  assert.equal(a.taps, 2);
  assert.equal(b.taps, 1);
  assert.equal(settled, 0);
  tap("s-a");
  assert.equal(a.taps, 3);
  assert.equal(state.winnerId, "s-a");
  assert.equal(settled, 1);
  tap("s-b");
  assert.equal(b.taps, 1, "结算后输入必须被忽略");
  assert.equal(settled, 1);
  assert.equal(mode.shouldSettle?.({ state } as never), true);
  // 未知 sessionId 静默忽略
  tap("s-zzz");
  assert.equal(settled, 1);
});

test("tally：tapGoal 归一化（非法 → 缺省、超上限 → 缺省）；rollback 复位", () => {
  assert.equal(createTallyGameMode({ tapGoal: 0 }).id, "tally");
  const state = tallyState();
  const p = createTallyGameMode().createPlayer({ sessionId: "s", name: "S" } as never);
  state.players.set(p.id, p);
  for (const [input, expected] of [[undefined, TALLY_DEFAULT_TAP_GOAL], [0, TALLY_DEFAULT_TAP_GOAL], [1.5, TALLY_DEFAULT_TAP_GOAL], [TALLY_MAX_TAP_GOAL + 1, TALLY_DEFAULT_TAP_GOAL], [7, 7]] as const) {
    const mode = createTallyGameMode(input === undefined ? {} : { tapGoal: input });
    p.taps = 5; state.winnerId = "s";
    void mode.onMatchRollback?.({ state } as never);
    assert.equal(state.tapGoal, expected, `tapGoal=${String(input)}`);
    assert.equal(p.taps, 0);
    assert.equal(state.winnerId, "");
  }
});

test("tally：对局中离开——剩最后一人即胜；等待期离开不判；空房 shouldSettle", () => {
  const mode = createTallyGameMode();
  const state = tallyState();
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
  const empty = tallyState();
  assert.equal(mode.shouldSettle?.({ state: empty } as never), true, "空房收局");
  const two = tallyState();
  two.players.set("x", mode.createPlayer({ sessionId: "x", name: "X" } as never));
  two.players.set("y", mode.createPlayer({ sessionId: "y", name: "Y" } as never));
  assert.equal(mode.shouldSettle?.({ state: two } as never), false);
});

test("tally：registerTallyGameMode 登记到给定 registry，注销后消失", () => {
  const registry = new GameModeRegistry();
  const unregister = registerTallyGameMode(registry);
  assert.equal(registry.has(GameplayModeId.Tally), true);
  unregister();
  assert.equal(registry.has(GameplayModeId.Tally), false);
});
