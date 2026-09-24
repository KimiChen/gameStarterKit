import assert from "node:assert/strict";
import test from "node:test";
import { createPluginModule } from "../src/plugins/gameDemo/index";
import { GameDemoBossEvents } from "../src/plugins/gameDemo/logic/GameDemoBossEvents";
import { GameDemoLogic } from "../src/plugins/gameDemo/logic/GameDemoLogic";
import { getGameDemoRuntime, type GameDemoRuntime } from "../src/plugins/gameDemo/logic/gameDemoRuntime";
import { lobbyDataSync } from "../src/net/LobbyDataSync";
import {
  GameDemoRpc,
  type IGameDemoAlchemyState,
  type IGameDemoBossState,
} from "../src/shared/protocol/lobbyRpc/domains/gameDemo";

const assets = { initialized: true, gold: 5000, items: { herb: 2, dew: 1, pill: 0, finePill: 0 } };

function bossFixture(): IGameDemoBossState {
  return {
    uid: 7,
    room: {
      bossId: "tiger", name: "山君", runNumber: 1, hp: 990, maxHp: 1000, phase: "running", revision: 3,
      respawnAt: 0, nextCounterAt: 0, damage: [{ uid: 7, damage: 10, rank: 1 }], fighters: [], events: [],
    },
    currentBossId: "tiger", generation: 2, serverNow: 10000, nextAttackAt: 11000, heroAttack: 10, myDamage: 10, appliedDamage: 10,
  };
}

test("gameDemo plugin wires standard lobbyRpc queries and idempotent writes", async () => {
  const calls: unknown[] = [];
  const disposers: Array<() => void> = [];
  const lobbyRpc = {
    query: async (route: string, payload: unknown) => { calls.push(["query", route, payload]); return assets; },
    sendIdempotent: async (route: string, payload: unknown) => { calls.push(["write", route, payload]); return assets; },
  };
  createPluginModule().install({
    ports: { lobbyRpc, clock: { now: () => 0 }, ticker: { add: () => () => {} }, launch: { launch: async () => {} } },
    own: (dispose: () => void) => disposers.push(dispose),
  } as never);
  const runtime = getGameDemoRuntime()!;
  await runtime.assets();
  await runtime.initialize();
  await runtime.readMail(3);
  await runtime.attackBoss("tiger", 1, 2);
  await runtime.attackBoss("tiger", 1, 2, false);
  assert.deepEqual(calls, [
    ["query", GameDemoRpc.Assets, {}],
    ["write", GameDemoRpc.Initialize, {}],
    ["query", GameDemoRpc.MailRead, { mailId: 3 }],
    ["write", GameDemoRpc.BossAttack, { bossId: "tiger", runNumber: 1, generation: 2 }],
    ["write", GameDemoRpc.BossAttack, { bossId: "tiger", runNumber: 1, generation: 2, autoAttack: false }],
  ]);
  for (const dispose of disposers) dispose();
  assert.equal(getGameDemoRuntime(), null);
});

test("Boss room sync from the framework reaches the runtime subscriber until aborted", () => {
  const disposers: Array<() => void> = [];
  createPluginModule().install({
    ports: { lobbyRpc: {}, clock: { now: () => 0 }, ticker: { add: () => () => {} }, launch: { launch: async () => {} } },
    own: (dispose: () => void) => disposers.push(dispose),
  } as never);
  const revisions: number[] = [];
  const scope = new AbortController();
  lobbyDataSync.reset();
  getGameDemoRuntime()!.onBossSync((revision) => revisions.push(revision), scope.signal);
  lobbyDataSync.apply({ mods: { versions: { gameDemoBossRoom: 1 }, gameDemoBossRoom: { revision: 4 } } });
  scope.abort();
  lobbyDataSync.apply({ mods: { versions: { gameDemoBossRoom: 2 }, gameDemoBossRoom: { revision: 5 } } });
  assert.deepEqual(revisions, [4]);
  for (const dispose of disposers) dispose();
  lobbyDataSync.reset();
});

