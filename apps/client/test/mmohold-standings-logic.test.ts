import assert from "node:assert/strict";
import { test } from "node:test";
import { MmoHoldStandingsLogic, describeHoldOwner, describeStandingsError } from "../src/plugins/mmohold/logic/MmoHoldStandingsLogic";
import { MmoHoldEntryLogic } from "../src/plugins/mmohold/logic/MmoHoldEntryLogic";
import { getMmoHoldRuntime, setMmoHoldRuntime, type MmoHoldRuntime } from "../src/plugins/mmohold/logic/mmoHoldRuntime";
import type { IMmoHoldStandingsRes } from "../src/shared/protocol/lobbyRpc/domains/mmohold";
import type { ICharacterSummary } from "../src/kits/mmo/api/characters/index";
import { createPluginModule } from "../src/plugins/mmohold/index";
import type { AppPorts } from "../src/app/ports";

const board: IMmoHoldStandingsRes = {
    mapId: "holdRidge", packId: "holdRidge",
    lines: Array.from({ length: 8 }, (_, index) => ({ instanceId: `wi_00000${index}`, rev: index, tick: index * 20, scores: { dawn: index, dusk: 2 }, owners: { pointA: "dawn", pointB: index % 2 ? "neutral" : "dusk" } })),
    totalScores: { dawn: 28, dusk: 16 },
};
const character: ICharacterSummary = { characterId: "char_dawn", personaId: "persona_dawn", slot: 0, name: "HeroDawn", classId: "fighter", factionId: "dawn", level: 1, exp: 0, mapId: null, status: "active" };
function makeRuntime(overrides: Partial<MmoHoldRuntime> = {}): MmoHoldRuntime & { closed: number; entered: string[] } {
    const runtime = {
        closed: 0, entered: [] as string[], selfUid: () => "user_abcdef",
        standings: async () => board,
        characters: async () => ({ characters: [character], orphans: [], maxSlots: 4 }),
        createCharacter: async (input: Parameters<MmoHoldRuntime["createCharacter"]>[0]) => ({ character: { ...character, ...input, characterId: `char_${input.factionId}_${input.slot}`, personaId: `persona_${input.slot}` } }),
        enter: async (characterId: string) => { runtime.entered.push(characterId); },
        close: () => { runtime.closed += 1; },
        ...overrides,
    };
    return runtime;
}

test("比分加载：两阵营合计、据点与领先方、三行分页覆盖全部、刷新缩页与空态", async () => {
    let value = board;
    const logic = new MmoHoldStandingsLogic(makeRuntime({ standings: async () => value }));
    let changed = 0;
    logic.onChanged = () => { changed += 1; };
    assert.equal(logic.isLoaded(), false);
    assert.equal(logic.emptyText(), "等待加载战况…");
    assert.equal(logic.mapId(), "holdRidge");
    assert.equal(await logic.refresh(), true);
    assert.equal(changed, 2);
    assert.deepEqual(logic.totalScores(), { dawn: 28, dusk: 16 });
    assert.equal(logic.pageCount(), 3);
    assert.deepEqual(logic.rows().map((row) => row.leader), ["dusk", "dusk", "neutral"]);
    assert.equal(logic.rows()[0]!.checkpoint, "尚无检查点");
    assert.equal(logic.rows()[0]!.ownership, "A 曙光 · B 暮光");
    assert.equal(logic.rows()[1]!.ownership, "A 曙光 · B 中立");
    logic.movePage(1);
    assert.equal(logic.rows()[0]!.label, "分线 4 · …000003");
    assert.equal(logic.rows()[0]!.leader, "dawn");
    assert.equal(logic.rows()[0]!.checkpoint, "检查点 3 · tick 60");
    logic.movePage(999);
    assert.deepEqual(logic.rows().map((row) => row.instanceId), ["wi_000006", "wi_000007"]);
    logic.movePage(0.5);
    assert.equal(logic.pageIndex(), 2);
    value = { ...board, lines: [], totalScores: { dawn: 0, dusk: 0 } };
    assert.equal(await logic.refresh(), true);
    assert.equal(logic.pageIndex(), 0);
    assert.equal(logic.pageCount(), 1);
    assert.equal(logic.currentNotice().text, "holdRidge 还没有开过分线");
    assert.deepEqual(logic.rows(), []);
    assert.equal(logic.emptyText(), "尚无分线战况");
    logic.movePage(-1);
    assert.equal(logic.pageIndex(), 0);
    assert.equal(describeHoldOwner("neutral"), "中立");
});

test("比分错误 / 在途：保留旧数据，code 翻译，未装载拒绝，close 转发", async () => {
    let fail = false;
    let resolve!: (value: IMmoHoldStandingsRes) => void;
    const runtime = makeRuntime({ standings: () => fail ? Promise.reject({ code: "TIMEOUT" }) : new Promise((done) => { resolve = done; }) });
    const logic = new MmoHoldStandingsLogic(runtime);
    const pending = logic.refresh();
    assert.equal(logic.isBusy(), true);
    assert.equal(logic.emptyText(), "读取战况中…");
    assert.equal(await logic.refresh(), false);
    resolve(board);
    assert.equal(await pending, true);
    fail = true;
    assert.equal(await logic.refresh(), false);
    assert.deepEqual(logic.totalScores(), board.totalScores, "失败保留旧数据");
    assert.equal(logic.rows().length, 3);
    assert.equal(logic.currentNotice().text, "网络不可用，稍后刷新");
    assert.equal(describeStandingsError({ code: "CONN_LOST" }), "网络不可用，稍后刷新");
    assert.equal(describeStandingsError({ code: "RATE_LIMITED" }), "读取失败（RATE_LIMITED）");
    assert.equal(describeStandingsError(new Error("private details")), "读取失败，请稍后重试");
    logic.close();
    assert.equal(runtime.closed, 1);
    const absent = new MmoHoldStandingsLogic(null);
    assert.equal(absent.isReady(), false);
    assert.equal(await absent.refresh(), false);
    assert.equal(absent.currentNotice().text, "据点战比分未就绪");
    assert.equal(absent.emptyText(), "战况暂不可用，请刷新重试");
    absent.close();
    const failedFirst = new MmoHoldStandingsLogic(makeRuntime({ standings: async () => { throw { code: "INTERNAL" }; } }));
    assert.equal(await failedFirst.refresh(), false);
    assert.equal(failedFirst.emptyText(), "战况暂不可用，请刷新重试");
});

