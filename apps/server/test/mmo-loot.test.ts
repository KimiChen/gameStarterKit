/**
 * mmo kit inventory 面·掉落半边（MK2-B3，纯函数 / 假事务，⛔ 起房 ⛔ 连库）：rollLoot（按权重选条目 + 数量域；同随机流同结果；分布按权重；min == max 不耗流）、
 * lootClaimedPayloadOf 载荷闸、nearestLoot（半径 / 只挑 loot / 并列按 id）、grantItemInTx（首发：下一空槽 + 回执；同 opId 重放只回读回执零写入）。
 * 变异验证：rollLoot 不看权重（恒取首条）→ 「分布按权重」红；grantItemInTx 不查回执 → 「重放零写入」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MMO_PICKUP_RADIUS, lootClaimedPayloadOf, nearestLoot, rollLoot } from "@game/shared/kits/mmo/api/inventory/index";
import { GREYBOX_ITEMS, GREYBOX_LOOT_TABLES, GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import { grantItemInTx } from "../src/kits/mmo/persistence/items";

/** 确定性 LCG（只给单测；⛔ 与分线随机流同构无关） */
function lcg(seed: number): { next(): number } {
    let state = seed >>> 0;
    return { next: () => { state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0; return state / 4_294_967_296; } };
}
const tableOf = (id: string) => GREYBOX_PACK.lootTables.find((table) => table.lootTableId === id)!;

test("rollLoot：同随机流同结果；数量在 [countMin, countMax]；min == max 只耗一次流；分布按权重（8 : 1 ⇒ 凝胶 ≈ 89%）；空表 null", () => {
    const slime = tableOf(GREYBOX_LOOT_TABLES.slime);
    const a = Array.from({ length: 20 }, (_u, i) => rollLoot(slime, lcg(i)));
    const b = Array.from({ length: 20 }, (_u, i) => rollLoot(slime, lcg(i)));
    assert.deepEqual(a, b, "同种子同结果");
    for (const roll of a) {
        const entry = slime.entries.find((candidate) => candidate.itemId === roll!.itemId)!;
        assert.ok(roll!.count >= entry.countMin && roll!.count <= entry.countMax, `数量域 ${JSON.stringify(roll)}`);
    }
    const rng = lcg(42);
    let consumed = 0;
    const counting = { next: () => { consumed += 1; return rng.next(); } };
    rollLoot(tableOf(GREYBOX_LOOT_TABLES.boar), counting);
    assert.equal(consumed, 2, "1–3 张兽皮：选条目 + 数量各一次");
    consumed = 0;
    rollLoot({ lootTableId: "fixed", entries: [{ itemId: GREYBOX_ITEMS.blade, weight: 1, countMin: 1, countMax: 1 }] }, counting);
    assert.equal(consumed, 1, "min == max 不为数量耗流");
    const many = lcg(7);
    let gel = 0;
    const N = 20_000;
    for (let i = 0; i < N; i += 1) if (rollLoot(slime, many)!.itemId === GREYBOX_ITEMS.gel) gel += 1;
    assert.ok(Math.abs(gel / N - 8 / 9) < 0.02, `凝胶占比 ${(gel / N).toFixed(3)} ≈ 0.889`);
    assert.deepEqual(rollLoot(slime, { next: () => 1.5 }), { itemId: GREYBOX_ITEMS.blade, count: 1 }, "next 越界钳到 [0, 1) ⇒ 末条");
    assert.equal(rollLoot({ lootTableId: "empty", entries: [] }, lcg(1)), null);
});

test("lootClaimedPayloadOf：五个键齐全且形态合法；缺键 / 多键 / count 非正整数 / id 非法 ⇒ null", () => {
    const ok = { actorEntityId: "char:c1", actorCharacterId: "c1", lootId: "loot:3", itemTemplateId: "slime-gel", count: 2 };
    assert.deepEqual(lootClaimedPayloadOf(ok), ok);
    for (const bad of [null, [], {}, { ...ok, count: 0 }, { ...ok, count: 1.5 }, { ...ok, count: 10_000 }, { ...ok, extra: 1 }, { ...ok, lootId: "" }, { ...ok, actorCharacterId: "bad id" }, (({ count, ...rest }) => rest)(ok)]) {
        assert.equal(lootClaimedPayloadOf(bad), null, JSON.stringify(bad));
    }
});

