/**
 * feature 自有键工厂 `kFeatureUser` / `kFeatureShared`（core/infra/keys.ts）的中央契约——与
 * gameplay-keys.test.ts 的 `kGameplay` 对称（docs/PLUGIN.md §8：feature 侧 Redis 键命名空间的收口）：
 * - scope 显式且 per-zone / global 前缀行为真的不同；
 * - 分段顺序（`ft:` → featureId → name → `{uid}` 末段）是 09·R3 同槽与「按 feature 前缀清理」的依据；
 * - `ft:` 与 `gp:` 两个命名空间互不可达：同名 id 的 feature 与玩法拼不出同一物理键；
 * - 共享键的 hash-tag 取 featureId，同一 feature 的共享键同槽、与任何 `{uid}` 槽无关。
 *
 * ⛔ 本文件不登记任何具体 feature 的 key——那属各 feature 自己的 `core/<featureId>/keys.ts`。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { kFeatureShared, kFeatureUser, kGameplay, kUser, zoneCtx } from "../src/core/infra/keys";

test("kFeatureUser 分段契约：ft 命名空间 + featureId + name + {uid} 末段", () => {
    const key = kFeatureUser("redeem", "claimed", "u1", { zone: "global" });
    assert.equal(key.endsWith("ft:redeem:claimed:{u1}"), true, `实际 ${key}`);
    assert.equal(key.slice(key.lastIndexOf("{")), "{u1}");
    assert.equal(kUser("u1").slice(kUser("u1").lastIndexOf("{")), "{u1}");
    assert.notEqual(kFeatureUser("redeem", "claimed", "u1", { zone: "per-zone" }), kUser("u1"));
    // 同名 id 的 feature 与玩法：两个命名空间段保证物理键不同。
    assert.notEqual(
        kFeatureUser("snake", "user", "u1", { zone: "global" }),
        kGameplay("snake", "user", "u1", { zone: "global" }),
    );
});

test("kFeatureUser scope 显式：per-zone 随 sId 变前缀，global 恒定", () => {
    const perZoneBase = kFeatureUser("f", "wallet", "u1", { zone: "per-zone" });
    const perZoneS3 = zoneCtx.run({ sId: 3 }, () => kFeatureUser("f", "wallet", "u1", { zone: "per-zone" }));
    const globalBase = kFeatureUser("f", "wallet", "u1", { zone: "global" });
    const globalS3 = zoneCtx.run({ sId: 3 }, () => kFeatureUser("f", "wallet", "u1", { zone: "global" }));
    assert.notEqual(perZoneS3, perZoneBase);
    assert.match(perZoneS3, /_s3_ft:f:wallet:\{u1\}$/u);
    assert.equal(globalS3, globalBase);
    assert.equal(zoneCtx.run({ sId: 0 }, () => kFeatureUser("f", "wallet", "u1", { zone: "per-zone" })), globalBase);
});

test("kFeatureShared：hash-tag 取 featureId，同 feature 共享键同槽；可选末段走同一闸", () => {
    const seq = kFeatureShared("redeem", "seq", { zone: "global" });
    const codes = kFeatureShared("redeem", "codes", { zone: "global" }, "batch-1");
    assert.equal(seq.endsWith("ft:redeem:seq:{redeem}"), true, `实际 ${seq}`);
    assert.equal(codes.endsWith("ft:redeem:codes:{redeem}:batch-1"), true, `实际 ${codes}`);
    // 两个共享键的 hash-tag 相同（同槽），且不等于任何 uid 槽。
    const tagOf = (key: string): string => key.slice(key.indexOf("{"), key.indexOf("}") + 1);
    assert.equal(tagOf(seq), tagOf(codes));
    assert.notEqual(tagOf(seq), "{redeem-user}");
    assert.match(zoneCtx.run({ sId: 2 }, () => kFeatureShared("f", "n", { zone: "per-zone" })), /_s2_ft:f:n:\{f\}$/u);
});

test("kFeature* 分段字面量闸：能拼出歧义物理键的分段一律拒绝", () => {
    assert.throws(() => kFeatureUser("a:b", "c", "u1", { zone: "global" }), /kFeature featureId/u);
    assert.throws(() => kFeatureUser("a", "b:c", "u1", { zone: "global" }), /kFeature name/u);
    assert.throws(() => kFeatureUser("", "n", "u1", { zone: "global" }), /kFeature featureId/u);
    assert.throws(() => kFeatureShared("f", "n", { zone: "global" }, "x{y}"), /kFeature key/u);
    assert.throws(() => kFeatureShared("f{x}", "n", { zone: "global" }), /kFeature featureId/u);
    assert.doesNotThrow(() => kFeatureUser("under-ground.idle_2", "n", "u1", { zone: "global" }));
});