test("gameDemo renders authoritative resources and prevents overlapping actions", async () => {
  let finish: ((value: typeof assets) => void) | undefined;
  let grants = 0;
  const runtime = {
    shop: async () => ({ assets, day: "2026-09-22", purchased: { herb: 2, dew: 1 } }),
    initialize: () => { grants++; return new Promise((resolve) => { finish = resolve; }); },
  } as unknown as GameDemoRuntime;
  const logic = new GameDemoLogic(runtime);
  await logic.refresh();
  assert.match(logic.text, /5000/);
  assert.match(logic.text, /灵草：2/);
  const pending = logic.initialize();
  await logic.initialize();
  assert.equal(grants, 1);
  finish!(assets);
  await pending;
  assert.equal(logic.busy, false);
  runtime.initialize = async () => { throw new Error("unavailable"); };
  await logic.initialize();
  assert.match(logic.text, /未完成/);
  assert.equal(logic.busy, false);
});

test("season display distinguishes outside top 20 and binds early end to the displayed number", async () => {
  const calls: number[] = [];
  const state = {
    number: 42, phase: "running", startedAt: 0, endsAt: 600000, serverNow: 1000,
    top: [{ uid: 9, score: 10, rank: 1 }], myScore: 1, myRank: null, rewardedCount: 0,
  } as const;
  const logic = new GameDemoLogic({
    season: async () => state,
    endSeason: async (number: number) => { calls.push(number); return { ...state, phase: "settling" }; },
  } as unknown as GameDemoRuntime);
  await logic.selectPage("season");
  assert.match(logic.text, /20 名外/);
  await logic.endSeason();
  assert.deepEqual(calls, [42]);
  assert.match(logic.text, /正在结算/);
});

test("guild actions send numeric identities and keep player input", async () => {
  const calls: unknown[] = [];
  const state = { uid: 5, guild: null, invitations: [{ id: 11, guildId: 1, guildName: "仙盟", inviter: 2 }] };
  const logic = new GameDemoLogic({
    guild: async () => state,
    respondGuild: async (id: number, accept: boolean) => { calls.push([id, accept]); return { ...state, invitations: [] }; },
    createGuild: async (name: string) => { calls.push(name); return state; },
    inviteGuild: async (target: number) => { calls.push(target); return state; },
  } as unknown as GameDemoRuntime);
  await logic.selectPage("guild");
  assert.match(logic.text, /我的玩家 ID：5/);
  await logic.guildAction("reject", 11);
  assert.equal(logic.guildState!.invitations.length, 0);
  logic.guildName = "  新仙盟  ";
  await logic.guildAction("create");
  logic.inviteTarget = "abc";
  await logic.guildAction("invite");
  assert.match(logic.text, /数字玩家 ID/);
  logic.inviteTarget = " 8 ";
  await logic.guildAction("invite");
  assert.deepEqual(calls, [[11, false], "新仙盟", 8]);
});

test("Boss sync refetches only newer revisions and ignores stale attack receipts", async () => {
  let tick!: () => void;
  let sync!: (revision: number) => void;
  let queries = 0;
  let current = bossFixture();
  const logic = new GameDemoLogic({
    now: () => 10000,
    onTick: (callback: () => void) => { tick = callback; return () => {}; },
    onBossSync: (callback: (revision: number) => void) => { sync = callback; return () => {}; },
    enterBoss: async () => current,
    boss: async () => { queries++; return current; },
    attackBoss: async () => ({ ...current, room: { ...current.room, revision: 1, hp: 1000 }, generation: 1 }),
  } as unknown as GameDemoRuntime);
  logic.page = "boss";
  logic.watchClock(new AbortController().signal);
  await logic.enterBoss("tiger");
  sync(2);
  sync(3);
  tick();
  assert.equal(queries, 1);
  current = { ...current, room: { ...current.room, revision: 8, hp: 970 } };
  sync(8);
  tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(queries, 2);
  assert.equal(logic.bossState!.room.hp, 970);
  await logic.attackBoss();
  assert.equal(logic.bossState!.room.hp, 970);
  assert.equal(logic.bossState!.generation, 2);
});

