/**
 * mmo kit inventory 面·物品半边（MK3-B1；内存 ItemStore 钉 SQL 同语义，⛔ 连库）：shared 纯函数（equipSlotOf / checkEquip / freeSlots / planGrant 并入堆叠 → 空格 → mail →
 * 都满 null / bagAttrs / bagSignature / validateBagWire）；grantItem（首发计划落地 + 回执；同 opId 重放零写入；未知模板 / 邮箱也满 ⇒ MmoInventoryError）；
 * moveItem（bag 内移动、装备槽类型 / 职业 / 堆叠拒、目标有物 ⇒ 同模板合并或交换（equip 被换下的必须能待在原格、mail 不能被换入）、并发改同一件 ⇒ conflict、no-op 也写回执）；
 * claimLoot = grantItem(opId = eventId)；bagOf / moveItemFor 的账号归属（别人的角色 ⇒ forbidden）。
 * 变异验证：planGrant 不先并入堆叠 → 「先并入」红；moveItem 交换不查被换下件能否待在 equip → 「occupied」红；ItemStore.update 不比对 rev → 「conflict」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MMO_BAG_SLOTS, MMO_MAIL_SLOTS, bagAttrs, bagSignature, checkEquip, equipSlotOf, freeSlots, planGrant, validateBagWire, type IMmoBagItemWire,
} from "@game/shared/kits/mmo/api/inventory/index";
import { GREYBOX_ITEMS, GREYBOX_PACK } from "@game/shared/kits/mmo/content/greybox";
import { indexContentPack, validateContentPack } from "@game/shared/kits/mmo/api/content/index";
import { WireValidationError } from "@game/shared/protocol/http";
import { MmoInventoryError, bagOf, claimLoot, grantItem, moveItem, moveItemFor, readBag, type InventoryDeps } from "../src/kits/mmo/api/inventory/index";
import type { ItemRow, ItemStore } from "../src/kits/mmo/persistence/items";
import type { MmoCharacterRow } from "../src/kits/mmo/persistence/characters";
import { CONTRIBUTED_BLADE_ID, installInventoryContributionForTest } from "./mmo-inventory-fixture";
import { defaultInventoryDeps } from "../src/kits/mmo/api/inventory/index";

installInventoryContributionForTest();

const CONTENT = indexContentPack(validateContentPack(GREYBOX_PACK));
const template = (itemId: string) => CONTENT.itemById.get(itemId)!;

/** 内存 ItemStore：与 sqlItemStore 同语义（rev CAS、tmp 位置、回执）。 */
function memoryStore(seed: readonly Omit<ItemRow, "rev">[] = []) {
    const rows = new Map<string, ItemRow>(seed.map((row) => [row.id, { ...row, rev: 0 }]));
    const receipts = new Map<string, { characterId: string; kind: string; result: unknown }>();
    let ids = 0;
    const writes: string[] = [];
    const store: ItemStore = {
        receipt: async (opId) => receipts.get(opId)?.result ?? null,
        writeReceipt: async (opId, characterId, kind, result) => { writes.push(`receipt:${opId}`); receipts.set(opId, { characterId, kind, result }); },
        list: async (characterId) => [...rows.values()].filter((row) => row.characterId === characterId).sort((a, b) => a.location.localeCompare(b.location) || a.slot - b.slot),
        insert: async (row) => {
            if ([...rows.values()].some((other) => other.characterId === row.characterId && other.location === row.location && other.slot === row.slot)) throw new Error(`1062 唯一键冲突 ${row.location}:${row.slot}`);
            writes.push(`insert:${row.id}`);
            rows.set(row.id, { ...row, rev: 0 });
        },
        update: async (id, rev, patch) => {
            const row = rows.get(id);
            if (!row || row.rev !== rev) return false;
            const next = { ...row, ...patch, rev: row.rev + 1 };
            if ((patch.location !== undefined || patch.slot !== undefined) && [...rows.values()].some((other) => other.id !== id && other.characterId === row.characterId && other.location === next.location && other.slot === next.slot)) throw new Error(`1062 唯一键冲突 ${next.location}:${next.slot}`);
            writes.push(`update:${id}`);
            rows.set(id, next);
            return true;
        },
        remove: async (id, rev) => { const row = rows.get(id); if (!row || row.rev !== rev) return false; writes.push(`remove:${id}`); rows.delete(id); return true; },
        newId: () => `i${(ids += 1)}`,
    };
    return { store, rows, receipts, writes };
}
const item = (id: string, itemId: string, location: "bag" | "equip" | "mail", slot: number, count = 1, characterId = "c1"): Omit<ItemRow, "rev"> => ({ id, characterId, itemId, location, slot, count });
const wire = (id: string, itemId: string, location: "bag" | "equip" | "mail", slot: number, count = 1, rev = 0): IMmoBagItemWire => ({ id, itemId, count, location, slot, rev });

