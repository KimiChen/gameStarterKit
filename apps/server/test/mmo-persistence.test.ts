/**
 * mmo kit 持久层纯函数（MK3-B2 角色保存定稿，⛔ 连库）：validatePersonaSnapshot——v1 五键 / v2 可选 cooldowns・arrival 通过并归一；多键 / 缺键 / 非有限数 / 负 hp /
 * 冷却非正整数 / arrival 形态坏 ⇒ null。保留常量为正整数。
 * 变异验证：validatePersonaSnapshot 不查多余键 → 「多键」红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MMO_CHARACTER_CHECKPOINT_KEEP, MMO_INSTANCE_CHECKPOINT_KEEP, MMO_WORLD_CHECKPOINT_SCHEMA, validatePersonaSnapshot } from "../src/kits/mmo/persistence/checkpoint";

test("validatePersonaSnapshot：v1 五键 / v2 可选键通过并归一；坏形态一律 null", () => {
    const v1 = { mapId: "greybox", x: 1, y: 2, hp: 3, mp: 4 };
    assert.deepEqual(validatePersonaSnapshot(v1), v1);
    const v2 = { ...v1, cooldowns: { strike: 500 }, arrival: { mapId: "greybox-east", spawnPointId: "gate" } };
    assert.deepEqual(validatePersonaSnapshot(v2), v2);
    assert.deepEqual(validatePersonaSnapshot({ ...v1, cooldowns: {} }), { ...v1, cooldowns: {} });
    for (const bad of [
        null, [], "x", { ...v1, extra: 1 }, { mapId: "greybox", x: 1, y: 2, hp: 3 }, { ...v1, x: Number.NaN }, { ...v1, y: "1" }, { ...v1, hp: -1 }, { ...v1, mapId: "" },
        { ...v1, cooldowns: { strike: 0 } }, { ...v1, cooldowns: { strike: 1.5 } }, { ...v1, cooldowns: [] }, { ...v1, arrival: { mapId: "a" } }, { ...v1, arrival: { mapId: "a", spawnPointId: "b", extra: 1 } },
    ]) {
        assert.equal(validatePersonaSnapshot(bad), null, JSON.stringify(bad));
    }
    assert.deepEqual([MMO_WORLD_CHECKPOINT_SCHEMA, MMO_INSTANCE_CHECKPOINT_KEEP > 0, MMO_CHARACTER_CHECKPOINT_KEEP > 0], [{ version: 2, minSupported: 1 }, true, true]);
});
