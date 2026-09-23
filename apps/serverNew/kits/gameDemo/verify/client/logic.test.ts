import type { GameDemoBossState } from '../../../../../client/src/shared/kits/gameDemo/api/boss/index';
import assert from "node:assert/strict";
import test from "node:test";
import { GameDemoLogic } from "../../../../../client/src/kits/gameDemo/logic/GameDemoLogic";
import type { GameDemoRuntime } from "../../../../../client/src/kits/gameDemo/logic/gameDemoRuntime";
import { fetchGameDemoAssets, initializeGameDemo } from "../../../../../client/src/kits/gameDemo/api/growth/index";
import { GameDemoRpc } from "../../../../../client/src/shared/native/lobbyRpc/domains/gameDemo";
import type { GameDemoAlchemyState } from '../../../../../client/src/shared/kits/gameDemo/api/production/index';

const assets = { initialized: true, revision: 1, gold: 5000, items: { herb: 2, dew: 1, pill: 0, finePill: 0 } };

test("gameDemo uses the host query and durable idempotent port", async () => {
    const calls: unknown[] = [];
    const rpc = {
        query: async (route: string, payload: unknown) => { calls.push(["query", route, payload]); return assets; },
        sendIdempotent: async (route: string, payload: unknown) => { calls.push(["write", route, payload]); return assets; },
    };
    await fetchGameDemoAssets(rpc as Parameters<typeof fetchGameDemoAssets>[0]);
    await initializeGameDemo(rpc as Parameters<typeof initializeGameDemo>[0]);
    assert.deepEqual(calls, [["query", GameDemoRpc.Assets, {}], ["write", GameDemoRpc.Initialize, {}]]);
});

test('alchemy countdown uses the server anchor and forwards the persisted batch id', async () => {
    // Persisted v1 batches retain their original 10-second clock even after recipe tuning.
    let now = 50000;
    let tick: (() => void) | undefined;
    const calls: unknown[] = [];
    const state: GameDemoAlchemyState = {
        assets, revision: 1, serverNow: 1000,
        batch: { id: 'persisted-batch', configVersion: 1, count: 1, startedAt: 1000, durationMs: 10000, endsAt: 11000,
            phase: 'running', completed: 0, pill: 0, finePill: 0, refundedHerb: 0, refundedDew: 0, score: 0 },
    };
    const runtime = {
        now: () => now,
        onTick: (callback: () => void, signal: AbortSignal) => { tick = () => { if (!signal.aborted) callback(); }; return () => { tick = undefined; }; },
        alchemy: async () => state,
        finishAlchemy: async (batchId: string, early: boolean) => { calls.push([batchId, early]); return state; },
    } as GameDemoRuntime;
    const logic = new GameDemoLogic(runtime);
    const scope = new AbortController();
    logic.watchClock(scope.signal);
    await logic.selectPage('alchemy');
    assert.match(logic.text, /剩余 10 秒/);
    assert.equal(logic.errorText, '', 'unfinished-materials explanation is not an error');
    now += 4000;
    tick!();
    assert.match(logic.text, /剩余 6 秒/);
    now += 12000;
    tick!();
    assert.match(logic.text, /剩余 0 秒/);
    await logic.finishAlchemy(true);
    assert.deepEqual(calls, [['persisted-batch', true]]);
    scope.abort();
    const before = logic.text;
    now += 100000;
    tick!();
    assert.equal(logic.text, before);
});