test("多包库存：默认发放与装备解析贡献包模板，仍能交换回内置装备", async () => {
    const m = memoryStore();
    const granted = await grantItem(m.store, { opId: "contributed-reward", characterId: "c1", itemId: CONTRIBUTED_BLADE_ID, count: 1, kind: "grantItem" });
    const blade = granted.bag.items[0]!;
    assert.equal(blade.itemId, CONTRIBUTED_BLADE_ID);
    assert.equal(defaultInventoryDeps.content().itemById.get(CONTRIBUTED_BLADE_ID)?.attrs.attack, 17, "Lobby 默认依赖也使用全区模板");
    const equipped = await moveItem(m.store, { opId: "contributed-equip", characterId: "c1", classId: "fighter", itemInstanceId: blade.id, location: "equip", slot: 0 });
    assert.equal(equipped.bag.items[0]!.location, "equip");
    const old = await grantItem(m.store, { opId: "builtin-reward", characterId: "c1", itemId: GREYBOX_ITEMS.blade, count: 1, kind: "grantItem" });
    const builtin = old.bag.items.find((entry) => entry.itemId === GREYBOX_ITEMS.blade)!;
    const swapped = await moveItem(m.store, { opId: "builtin-equip", characterId: "c1", classId: "fighter", itemInstanceId: builtin.id, location: "equip", slot: 0 });
    assert.equal(swapped.bag.items.find((entry) => entry.itemId === CONTRIBUTED_BLADE_ID)?.location, "bag");
    assert.equal(swapped.bag.items.find((entry) => entry.itemId === GREYBOX_ITEMS.blade)?.location, "equip");
});