test("据点入口：空槽跳过孤儿；两阵营建角；只准 active 已载角色进入，成功后关闭", async () => {
    const created: Parameters<MmoHoldRuntime["createCharacter"]>[0][] = [];
    const runtime = makeRuntime({
        characters: async () => ({ characters: [character], orphans: [{ personaId: "orphan", slot: 1 }], maxSlots: 4 }),
        createCharacter: async (input) => { created.push(input); return { character: { ...character, ...input, characterId: `char_${input.factionId}_${input.slot}` } }; },
    });
    const entry = new MmoHoldEntryLogic(runtime);
    assert.equal(entry.canEnter(character.characterId), false);
    assert.equal(await entry.refresh(), true);
    assert.equal(entry.emptySlot(), 2);
    assert.equal(await entry.create("dusk"), true);
    assert.equal(await entry.create("dawn"), true);
    assert.deepEqual(created.map((input) => [input.slot, input.factionId, input.classId]), [[2, "dusk", "fighter"], [3, "dawn", "fighter"]]);
    assert.equal(entry.canCreate(), false);
    assert.equal(await entry.create("dawn"), false);
    assert.equal(await entry.enter("unknown"), false);
    assert.equal(await entry.enter("char_dusk_2"), true);
    assert.deepEqual(runtime.entered, ["char_dusk_2"]);
    assert.equal(runtime.closed, 1);
    const inactive = new MmoHoldEntryLogic(makeRuntime({ characters: async () => ({ characters: [{ ...character, status: "inactive" }], orphans: [], maxSlots: 4 }) }));
    await inactive.refresh();
    assert.equal(inactive.canEnter(character.characterId), false);
    const absent = new MmoHoldEntryLogic(null);
    assert.equal(await absent.refresh(), false);
    assert.equal(await absent.create("dawn"), false);
    assert.equal(await absent.enter("unknown"), false);
});

test("据点入口：建角在途挡重复，失败释放闸；launch 失败保留页；runtime 身份守卫", async () => {
    let reject!: (reason: unknown) => void;
    const runtime = makeRuntime({ createCharacter: () => new Promise((_resolve, fail) => { reject = fail; }), enter: async () => { throw { code: "WORLD_LINE_UNAVAILABLE" }; } });
    const entry = new MmoHoldEntryLogic(runtime);
    await entry.refresh();
    const pending = entry.create("dusk");
    assert.equal(entry.isBusy(), true);
    assert.equal(await entry.create("dusk"), false);
    assert.equal(await entry.refresh(), false);
    reject({ code: "TIMEOUT" });
    assert.equal(await pending, false);
    assert.equal(entry.canCreate(), true);
    assert.equal(await entry.enter(character.characterId), false);
    assert.equal(runtime.closed, 0);
    assert.match(entry.notice(), /WORLD_LINE_UNAVAILABLE/);
    const disposeOld = setMmoHoldRuntime(runtime);
    const second = makeRuntime();
    const disposeNew = setMmoHoldRuntime(second);
    disposeOld();
    assert.equal(getMmoHoldRuntime(), second);
    disposeNew();
    assert.equal(getMmoHoldRuntime(), null);
});

test("module 接线：公共 characters RPC、幂等建角、standings 自有域与带参 holdRidge launch", async () => {
    const queries: unknown[] = [];
    const writes: unknown[] = [];
    const launches: unknown[] = [];
    const closes: unknown[] = [];
    const disposers: (() => void)[] = [];
    const ports = {
        session: { getUserId: () => "user_abcdef" },
        lobbyRpc: {
            query: async (type: string, request: unknown) => { queries.push([type, request]); return type === "mmohold.standings" ? board : { characters: [character], orphans: [], maxSlots: 4 }; },
            sendIdempotent: async (type: string, request: unknown) => { writes.push([type, request]); return { character }; },
        },
        launch: { launch: async (target: unknown) => { launches.push(target); } },
        navigation: { close: (route: string) => { closes.push(route); } },
    } as unknown as AppPorts;
    await createPluginModule().install({ pluginId: "mmohold", ports, signal: new AbortController().signal, appGeneration: 1, own: (dispose) => { disposers.push(dispose); } });
    const runtime = getMmoHoldRuntime()!;
    await runtime.standings();
    await runtime.characters();
    const input = { slot: 1, name: "HoldHero", classId: "fighter", factionId: "dusk" } as const;
    await runtime.createCharacter(input);
    await runtime.enter(character.characterId);
    runtime.close();
    assert.deepEqual(queries, [["mmohold.standings", {}], ["mmo.characters", {}]]);
    assert.deepEqual(writes, [["mmo.createCharacter", input]]);
    assert.deepEqual(launches, [{ kind: "gameplay", gameplayId: "mmoWorld", payload: { characterId: character.characterId, mapId: "holdRidge" } }]);
    assert.deepEqual(closes, ["standings"]);
    assert.equal(runtime.selfUid(), "user_abcdef");
    assert.equal(disposers.length, 1);
    disposers[0]!();
    assert.equal(getMmoHoldRuntime(), null);
});
