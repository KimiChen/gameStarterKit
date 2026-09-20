/**
 * mmo kit MK3-B1 inventory 面真栈（真 MySQL；⛔ 起房）：sqlItemStore 上的 grantItem / moveItem / readBag / bagOf / moveItemFor——
 *  ① grantItem 三次（并入堆叠 + 新堆 + 溢出规则由单测钉；这里钉 SQL：唯一键 (owner, location, slot)、rev 递增、回执 op_id）；同 opId 重放零写入；
 *  ② moveItem：bag → equip（锈剑进武器格）、bag ↔ bag 交换（tmp 过渡 ⛔ 残留、唯一键不炸）、同模板合并；同 opId 重放不动；
 *  ③ 并发：两个事务同时移动同一件（各自读到同一 rev）⇒ 恰一个 ok、另一个 conflict，终态与唯一键一致；
 *  ④ 账号归属：bagOf / moveItemFor 别人的角色 ⇒ forbidden（在触碰物品表之前）。
 * 前置：本地栈已启动且 db:bootstrap 到 MK1-B4。⚠ int 文件只能单文件串行跑。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { GREYBOX_ITEMS } from "@game/shared/kits/mmo/content/greybox";
import { withKitTx } from "../../src/core/infra/kitApi";
import { closeMysql, getPool, type RowDataPacket } from "../../src/core/infra/mysql";
import { closeRedis } from "../../src/core/infra/redisRoute";
import { createCharacter } from "../../src/kits/mmo/api/characters/index";
import { MmoInventoryError, bagOf, grantItem, moveItem, moveItemFor, readBag } from "../../src/kits/mmo/api/inventory/index";
import { MMO_KIT_ID, mmoOpId } from "../../src/kits/mmo/host";
import { sqlItemStore } from "../../src/kits/mmo/persistence/items";
import { testUid } from "./helpers";

const SID = 0;
const uids: string[] = [];
const uid = (name: string): string => { const value = testUid(name).slice(0, 32); uids.push(value); return value; };

after(async () => {
    const pool = getPool();
    for (const value of uids) {
        const [rows] = await pool.query<RowDataPacket[]>("SELECT character_id FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        for (const row of rows) {
            await pool.execute("DELETE FROM k_mmo_item_instance WHERE server_id = ? AND owner_character_id = ?", [SID, String(row.character_id)]);
            await pool.execute("DELETE FROM k_mmo_receipt WHERE server_id = ? AND character_id = ?", [SID, String(row.character_id)]);
            await pool.execute("DELETE FROM k_mmo_character_checkpoint WHERE server_id = ? AND character_id = ?", [SID, String(row.character_id)]);
        }
        await pool.execute("DELETE FROM k_mmo_character WHERE server_id = ? AND user_id = ?", [SID, value]);
        await pool.execute("DELETE FROM persona WHERE user_id = ?", [value]);
    }
    await closeRedis();
    await closeMysql();
});

const inTx = <T>(fn: (store: ReturnType<typeof sqlItemStore>) => Promise<T>): Promise<T> => withKitTx(MMO_KIT_ID, SID, (tx) => fn(sqlItemStore(tx)));
const rowsOf = async (characterId: string) => {
    const [rows] = await getPool().query<RowDataPacket[]>("SELECT item_id, template_id, location, slot, count, rev FROM k_mmo_item_instance WHERE server_id = ? AND owner_character_id = ? ORDER BY location, slot", [SID, characterId]);
    return rows.map((row) => [String(row.template_id), String(row.location), Number(row.slot), Number(row.count), Number(row.rev)]);
};

test("MK3-B1：grantItem（唯一键 / rev / 回执 / 重放）→ moveItem（装备 / 交换 / 合并 / 重放）→ 并发同一件恰一个 conflict → 账号归属 forbidden", { timeout: 60_000 }, async () => {
    const userA = uid("invA");
    const userB = uid("invB");
    const a0 = await createCharacter(userA, SID, { slot: 0, name: `Ia${userA.slice(-8)}`, classId: "fighter", factionId: "dawn" }, mmoOpId(userA, SID, "createCharacter", "c1"));
    const characterId = a0.character.characterId;
    // ① 发放：凝胶 2 → 凝胶 3（并入同堆）→ 锈剑 1（新格）；同 opId 重放零写入
    const g1 = await inTx((store) => grantItem(store, { opId: "int-g1", characterId, itemId: GREYBOX_ITEMS.gel, count: 2, kind: "grantItem" }));
    assert.deepEqual(g1.bag.items.map((item) => [item.itemId, item.location, item.slot, item.count, item.rev]), [[GREYBOX_ITEMS.gel, "bag", 0, 2, 0]]);
    const g2 = await inTx((store) => grantItem(store, { opId: "int-g2", characterId, itemId: GREYBOX_ITEMS.gel, count: 3, kind: "grantItem" }));
    assert.deepEqual(g2.bag.items.map((item) => [item.slot, item.count, item.rev]), [[0, 5, 1]], "并入同堆 ⇒ rev 1");
    await inTx((store) => grantItem(store, { opId: "int-g3", characterId, itemId: GREYBOX_ITEMS.blade, count: 1, kind: "grantItem" }));
    const replay = await inTx((store) => grantItem(store, { opId: "int-g3", characterId, itemId: GREYBOX_ITEMS.blade, count: 1, kind: "grantItem" }));
    assert.equal(replay.replayed, true);
    assert.deepEqual(await rowsOf(characterId), [[GREYBOX_ITEMS.gel, "bag", 0, 5, 1], [GREYBOX_ITEMS.blade, "bag", 1, 1, 0]], "重放不复制");
    const [receipts] = await getPool().query<RowDataPacket[]>("SELECT op_id, kind FROM k_mmo_receipt WHERE server_id = ? AND character_id = ? AND kind = ? ORDER BY op_id", [SID, characterId, "grantItem"]);
    assert.deepEqual(receipts.map((row) => String(row.op_id)), ["int-g1", "int-g2", "int-g3"]);
    // ② 移动：锈剑装备；凝胶 bag:0 ↔ 锈剑? 先把锈剑卸回 bag:5，再交换 bag:0 ↔ bag:5
    const blade = (await inTx((store) => readBag(store, characterId))).items.find((item) => item.itemId === GREYBOX_ITEMS.blade)!;
    const gel = (await inTx((store) => readBag(store, characterId))).items.find((item) => item.itemId === GREYBOX_ITEMS.gel)!;
    const equipped = await inTx((store) => moveItem(store, { opId: "int-m1", characterId, classId: "fighter", itemInstanceId: blade.id, location: "equip", slot: 0 }));
    assert.deepEqual(equipped.bag.items.find((item) => item.id === blade.id)?.location, "equip");
    await assert.rejects(inTx((store) => moveItem(store, { opId: "int-m2", characterId, classId: "caster", itemInstanceId: blade.id, location: "equip", slot: 0 })), (error: unknown) => error instanceof MmoInventoryError && error.code === "class-mismatch");
    await inTx((store) => moveItem(store, { opId: "int-m3", characterId, classId: "fighter", itemInstanceId: blade.id, location: "bag", slot: 5 }));
    const swapped = await inTx((store) => moveItem(store, { opId: "int-m4", characterId, classId: "fighter", itemInstanceId: gel.id, location: "bag", slot: 5 }));
    assert.deepEqual(swapped.bag.items.map((item) => [item.itemId, item.location, item.slot]), [[GREYBOX_ITEMS.blade, "bag", 0], [GREYBOX_ITEMS.gel, "bag", 5]], "bag ↔ bag 交换（唯一键不炸）");
    assert.equal((await rowsOf(characterId)).some((row) => row[1] === "tmp"), false, "tmp 不残留");
    const replayMove = await inTx((store) => moveItem(store, { opId: "int-m4", characterId, classId: "fighter", itemInstanceId: gel.id, location: "bag", slot: 9 }));
    assert.deepEqual([replayMove.replayed, replayMove.bag.items.find((item) => item.id === gel.id)?.slot], [true, 5], "同 opId 重放不动");
    // ③ 并发：两个事务基于同一份读取移动同一件 ⇒ 恰一个 conflict（先读再各自写，用 barrier 让两者都读到同一 rev）
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let readers = 0;
    const race = (opId: string, slot: number) => withKitTx(MMO_KIT_ID, SID, async (tx) => {
        const store = sqlItemStore(tx);
        const gated = { ...store, list: async (id: string) => { const rows = await store.list(id); readers += 1; if (readers === 2) release(); await gate; return rows; } };
        return moveItem(gated, { opId, characterId, classId: "fighter", itemInstanceId: gel.id, location: "bag", slot });
    });
    const outcomes = await Promise.allSettled([race("int-r1", 7), race("int-r2", 8)]);
    const codes = outcomes.map((outcome) => (outcome.status === "fulfilled" ? "ok" : outcome.reason instanceof MmoInventoryError ? outcome.reason.code : String(outcome.reason))).sort();
    assert.deepEqual(codes, ["conflict", "ok"], `并发恰一个成功：${codes.join(",")}`);
    const finalGel = (await rowsOf(characterId)).find((row) => row[0] === GREYBOX_ITEMS.gel)!;
    assert.ok(finalGel[2] === 7 || finalGel[2] === 8, `终态在 7 或 8：${finalGel[2]}`);
    // ④ 账号归属
    const b0 = await createCharacter(userB, SID, { slot: 0, name: `Ib${userB.slice(-8)}`, classId: "caster", factionId: "dusk" }, mmoOpId(userB, SID, "createCharacter", "c1"));
    await assert.rejects(bagOf(userB, SID, characterId), (error: unknown) => error instanceof MmoInventoryError && error.code === "forbidden");
    await assert.rejects(moveItemFor(userB, SID, { characterId, itemInstanceId: gel.id, location: "bag", slot: 3 }, mmoOpId(userB, SID, "moveItem", "x")), (error: unknown) => error instanceof MmoInventoryError && error.code === "forbidden");
    assert.deepEqual((await bagOf(userB, SID, b0.character.characterId)).items, [], "自己的空背包");
    const mine = await bagOf(userA, SID, characterId);
    assert.equal(mine.items.length, 2);
});