test("nearestLoot：只挑 kind loot、半径内最近、并列按 id；没有 ⇒ null", () => {
    const entities = [
        { id: "slime-camp:0", kind: "creature", x: 1005, y: 1000 },
        { id: "loot:2", kind: "loot", x: 1030, y: 1000 },
        { id: "loot:1", kind: "loot", x: 1030, y: 1000 },
        { id: "loot:3", kind: "loot", x: 1100, y: 1000 },
    ];
    assert.equal(nearestLoot(entities, { x: 1000, y: 1000 })?.id, "loot:1", "并列按 id");
    assert.equal(nearestLoot(entities, { x: 1000, y: 1000 }, 20), null, "半径外");
    assert.equal(nearestLoot(entities, { x: 1090, y: 1000 }, MMO_PICKUP_RADIUS)?.id, "loot:3");
    assert.equal(nearestLoot([entities[0]!], { x: 1000, y: 1000 }), null, "怪不算");
});

function fakeItemTx(receipt: unknown | null, nextSlot: number) {
    const sql: [string, unknown[]][] = [];
    const tx = {
        sId: 3,
        query: async (statement: string, params: unknown[] = []) => {
            sql.push([statement, params]);
            if (statement.startsWith("SELECT result FROM k_mmo_receipt")) return receipt === null ? [] : [{ result: receipt }];
            if (statement.startsWith("SELECT COALESCE(MAX(slot)")) return [{ next_slot: nextSlot }];
            return { affectedRows: 1 };
        },
    };
    return { tx, sql };
}

test("grantItemInTx：首发 ⇒ 下一空槽插物品 + 回执（op_id = 幂等键）；同 opId 重放 ⇒ 只回读回执零写入；输入闸", async () => {
    const first = fakeItemTx(null, 4);
    const granted = await grantItemInTx(first.tx as never, { opId: "e1", characterId: "c1", itemId: "slime-gel", count: 2, kind: "lootClaimed" });
    assert.equal(granted.replayed, false);
    assert.match(granted.itemInstanceId, /^[0-9a-f-]{36}$/u);
    const inserts = first.sql.filter(([statement]) => statement.startsWith("INSERT"));
    assert.equal(inserts.length, 2, "物品 + 回执");
    assert.deepEqual(inserts[0]![1], [3, granted.itemInstanceId, "slime-gel", "c1", "bag", 4, 2], "下一空槽 4");
    assert.deepEqual(inserts[1]![1].slice(0, 4), [3, "e1", "c1", "lootClaimed"]);
    assert.deepEqual(JSON.parse(inserts[1]![1][4] as string), { itemInstanceId: granted.itemInstanceId, itemId: "slime-gel", count: 2 });
    const replay = fakeItemTx(JSON.stringify({ itemInstanceId: "existing", itemId: "slime-gel", count: 2 }), 9);
    assert.deepEqual(await grantItemInTx(replay.tx as never, { opId: "e1", characterId: "c1", itemId: "slime-gel", count: 2, kind: "lootClaimed" }), { itemInstanceId: "existing", replayed: true });
    assert.equal(replay.sql.filter(([statement]) => statement.startsWith("INSERT")).length, 0, "重放零写入");
    await assert.rejects(grantItemInTx(first.tx as never, { opId: "e2", characterId: "c1", itemId: "slime-gel", count: 0, kind: "lootClaimed" }), RangeError);
    await assert.rejects(grantItemInTx(first.tx as never, { opId: "e2", characterId: "c1", itemId: "slime-gel", count: 1, kind: "a-kind-that-is-too-long" }), TypeError);
});