test("gameDemo renders authoritative resources and prevents overlapping actions", async () => {
    let finish: ((value: typeof assets) => void) | undefined;
    let grants = 0;
    const runtime: GameDemoRuntime = {
        status: async () => ({ kit: "gameDemo", runtime: "serverNew", stage: "P0" }),
        assets: async () => assets,
        shop: async () => ({ assets, day: "2026-09-22", purchased: { herb: 2, dew: 1 } }),
        buy: async () => assets,
        mails: async () => ({ revision: 0, mails: [] }),
        readMail: async () => ({ revision: 0, mails: [] }),
        claimMail: async () => ({ assets, mailbox: { revision: 0, mails: [] } }),
        hero: async () => ({ assets, hero: { level: 1, exp: 0, attack: 10, revision: 0 } }),
        upgrade: async () => ({ assets, hero: { level: 1, exp: 10, attack: 10, revision: 1 }, consumed: 1 }),
        alchemy: async () => ({ assets, batch: null, revision: 0, serverNow: 1 }),
        startAlchemy: async () => ({ assets, batch: null, revision: 0, serverNow: 1 }),
        finishAlchemy: async () => ({ assets, batch: null, revision: 0, serverNow: 1 }),
        season: async () => ({ id: '1:1', phase: 'running', startedAt: 0, endsAt: 600000, serverNow: 1000, revision: 1, top: [], myScore: 0, myRank: null, deliveredRewards: 0, totalRewards: 0 }),
        endSeason: async () => ({ id: '1:1', phase: 'settling', startedAt: 0, endsAt: 1000, serverNow: 1000, revision: 2, top: [], myScore: 0, myRank: null, deliveredRewards: 0, totalRewards: 0 }),
        guild: async () => ({ uid: 'me', revision: 0, guild: null, invitations: [] }),
        createGuild: async () => ({ uid: 'me', revision: 0, guild: null, invitations: [] }),
        inviteGuild: async () => ({ uid: 'me', revision: 0, guild: null, invitations: [] }),
        respondGuild: async () => ({ uid: 'me', revision: 0, guild: null, invitations: [] }),
        leaveGuild: async () => ({ uid: 'me', revision: 0, guild: null, invitations: [] }),
        bosses: async () => ({ rooms: [], currentBossId: null, generation: 0 }),
        boss: async () => bossFixture(),
        enterBoss: async () => bossFixture(),
        leaveBoss: async () => ({ rooms: [], currentBossId: null, generation: 2 }),
        attackBoss: async () => bossFixture(),
        onBossChanged: () => () => {},
        now: () => 0,
        onTick: () => () => {},
        initialize: () => { grants++; return new Promise(resolve => { finish = resolve; }); },
        close: () => {},
    };
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


test('season display distinguishes outside top 20 and binds early end to the displayed instance', async () => {
    const calls: string[] = [];
    const state = { id: '1:42', phase: 'running', startedAt: 0, endsAt: 600000, serverNow: 1000, revision: 2,
        top: [{ uid: 'winner', score: 10, rank: 1 }], myScore: 1, myRank: null, deliveredRewards: 0, totalRewards: 1 } as const;
    const logic = new GameDemoLogic({
        season: async () => state,
        endSeason: async (id: string) => { calls.push(id); return { ...state, phase: 'settling' }; },
    } as unknown as GameDemoRuntime);
    await logic.selectPage('season');
    assert.match(logic.text, /20 名外/);
    await logic.endSeason();
    assert.deepEqual(calls, ['1:42']);
    assert.match(logic.text, /正在结算/);
});


test('guild actions preserve invitation identity and player input while awaiting the server', async () => {
    const calls: unknown[] = [];
    const state = { uid: 'player', revision: 1, guild: null, invitations: [{ id: 'targeted-invite', guildId: 'g', guildName: '仙盟', inviter: 'owner' }] };
    const logic = new GameDemoLogic({
        guild: async () => state,
        respondGuild: async (id: string, accept: boolean) => { calls.push([id, accept]); return { ...state, invitations: [] }; },
        createGuild: async (name: string) => { calls.push(name); return state; },
    } as unknown as GameDemoRuntime);
    await logic.selectPage('guild');
    assert.match(logic.text, /我的玩家 ID：player/);
    await logic.guildAction('reject', 'targeted-invite');
    assert.equal(logic.guildState!.invitations.length, 0);
    logic.guildName = '  新仙盟  ';
    await logic.guildAction('create');
    assert.deepEqual(calls, [['targeted-invite', false], '新仙盟']);
});

function bossFixture(): GameDemoBossState {
    return { room: { bossId: 'tiger', name: '山君', runId: '1:tiger:1', runNumber: 1, hp: 990, maxHp: 1000,
        phase: 'running', revision: 3, ownerEpoch: 1, respawnAt: 0, damage: [{ uid: 'me', damage: 10, rank: 1 }] },
        currentBossId: 'tiger', generation: 2, serverNow: 10000, nextAttackAt: 11000, heroAttack: 10, heroRevision: 0, myDamage: 10, appliedDamage: 10 };
}
test('Boss push handling rejects old rooms and versions, refetches gaps, and ignores stale attack receipts', async () => {
    let tick!: () => void;
    let queries = 0;
    let current = bossFixture();
    const logic = new GameDemoLogic({
        now: () => 10000,
        onTick: (callback: () => void) => { tick = callback; return () => {}; },
        onBossChanged: () => () => {},
        enterBoss: async () => current,
        boss: async () => { queries++; return current; },
        attackBoss: async () => ({ ...current, room: { ...current.room, revision: 1, hp: 1000 }, generation: 1 }),
    } as unknown as GameDemoRuntime);
    logic.page = 'boss';
    logic.watchClock(new AbortController().signal);
    await logic.enterBoss('tiger');
    const event = { bossId: 'tiger' as const, runId: '1:tiger:1', runNumber: 1, revision: 3, ownerEpoch: 1, generation: 2 };
    logic.receiveBossChange({ ...event, bossId: 'dragon', revision: 100 });
    logic.receiveBossChange({ ...event, generation: 1, revision: 100 });
    logic.receiveBossChange({ ...event, revision: 2 });
    tick(); assert.equal(queries, 1);
    current = { ...current, room: { ...current.room, revision: 8, hp: 970 } };
    logic.receiveBossChange({ ...event, revision: 8 });
    tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(queries, 2);
    assert.equal(logic.bossState!.room.hp, 970);
    await logic.attackBoss();
    assert.equal(logic.bossState!.room.hp, 970);
    assert.equal(logic.bossState!.generation, 2);
});

test('automatic combat sends explicit desired state and a visual cursor never replays history', async () => {
    const { attackGameDemoBoss } = await import('../../../../../client/src/kits/gameDemo/api/boss/index');
    const { GameDemoBossEvents } = await import('../../../../../client/src/kits/gameDemo/logic/GameDemoBossEvents');
    const calls: unknown[] = [];
    const rpc = { sendIdempotent: async (_route: string, payload: unknown) => { calls.push(payload); return {} as GameDemoBossState; } };
    await attackGameDemoBoss(rpc as Parameters<typeof attackGameDemoBoss>[0], 'tiger', 'run', 3, false);
    assert.deepEqual(calls, [{bossId:'tiger', runId:'run', generation:3, autoAttack:false}]);
    const events = new GameDemoBossEvents();
    const state: GameDemoBossState = { ...bossFixture(), serverNow:1000, room:{...bossFixture().room,runId:'one',battle:{sequence:1,players:[],nextCounterAt:0,events:[{sequence:1,at:1000,uid:'me',kind:'sword',amount:10}]}} };
    assert.deepEqual(events.take(state), []);
    state.room.battle!.sequence=2;state.room.battle!.events.push({sequence:2,at:1000,uid:'peer',kind:'counter',amount:55});
    assert.deepEqual(events.take(state).map(e=>e.sequence), [2]);
    assert.deepEqual(events.take(state), []);
    state.room.battle!.sequence=3;state.room.battle!.events.push({sequence:3,at:1000,uid:'peer',kind:'revive',amount:150});state.serverNow=5000;
    assert.deepEqual(events.take(state), [], 'old effects are skipped after a gap');
    state.room.runId='two';state.room.battle!.sequence=1;
    assert.deepEqual(events.take(state), [], 'new run establishes its own baseline');
});

test('enter grants the starter gift then refreshes authoritative balances', async () => {
    const calls: string[] = [];
    const current = { ...assets, items: { ...assets.items, pill: 99, finePill: 100 } };
    const runtime = {
        initialize: async () => { calls.push('initialize'); return { ...assets, items: { ...assets.items, pill: 100, finePill: 100 } }; },
        shop: async () => { calls.push('shop'); return { assets: current, purchased: { herb: 0, dew: 0 }, day: 'test' }; },
    } as unknown as GameDemoRuntime;
    const logic = new GameDemoLogic(runtime);
    await logic.enter();
    assert.deepEqual(calls, ['initialize', 'shop']);
    assert.equal(logic.assets?.items.pill, 99);
    assert.equal(logic.assets?.items.finePill, 100);
});

test('enter keeps grant failures visible while loading existing resources', async () => {
    const runtime = {
        initialize: async () => { throw new Error('disabled'); },
        shop: async () => ({ assets, purchased: { herb: 0, dew: 0 }, day: 'test' }),
    } as unknown as GameDemoRuntime;
    const logic = new GameDemoLogic(runtime);
    await logic.enter();
    assert.equal(logic.assets, assets);
    assert.match(logic.errorText, /资源初始化未完成/);
    assert.equal(logic.busy, false);
});

for (const count of [1, 5, 10]) {
    test(`plays a two-second local animation for ${count} settled units without a finish RPC`, async () => {
        let now = 1000;
        let submissions = 0;
        let tick: (() => void) | undefined;
        const state: GameDemoAlchemyState = {
            assets: { ...assets, items: { ...assets.items, pill: count } }, revision: 1, serverNow: 1000,
            batch: { id: 'instant', configVersion: 4, count, startedAt: 1000, durationMs: 0, endsAt: 1000,
                phase: 'claimed', completed: count, pill: count, finePill: 0, refundedHerb: 0, refundedDew: 0, score: count },
        };
        const runtime = {
            now: () => now, alchemy: async () => state,
            startAlchemy: async () => { submissions++; return state; },
            onTick: (callback: () => void) => { tick = callback; return () => {}; },
            finishAlchemy: () => { throw new Error('no collection required'); },
        } as unknown as GameDemoRuntime;
        const logic = new GameDemoLogic(runtime);
        logic.page = 'alchemy';
        let renders = 0;
        logic.onChanged = () => { renders++; };
        logic.watchClock(new AbortController().signal);
        await logic.startAlchemy(count);
        assert.equal(logic.alchemyAnimationRemaining, 2000);
        assert.equal(logic.assets!.items.pill, count, 'inventory is already authoritative');
        now = 2999;
        await logic.startAlchemy(count);
        assert.equal(submissions, 1);
        assert.equal(logic.alchemyAnimationRemaining, 1);
        now = 3000; tick!();
        assert.equal(logic.alchemyAnimationRemaining, 0);
        assert.match(logic.text, /已领/);
        const settledRenders = renders;
        now = 5000; tick!();
        assert.equal(renders, settledRenders, 'idle pages must not rebuild buttons during a press');
        const refreshed = new GameDemoLogic(runtime);
        await refreshed.selectPage('alchemy');
        assert.equal(refreshed.alchemyAnimationRemaining, 0);
        assert.equal(refreshed.assets!.items.pill, count);
        await logic.startAlchemy(count);
        assert.equal(submissions, 2);
    });
}
