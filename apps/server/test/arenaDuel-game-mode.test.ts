/**
 * arenaDuel（kits/arena 决斗 mode）服务端规则：strike 计数、hits ≥ hp 结算、结算后忽略输入、对手离开判胜、
 * roster max 来自本 mode manifest（2 人）且过 registry.create 的 roster 闸。⛔ 不碰 GameRoom 传输层。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ArenaDuelStrike, GAMEPLAY_CATALOG, GamePhase, GameplayModeId } from "@game/shared";
import { ArenaDuelRoomState, createRoomStateForMode } from "../src/rooms/schema/GameRoomState";
import { ARENA_DUEL_DEFAULT_HP, ARENA_DUEL_MAX_HP, createArenaDuelGameMode, registerArenaDuelGameMode } from "../src/rooms/modes/arenaDuel/index";
import { GameModeRegistry } from "../src/rooms/GameMode";

function duelState(): ArenaDuelRoomState {
  const state = createRoomStateForMode(GameplayModeId.ArenaDuel);
  assert.ok(state instanceof ArenaDuelRoomState);
  return state;
}

function fakeClient(sessionId: string): { sessionId: string } {
  return { sessionId };
}

test("arenaDuel：roster max = manifest maxPlayers（2）；strike 计数，先让 hits ≥ hp 者胜并 settle，结算后输入无效", () => {
  const mode = createArenaDuelGameMode({ hp: 2 });
  assert.equal(mode.id, "arenaDuel");
  assert.deepEqual(mode.roster, { min: 1, max: 2, autoStart: 1 });
  assert.equal(GAMEPLAY_CATALOG.arenaDuel.maxPlayers, 2);
  const state = duelState();
  const a = mode.createPlayer({ sessionId: "s-a", name: "A" } as never);
  const b = mode.createPlayer({ sessionId: "s-b", name: "B" } as never);
  state.players.set(a.id, a);
  state.players.set(b.id, b);
  void mode.onMatchInitialize?.({ state, matchId: "m1" } as never);
  assert.equal(state.hp, 2);
  state.phase = GamePhase.Playing;
  let settled = 0;
  const strike = (sessionId: string) => (mode.commands as Record<string, (args: unknown) => void>)[ArenaDuelStrike.type]({
    state, client: fakeClient(sessionId), settle: () => { settled += 1; },
  });
  strike("s-a"); strike("s-b");
  assert.equal(settled, 0);
  strike("s-b");
  assert.equal(b.hits, 2);
  assert.equal(state.winnerId, "s-b");
  assert.equal(settled, 1);
  strike("s-a");
  assert.equal(a.hits, 1, "结算后输入必须被忽略");
  assert.equal(mode.shouldSettle?.({ state } as never), true);
});

test("arenaDuel：hp 归一化（非法 → 缺省 3、超上限 → 缺省）；rollback 复位", () => {
  const state = duelState();
  const p = createArenaDuelGameMode().createPlayer({ sessionId: "s", name: "S" } as never);
  state.players.set(p.id, p);
  for (const [input, expected] of [[undefined, ARENA_DUEL_DEFAULT_HP], [0, ARENA_DUEL_DEFAULT_HP], [ARENA_DUEL_MAX_HP + 1, ARENA_DUEL_DEFAULT_HP], [5, 5]] as const) {
    const mode = createArenaDuelGameMode(input === undefined ? {} : { hp: input });
    p.hits = 2; state.winnerId = "s";
    void mode.onMatchRollback?.({ state } as never);
    assert.equal(state.hp, expected, `hp=${String(input)}`);
    assert.equal(p.hits, 0);
    assert.equal(state.winnerId, "");
  }
  assert.equal(ARENA_DUEL_DEFAULT_HP, 3, "与 state.json 的 hp default 一致");
});

test("arenaDuel：对局中对手离开即胜；等待期离开不判；空房 shouldSettle；registry.create 过 roster 闸", () => {
  const mode = createArenaDuelGameMode();
  const state = duelState();
  const a = mode.createPlayer({ sessionId: "s-a", name: "A" } as never);
  const b = mode.createPlayer({ sessionId: "s-b", name: "B" } as never);
  state.players.set(a.id, a); state.players.set(b.id, b);
  void mode.onPlayerLeaving?.({ state, client: fakeClient("s-b"), duringMatch: false } as never);
  assert.equal(state.winnerId, "");
  void mode.onPlayerLeaving?.({ state, client: fakeClient("s-b"), duringMatch: true } as never);
  assert.equal(state.winnerId, "s-a");
  assert.equal(mode.shouldSettle?.({ state: duelState() } as never), true, "空房收局");
  const registry = new GameModeRegistry();
  const unregister = registerArenaDuelGameMode(registry);
  assert.equal(registry.has(GameplayModeId.ArenaDuel), true);
  assert.doesNotThrow(() => registry.create(GameplayModeId.ArenaDuel));
  unregister();
  assert.equal(registry.has(GameplayModeId.ArenaDuel), false);
});
