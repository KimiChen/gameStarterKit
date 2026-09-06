/** 衣柜 Logic 的无头单测（纯 TS，⛔ 不碰 cc）。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    VIEWED_SKINS_STORAGE_KEY,
    WardrobeLogic,
    describeWardrobeError,
    type WardrobeStorage,
} from "../src/plugins/snakeCosmetic/logic/WardrobeLogic";
import type { SnakeCosmeticRuntime } from "../src/plugins/snakeCosmetic/logic/snakeCosmeticRuntime";

const CATALOG = [
    { skinId: 1, displayName: "小红", rarity: 0, acquisition: "default", fragmentThreshold: null },
    { skinId: 2, displayName: "皮肤 2", rarity: 0, acquisition: "levelUnlock", fragmentThreshold: null },
    { skinId: 401, displayName: "皮肤 401", rarity: 2, acquisition: "fragmentCraft", fragmentThreshold: 10 },
    { skinId: 411, displayName: "皮肤 411", rarity: 3, acquisition: "fragmentCraft", fragmentThreshold: 300 },
] as const;

function profile(over: Partial<{ equippedSkinId: number; ownedSkinIds: number[]; fragmentBalances: Record<string, number> }> = {}) {
    return {
        version: 1,
        equippedSkinId: over.equippedSkinId ?? 1,
        ownedSkinIds: over.ownedSkinIds ?? [1],
        fragmentBalances: over.fragmentBalances ?? { "133": 0, "401": 0, "403": 0, "411": 0 },
    };
}

function runtime(over: Partial<SnakeCosmeticRuntime> = {}): SnakeCosmeticRuntime {
    return {
        getSnapshot: async () => ({ profile: profile(), catalog: [...CATALOG] }),
        equip: async () => ({ profile: profile() }),
        unlock: async () => ({ profile: profile() }),
        close: () => {},
        ...over,
    };
}

function memoryStorage(seed?: string): WardrobeStorage & { store: Map<string, string> } {
    const store = new Map<string, string>();
    if (seed !== undefined) store.set(VIEWED_SKINS_STORAGE_KEY, seed);
    return {
        store,
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => { store.set(key, value); },
    };
}

test("未装载 plugin：不就绪、行为 no-op、给出可读提示", async () => {
    const logic = new WardrobeLogic(null);
    assert.equal(logic.isReady(), false);
    assert.equal(logic.currentNotice().kind, "error");
    await logic.load();
    assert.equal(logic.isLoaded(), false);
    assert.equal(await logic.equip(2), false);
    assert.equal(await logic.craft(401), false);
});

test("load 拉快照并投影出行：稀有度中文名、获取方式、碎片进度、已装备标记", async () => {
    const logic = new WardrobeLogic(runtime({
        getSnapshot: async () => ({
            profile: profile({ ownedSkinIds: [1, 401], equippedSkinId: 401, fragmentBalances: { "133": 0, "401": 4, "403": 0, "411": 0 } }),
            catalog: [...CATALOG],
        }),
    }));
    await logic.load();
    assert.equal(logic.isLoaded(), true);
    const rows = logic.rows();
    assert.equal(rows.length, 4);
    const red = rows.find((r) => r.skinId === 1)!;
    assert.equal(red.displayName, "小红");
    assert.equal(red.rarityName, "普通");
    assert.equal(red.acquisitionText, "默认拥有");
    assert.equal(red.owned, true);
    const equipped = rows.find((r) => r.skinId === 401)!;
    assert.equal(equipped.equipped, true);
    assert.equal(equipped.canEquip, false, "已装备的不再显示可装备");
    assert.deepEqual(equipped.fragments, { balance: 4, threshold: 10 });
    const locked = rows.find((r) => r.skinId === 411)!;
    assert.equal(locked.owned, false);
    assert.equal(locked.rarityName, "传说");
    assert.equal(locked.canCraft, false, "碎片不足不可合成");
});

test("筛选：全部 / 已拥有 / 未拥有 / 可合成", async () => {
    const logic = new WardrobeLogic(runtime({
        getSnapshot: async () => ({
            profile: profile({ ownedSkinIds: [1], fragmentBalances: { "133": 0, "401": 10, "403": 0, "411": 0 } }),
            catalog: [...CATALOG],
        }),
    }));
    await logic.load();
    assert.equal(logic.rows().length, 4);
    logic.setFilter("owned");
    assert.deepEqual(logic.rows().map((r) => r.skinId), [1]);
    logic.setFilter("unowned");
    assert.deepEqual(logic.rows().map((r) => r.skinId), [2, 401, 411]);
    logic.setFilter("craftable");
    assert.deepEqual(logic.rows().map((r) => r.skinId), [401], "只有碎片够的才算可合成");
});

test("equip 成功后用返回的 profile 刷新，装备态跟着变", async () => {
    const logic = new WardrobeLogic(runtime({
        getSnapshot: async () => ({ profile: profile({ ownedSkinIds: [1, 2] }), catalog: [...CATALOG] }),
        equip: async (skinId) => ({ profile: profile({ ownedSkinIds: [1, 2], equippedSkinId: skinId }) }),
    }));
    await logic.load();
    assert.equal(await logic.equip(2), true);
    assert.equal(logic.equippedSkinId(), 2);
    assert.equal(logic.currentNotice().kind, "success");
    assert.equal(logic.rows().find((r) => r.skinId === 2)?.equipped, true);
});

test("craft 成功后拥有集合更新；失败按错误码翻译且 profile 不变", async () => {
    const logic = new WardrobeLogic(runtime({
        getSnapshot: async () => ({
            profile: profile({ fragmentBalances: { "133": 0, "401": 10, "403": 0, "411": 0 } }),
            catalog: [...CATALOG],
        }),
        unlock: async () => ({ profile: profile({ ownedSkinIds: [1, 401], fragmentBalances: { "133": 0, "401": 0, "403": 0, "411": 0 } }) }),
    }));
    await logic.load();
    assert.equal(await logic.craft(401), true);
    assert.equal(logic.rows().find((r) => r.skinId === 401)?.owned, true);

    const failing = new WardrobeLogic(runtime({
        unlock: async () => { throw Object.assign(new Error("x"), { code: "SNAKE_SKIN_FRAGMENTS_INSUFFICIENT" }); },
    }));
    await failing.load();
    const before = failing.equippedSkinId();
    assert.equal(await failing.craft(411), false);
    assert.equal(failing.currentNotice().kind, "error");
    assert.equal(failing.currentNotice().text, "碎片不足，先攒够再来");
    assert.equal(failing.equippedSkinId(), before, "失败不改 profile");
});

test("错误只按 code 分派，⛔ 不解析文案", () => {
    assert.equal(describeWardrobeError({ code: "SNAKE_SKIN_NOT_OWNED" }), "还没有这件皮肤，先合成或解锁");
    assert.equal(describeWardrobeError({ code: "SNAKE_SKIN_NOT_CRAFTABLE" }), "这件皮肤不支持碎片合成");
    assert.equal(describeWardrobeError({ code: "CONN_LOST" }), "网络不可用，稍后重试");
    assert.match(describeWardrobeError({ code: "WEIRD" }), /WEIRD/);
    assert.equal(describeWardrobeError(null), "操作失败，请稍后重试");
});

test("红点：设备本地记录已查看；坏值与写失败都降级为内存态，⛔ 不影响服务端 profile", async () => {
    const storage = memoryStorage();
    const logic = new WardrobeLogic(runtime({
        getSnapshot: async () => ({ profile: profile({ ownedSkinIds: [1, 2] }), catalog: [...CATALOG] }),
        equip: async (skinId) => ({ profile: profile({ ownedSkinIds: [1, 2], equippedSkinId: skinId }) }),
    }), storage);
    await logic.load();
    assert.equal(logic.rows().find((r) => r.skinId === 2)?.isNew, true, "拥有但没看过 → 红点");
    await logic.equip(2);
    assert.equal(logic.rows().find((r) => r.skinId === 2)?.isNew, false);
    assert.equal(storage.store.get(VIEWED_SKINS_STORAGE_KEY), "[2]");

    // 坏值：解析失败退回空集合，不抛。
    const corrupt = new WardrobeLogic(runtime(), memoryStorage("{not json"));
    await corrupt.load();
    assert.equal(corrupt.isLoaded(), true);

    // 写失败：只降级为内存态。
    const failing: WardrobeStorage = {
        getItem: () => null,
        setItem: () => { throw new Error("quota"); },
    };
    const resilient = new WardrobeLogic(runtime(), failing);
    assert.doesNotThrow(() => resilient.markViewed(401));
});

test("load 失败：给出错误提示且不进入已加载态", async () => {
    const logic = new WardrobeLogic(runtime({
        getSnapshot: async () => { throw Object.assign(new Error("x"), { code: "TIMEOUT" }); },
    }));
    await logic.load();
    assert.equal(logic.isLoaded(), false);
    assert.equal(logic.currentNotice().text, "网络不可用，稍后重试");
});