test("shared：equipSlotOf / checkEquip（槽位类型 / 职业 / 单件）；freeSlots；planGrant 先并入同模板堆叠、再背包空格、再 mail、都满 ⇒ null；bagAttrs；bagSignature；validateBagWire", () => {
    assert.deepEqual([equipSlotOf("weapon"), equipSlotOf("armor"), equipSlotOf("trinket"), equipSlotOf("none"), equipSlotOf("consumable")], [0, 1, 2, null, null]);
    assert.deepEqual([checkEquip(template(GREYBOX_ITEMS.blade), "fighter", 1), checkEquip(template(GREYBOX_ITEMS.blade), "caster", 1), checkEquip(template(GREYBOX_ITEMS.blade), "fighter", 2), checkEquip(template(GREYBOX_ITEMS.gel), "fighter", 1)],
        [null, "class-mismatch", "stacked", "not-equippable"]);
    assert.deepEqual(freeSlots([wire("a", "x", "bag", 0), wire("b", "x", "bag", 2)], "bag", 4), [1, 3]);
    const gel = template(GREYBOX_ITEMS.gel); // stackMax 99
    const plan = planGrant([wire("s1", GREYBOX_ITEMS.gel, "bag", 3, 98), wire("s2", GREYBOX_ITEMS.gel, "bag", 0, 50), wire("o", GREYBOX_ITEMS.hide, "bag", 1)], gel, 60)!;
    assert.deepEqual(plan, { merges: [{ id: "s2", count: 49 }, { id: "s1", count: 1 }], inserts: [{ location: "bag", slot: 2, count: 10 }] }, "先并入（slot 升序）再空格");
    const fullBag = Array.from({ length: MMO_BAG_SLOTS }, (_u, slot) => wire(`b${slot}`, GREYBOX_ITEMS.hide, "bag", slot, 20));
    assert.deepEqual(planGrant(fullBag, gel, 150), { merges: [], inserts: [{ location: "mail", slot: 0, count: 99 }, { location: "mail", slot: 1, count: 51 }] }, "背包满 ⇒ 溢出进 mail（按 stackMax 分堆）");
    const fullMail = Array.from({ length: MMO_MAIL_SLOTS }, (_u, slot) => wire(`m${slot}`, GREYBOX_ITEMS.hide, "mail", slot, 20));
    assert.equal(planGrant([...fullBag, ...fullMail], gel, 1), null, "都满 ⇒ null");
    assert.equal(planGrant([], gel, 0), null);
    assert.deepEqual(bagAttrs([template(GREYBOX_ITEMS.blade), template(GREYBOX_ITEMS.gel)]), { attack: 2, defense: 0, hpMax: 0 });
    const view = { rev: 2, items: [wire("b", GREYBOX_ITEMS.gel, "mail", 0, 3, 2), wire("a", GREYBOX_ITEMS.blade, "equip", 0, 1, 1)] };
    assert.equal(bagSignature(view), "2|a:rusty-blade:equip:0:1:1,b:slime-gel:mail:0:3:2", "签名按 bag → equip → mail、slot 排序");
    assert.equal(bagSignature(null), "");
    assert.deepEqual(validateBagWire(view).items.map((entry) => entry.id), ["b", "a"], "wire 校验保持输入序");
    assert.throws(() => validateBagWire({ rev: 1, items: [wire("a", "x", "bag", 0), wire("b", "y", "bag", 0)] }), WireValidationError, "同格两件");
    assert.throws(() => validateBagWire({ rev: 1, items: [wire("a", "x", "bag", 0), wire("a", "y", "bag", 1)] }), WireValidationError, "同 id 两件");
    assert.throws(() => validateBagWire({ rev: 1, items: [{ ...wire("a", "x", "bag", 0), extra: 1 }] }), WireValidationError, "多键");
});

test("grantItem：首发按计划并入 + 插入 + 回执；同 opId 重放零写入；未知模板 / 邮箱也满 ⇒ MmoInventoryError；claimLoot = grantItem(opId = eventId)", async () => {
    const m = memoryStore([item("s1", GREYBOX_ITEMS.gel, "bag", 0, 98)]);
    const granted = await grantItem(m.store, { opId: "e1", characterId: "c1", itemId: GREYBOX_ITEMS.gel, count: 3, kind: "lootClaimed" }, CONTENT);
    assert.equal(granted.replayed, false);
    assert.deepEqual(granted.bag.items.map((entry) => [entry.id, entry.slot, entry.count, entry.rev]), [["s1", 0, 99, 1], ["i1", 1, 2, 0]], "并入 1 + 新堆 2");
    assert.deepEqual(m.receipts.get("e1")?.result, { itemId: GREYBOX_ITEMS.gel, count: 3, merged: ["s1"], inserted: ["i1"] });
    const before = m.writes.length;
    const replay = await grantItem(m.store, { opId: "e1", characterId: "c1", itemId: GREYBOX_ITEMS.gel, count: 3, kind: "lootClaimed" }, CONTENT);
    assert.deepEqual([replay.replayed, m.writes.length, replay.bag.items.length], [true, before, 2], "重放零写入");
    await assert.rejects(grantItem(m.store, { opId: "e2", characterId: "c1", itemId: "nope", count: 1, kind: "lootClaimed" }, CONTENT), (error: unknown) => error instanceof MmoInventoryError && error.code === "unknown-item");
    const full = memoryStore([
        ...Array.from({ length: MMO_BAG_SLOTS }, (_u, slot) => item(`b${slot}`, GREYBOX_ITEMS.blade, "bag", slot)),
        ...Array.from({ length: MMO_MAIL_SLOTS }, (_u, slot) => item(`m${slot}`, GREYBOX_ITEMS.blade, "mail", slot)),
    ]);
    await assert.rejects(grantItem(full.store, { opId: "e3", characterId: "c1", itemId: GREYBOX_ITEMS.hide, count: 1, kind: "lootClaimed" }, CONTENT), (error: unknown) => error instanceof MmoInventoryError && error.code === "mail-full");
    assert.equal(full.receipts.size, 0, "拒绝不写回执");
    const claimed = await claimLoot(memoryStore().store, { actorEntityId: "char:c1", actorCharacterId: "c1", lootId: "loot:1", itemTemplateId: GREYBOX_ITEMS.hide, count: 2 }, "wev_1", CONTENT);
    assert.deepEqual(claimed.bag.items.map((entry) => [entry.itemId, entry.count, entry.location]), [[GREYBOX_ITEMS.hide, 2, "bag"]]);
    await assert.rejects(grantItem(m.store, { opId: "e4", characterId: "c1", itemId: GREYBOX_ITEMS.gel, count: 0, kind: "lootClaimed" }, CONTENT), RangeError);
});

