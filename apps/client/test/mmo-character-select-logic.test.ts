/**
 * mmo kit 选角页逻辑（MK0-B4，无头）：假 MmoRuntime 记录调用——加载槽位视图（角色 / 孤儿 / 空槽）、建角在途闸与默认名、进入世界带参
 * launch（有检查点图用检查点图，否则首图）、错误码翻译（⛔ 解析文案）、runtime 缺席一律不可操作。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MmoCharacterSelectLogic, describeMmoError } from "../src/kits/mmo/logic/MmoCharacterSelectLogic";
import type { MmoRuntime } from "../src/kits/mmo/logic/mmoRuntime";
import { defaultCharacterName } from "../src/kits/mmo/api/characters/index";
import type { ICharacterSummary } from "../src/shared/kits/mmo/api/characters/index";

const rook: ICharacterSummary = { characterId: "c1", personaId: "p1", slot: 0, name: "Rook", classId: "fighter", factionId: "dawn", level: 3, exp: 10, mapId: "greybox", status: "active" };
const fresh: ICharacterSummary = { characterId: "c2", personaId: "p2", slot: 2, name: "Newb", classId: "caster", factionId: "dusk", level: 1, exp: 0, mapId: null, status: "active" };

function fakeRuntime(options: { fail?: string } = {}) {
    const calls: unknown[][] = [];
    const characters: ICharacterSummary[] = [rook, fresh];
    const runtime: MmoRuntime = {
        selfUid: () => "u_alice_01",
        characters: async () => { calls.push(["characters"]); if (options.fail === "characters") throw Object.assign(new Error("boom"), { code: "TIMEOUT" }); return { characters: [...characters], orphans: [{ personaId: "p-orphan-xyz", slot: 3 }], maxSlots: 4 }; },
        createCharacter: async (input) => {
            calls.push(["createCharacter", input]);
            if (options.fail === "create") throw Object.assign(new Error("dup"), { code: "MMO_NAME_TAKEN" });
            return { character: { ...fresh, characterId: "c9", personaId: "p9", slot: input.slot, name: input.name, classId: input.classId, factionId: input.factionId } };
        },
        enterWorld: async () => { throw new Error("joiner 才调"); },
        launchWorld: async (characterId, mapId) => { calls.push(["launchWorld", characterId, mapId]); if (options.fail === "launch") throw Object.assign(new Error("full"), { code: "WORLD_LINE_UNAVAILABLE" }); },
        close: () => { calls.push(["close"]); },
    };
    return { runtime, calls };
}

test("加载：槽位视图 = 角色 / 空 / 角色 / 孤儿；未加载前不可建角 / 进入；刷新失败写提示保留旧列表", async () => {
    const { runtime } = fakeRuntime();
    const logic = new MmoCharacterSelectLogic(runtime);
    assert.equal(logic.canCreate(1), false);
    assert.equal(logic.canEnter("c1"), false);
    assert.ok(await logic.refresh());
    assert.deepEqual(logic.slots().map((slot) => slot.kind), ["character", "empty", "character", "orphan"]);
    assert.equal(logic.canCreate(1), true);
    assert.equal(logic.canCreate(0), false, "已有角色的槽不可建");
    assert.equal(logic.canEnter("c1"), true);
    assert.match(logic.describe(rook), /Rook · Lv3 fighter \/ dawn · greybox/u);
    const failing = new MmoCharacterSelectLogic(fakeRuntime({ fail: "characters" }).runtime);
    assert.equal(await failing.refresh(), false);
    assert.deepEqual(failing.currentNotice(), { kind: "error", text: "网络不可用，稍后重试（已发出的操作不会重复）" });
    assert.equal(new MmoCharacterSelectLogic(null).isReady(), false);
    assert.equal(await new MmoCharacterSelectLogic(null).refresh(), false);
});

test("建角：默认名过名字闸、战士 / dawn；成功后槽位变角色；名字撞 ⇒ 错误提示；在途闸", async () => {
    const { runtime, calls } = fakeRuntime();
    const logic = new MmoCharacterSelectLogic(runtime);
    await logic.refresh();
    const changes: boolean[] = [];
    logic.onChanged = () => { changes.push(logic.isBusy()); };
    const pending = logic.create(1);
    assert.equal(logic.isBusy(), true);
    assert.equal(await logic.create(1), false, "在途闸");
    assert.ok(await pending);
    const created = calls.find((call) => call[0] === "createCharacter")![1] as { slot: number; name: string; classId: string; factionId: string };
    assert.deepEqual([created.slot, created.classId, created.factionId], [1, "fighter", "dawn"]);
    assert.equal(created.name, defaultCharacterName(1, "u_alice_01"));
    assert.match(created.name, /^hero[A-Za-z0-9]{1,6}1$/u);
    assert.equal(logic.slots()[1]?.kind, "character");
    assert.equal(logic.currentNotice().kind, "success");
    assert.deepEqual(changes.slice(0, 1), [true]);
    const dup = new MmoCharacterSelectLogic(fakeRuntime({ fail: "create" }).runtime);
    await dup.refresh();
    assert.equal(await dup.create(1), false);
    assert.equal(dup.currentNotice().text, "这个名字已被占用，换一个");
});

test("进入世界：有检查点图回那张图，否则首图；带参 launch(characterId, mapId)；分线满翻译；未知角色 / 未加载不放行", async () => {
    const { runtime, calls } = fakeRuntime();
    const logic = new MmoCharacterSelectLogic(runtime);
    assert.equal(await logic.enter("c1"), false, "未加载");
    await logic.refresh();
    assert.ok(await logic.enter("c1"));
    assert.ok(await logic.enter("c2"));
    assert.deepEqual(calls.filter((call) => call[0] === "launchWorld"), [["launchWorld", "c1", "greybox"], ["launchWorld", "c2", "greybox"]]);
    assert.equal(await logic.enter("nope"), false);
    const full = new MmoCharacterSelectLogic(fakeRuntime({ fail: "launch" }).runtime);
    await full.refresh();
    assert.equal(await full.enter("c1"), false);
    assert.equal(full.currentNotice().text, "分线已满，稍后再试");
    logic.close();
    assert.deepEqual(calls.at(-1), ["close"]);
    assert.equal(describeMmoError({ code: "WHATEVER" }), "操作失败（WHATEVER）");
    assert.equal(describeMmoError(new Error("x")), "操作失败，请稍后重试");
});