test("the visual event cursor never replays history", () => {
  const events = new GameDemoBossEvents();
  const state = bossFixture();
  state.serverNow = 1000;
  state.room.events = [{ sequence: 1, at: 1000, uid: 7, kind: "sword", amount: 10 }];
  assert.deepEqual(events.take(state), []);
  state.room.events.push({ sequence: 2, at: 1000, uid: 8, kind: "counter", amount: 55 });
  assert.deepEqual(events.take(state).map((e) => e.sequence), [2]);
  assert.deepEqual(events.take(state), []);
  state.room.events.push({ sequence: 3, at: 1000, uid: 8, kind: "revive", amount: 150 });
  state.serverNow = 5000;
  assert.deepEqual(events.take(state), [], "old effects are skipped after a gap");
  state.room.runNumber = 2;
  state.room.events = [{ sequence: 1, at: 5000, uid: 7, kind: "sword", amount: 10 }];
  assert.deepEqual(events.take(state), [], "new run establishes its own baseline");
});

test("enter grants the starter gift then refreshes authoritative balances", async () => {
  const calls: string[] = [];
  const current = { ...assets, items: { ...assets.items, pill: 99, finePill: 100 } };
  const logic = new GameDemoLogic({
    initialize: async () => { calls.push("initialize"); return { ...assets, items: { ...assets.items, pill: 100, finePill: 100 } }; },
    shop: async () => { calls.push("shop"); return { assets: current, purchased: { herb: 0, dew: 0 }, day: "test" }; },
  } as unknown as GameDemoRuntime);
  await logic.enter();
  assert.deepEqual(calls, ["initialize", "shop"]);
  assert.equal(logic.assets?.items.pill, 99);
});

test("enter keeps grant failures visible while loading existing resources", async () => {
  const logic = new GameDemoLogic({
    initialize: async () => { throw new Error("disabled"); },
    shop: async () => ({ assets, purchased: { herb: 0, dew: 0 }, day: "test" }),
  } as unknown as GameDemoRuntime);
  await logic.enter();
  assert.equal(logic.assets, assets);
  assert.match(logic.errorText, /资源初始化未完成/);
  assert.equal(logic.busy, false);
});

for (const count of [1, 5, 10]) {
  test(`plays a two-second local animation for ${count} settled units without a follow-up RPC`, async () => {
    let now = 1000;
    let submissions = 0;
    let tick: (() => void) | undefined;
    const state: IGameDemoAlchemyState = {
      assets: { ...assets, items: { ...assets.items, pill: count } },
      batch: { id: 1, count, startedAt: 1000, pill: count, finePill: 0, score: count },
    };
    const runtime = {
      now: () => now,
      alchemy: async () => state,
      startAlchemy: async () => { submissions++; return state; },
      onTick: (callback: () => void) => { tick = callback; return () => {}; },
      onBossSync: () => () => {},
    } as unknown as GameDemoRuntime;
    const logic = new GameDemoLogic(runtime);
    logic.page = "alchemy";
    let renders = 0;
    logic.onChanged = () => { renders++; };
    logic.watchClock(new AbortController().signal);
    await logic.startAlchemy(count);
    assert.equal(logic.alchemyAnimationRemaining, 2000);
    assert.equal(logic.assets!.items.pill, count, "inventory is already authoritative");
    now = 2999;
    await logic.startAlchemy(count);
    assert.equal(submissions, 1);
    now = 3000; tick!();
    assert.equal(logic.alchemyAnimationRemaining, 0);
    assert.match(logic.text, /已入包/);
    const settledRenders = renders;
    now = 5000; tick!();
    assert.equal(renders, settledRenders, "idle pages must not rebuild buttons during a press");
    await logic.startAlchemy(count);
    assert.equal(submissions, 2);
  });
}