test("moveItem：bag 内移动 / 装备 / 卸下；装备拒（槽位类型 / 职业 / 堆叠 / 错格）；目标有物 ⇒ 同模板合并或交换；equip 被换下的必须能待在原格、mail 不能被换入；no-op 也写回执；并发改同一件 ⇒ conflict", async () => {
    const m = memoryStore([item("blade", GREYBOX_ITEMS.blade, "bag", 0), item("gel", GREYBOX_ITEMS.gel, "bag", 1, 5), item("hide", GREYBOX_ITEMS.hide, "bag", 2, 3), item("gel2", GREYBOX_ITEMS.gel, "mail", 0, 97)]);
    const move = (opId: string, itemInstanceId: string, location: "bag" | "equip", slot: number, classId = "fighter") => moveItem(m.store, { opId, characterId: "c1", classId, itemInstanceId, location, slot }, CONTENT);
    const at = (id: string) => { const row = m.rows.get(id); return row ? [row.location, row.slot, row.count] : null; };
    await move("m1", "blade", "bag", 5);
    assert.deepEqual(at("blade"), ["bag", 5, 1], "bag 内移动");
    await move("m2", "blade", "equip", 0);
    assert.deepEqual(at("blade"), ["equip", 0, 1], "装备到武器格");
    for (const [label, run, code] of [
        ["法师不能拿锈剑", () => move("x1", "blade", "equip", 0, "caster"), "class-mismatch"],
        ["凝胶不可装备", () => move("x2", "gel", "equip", 0), "not-equippable"],
        ["武器进防具格", () => move("x3", "blade", "equip", 1), "bad-slot"],
        ["bag 格越界", () => move("x4", "gel", "bag", 24), "bad-slot"],
        ["不存在的件", () => move("x5", "nope", "bag", 0), "item-not-found"],
    ] as const) {
        await assert.rejects(run(), (error: unknown) => error instanceof MmoInventoryError && error.code === code, label);
    }
    assert.equal([...m.receipts.keys()].some((key) => key.startsWith("x")), false, "拒绝不写回执");
    // 同模板合并：mail 的 97 凝胶挪到 bag:1（已有 5，stackMax 99）⇒ 并入 94，余 3 留在 mail
    await move("m3", "gel2", "bag", 1);
    assert.deepEqual([at("gel"), at("gel2")], [["bag", 1, 99], ["mail", 0, 3]], "合并到上限，余量留原地");
    // 交换：blade(equip:0) → bag:2（hide 在那）⇒ hide 得去 equip:0 但不可装备 ⇒ occupied；gel2(mail) → bag:2 ⇒ hide 得去 mail ⇒ occupied
    await assert.rejects(move("m4", "blade", "bag", 2), (error: unknown) => error instanceof MmoInventoryError && error.code === "occupied");
    await assert.rejects(move("m5", "gel2", "bag", 2), (error: unknown) => error instanceof MmoInventoryError && error.code === "occupied");
    // 卸下到 bag:2（hide 在那）⇒ 交换：hide 去 equip? 不行 ⇒ 先把 blade 卸到空格 3，再把 hide 和 gel 互换（bag ↔ bag 任意交换）
    await move("m6", "blade", "bag", 3);
    assert.deepEqual(at("blade"), ["bag", 3, 1]);
    const revBefore = m.rows.get("hide")!.rev;
    await move("m7", "hide", "bag", 1);
    assert.deepEqual([at("hide"), at("gel")], [["bag", 1, 3], ["bag", 2, 99]], "bag ↔ bag 交换");
    assert.equal(m.rows.get("hide")!.rev, revBefore + 2, "交换 = tmp + 落位两步 rev");
    assert.equal([...m.rows.values()].some((row) => row.location === "tmp"), false, "tmp 不残留");
    const noop = await move("m8", "hide", "bag", 1);
    assert.deepEqual([noop.replayed, m.receipts.get("m8")?.result], [false, { itemInstanceId: "hide", location: "bag", slot: 1, noop: true }], "no-op 也写回执");
    const replay = await move("m8", "hide", "bag", 7);
    assert.deepEqual([replay.replayed, at("hide")], [true, ["bag", 1, 3]], "同 opId 重放：不动");
    // 并发：先读到的 rev 已过期 ⇒ conflict（用 store 直接把 hide 的 rev 抬走来模拟另一事务）
    await m.store.update("hide", m.rows.get("hide")!.rev, { count: 3 });
    const stale = { ...m.store, list: async (characterId: string) => (await m.store.list(characterId)).map((row) => (row.id === "hide" ? { ...row, rev: row.rev - 1 } : row)) };
    await assert.rejects(moveItem(stale, { opId: "m9", characterId: "c1", classId: "fighter", itemInstanceId: "hide", location: "bag", slot: 9 }, CONTENT), (error: unknown) => error instanceof MmoInventoryError && error.code === "conflict");
    assert.deepEqual(at("hide"), ["bag", 1, 3], "冲突不动");
});

