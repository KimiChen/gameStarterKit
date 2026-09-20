/**
 * mmo kit 客户端 combat 面（MK2-B1，无头）：CooldownModel（private 集合语义：accept 覆盖、倒计时、就绪、快照）、pickHostileTarget（最近存活怪、跳过角色 / 尸体、距离并列按 id）。
 * 变异验证：pickHostileTarget 不跳过 hp 0 → 「尸体」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CooldownModel, pickHostileTarget } from "../src/kits/mmo/api/combat/index";
import type { IMmoEntityWire } from "../src/shared/gameplays/mmoWorld/wire";

const entity = (id: string, kind: IMmoEntityWire["kind"], x: number, hp = 30): IMmoEntityWire => ({ id, kind, templateId: "slime", name: id, x, y: 1000, rev: 0, hp, hpMax: 30, level: 1 });

test("CooldownModel：accept 覆盖集合（服务端只在集合变化时发）、剩余按本地时钟倒计时、就绪判定、快照只含未就绪", () => {
    const model = new CooldownModel();
    model.accept({ strike: 1500, guard: 10_000 }, 100);
    assert.deepEqual([model.remainingMs("strike", 600), model.isReady("strike", 600), model.isReady("fireball", 600)], [1000, false, true]);
    assert.deepEqual(model.snapshot(1_700), { guard: 8400 }, "strike 已到点不在快照");
    model.accept({ mend: 200 }, 2_000);
    assert.deepEqual(model.snapshot(2_000), { mend: 200 }, "新集合覆盖旧集合");
    model.accept(undefined, 3_000);
    assert.deepEqual(model.snapshot(3_000), {});
});

test("pickHostileTarget：最近的存活怪；跳过角色与 hp 0 的尸体；超视距 ⇒ null；距离并列按 id", () => {
    const self = { x: 1000, y: 1000 };
    const pool = [entity("me", "character", 1000), entity("far", "creature", 1500), entity("corpse", "creature", 1010, 0), entity("b", "creature", 1100), entity("a", "creature", 900)];
    assert.equal(pickHostileTarget(pool, self, 400)?.id, "a", "距离并列（100）按 id");
    assert.equal(pickHostileTarget(pool, self, 50), null, "视距内没有");
    assert.equal(pickHostileTarget([entity("corpse", "creature", 1010, 0)], self, 400), null, "尸体不选");
});