test("bagOf / moveItemFor：角色必须属本账号（别人的 / 不存在 ⇒ forbidden）；moveItemFor 用角色职业做装备限制", async () => {
    const m = memoryStore([item("blade", GREYBOX_ITEMS.blade, "bag", 0, 1, "c-fighter"), item("blade2", GREYBOX_ITEMS.blade, "bag", 0, 1, "c-caster")]);
    const rows: MmoCharacterRow[] = [
        { characterId: "c-fighter", personaId: "p1", userId: "u1", slot: 0, name: "F", classId: "fighter", factionId: "dawn", level: 1, exp: 0, checkpointRev: 0, mapId: null },
        { characterId: "c-caster", personaId: "p2", userId: "u1", slot: 1, name: "C", classId: "caster", factionId: "dawn", level: 1, exp: 0, checkpointRev: 0, mapId: null },
    ];
    const deps: InventoryDeps = {
        content: () => CONTENT,
        run: async (_sId, fn) => fn({ sId: 0, kitId: "mmo", query: async (sql: string, params: unknown[] = []) => {
            if (sql.startsWith("SELECT") && sql.includes("FROM k_mmo_character ")) return rows.filter((row) => row.userId === params[1]).map((row) => ({ character_id: row.characterId, persona_id: row.personaId, user_id: row.userId, slot: row.slot, name: row.name, class_id: row.classId, faction_id: row.factionId, level: row.level, exp: row.exp, checkpoint_rev: row.checkpointRev, map_id: null }));
            throw new Error(`unexpected sql ${sql}`);
        } } as never),
    };
    // 面里 sqlItemStore(tx) 会走 SQL；这里只验账号归属闸 ⇒ 用别人的角色 / 不存在的角色触发 forbidden（在触碰物品表之前）
    await assert.rejects(bagOf("u2", 0, "c-fighter", deps), (error: unknown) => error instanceof MmoInventoryError && error.code === "forbidden");
    await assert.rejects(moveItemFor("u1", 0, { characterId: "c-nope", itemInstanceId: "blade", location: "equip", slot: 0 }, "op1", deps), (error: unknown) => error instanceof MmoInventoryError && error.code === "forbidden");
    // 职业限制来自角色行：法师角色装锈剑 ⇒ class-mismatch（直接用面 + 内存 store 验证同一规则）
    await assert.rejects(moveItem(m.store, { opId: "op2", characterId: "c-caster", classId: "caster", itemInstanceId: "blade2", location: "equip", slot: 0 }, CONTENT), (error: unknown) => error instanceof MmoInventoryError && error.code === "class-mismatch");
    assert.deepEqual((await readBag(m.store, "c-fighter")).items.map((entry) => entry.id), ["blade"], "readBag 只看本角色");
});
