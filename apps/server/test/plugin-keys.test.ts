/**
 * plugin 自有键工厂 `kPluginUser` / `kPluginShared`（core/infra/keys.ts）的中央契约——与
 * gameplay-keys.test.ts 的 `kGameplay` 对称（docs/PLUGIN.md §8：plugin 侧 Redis 键命名空间的收口）：
 * - scope 显式且 per-zone / global 前缀行为真的不同；
 * - 分段顺序（`pl:` → pluginId → name → `{uid}` 末段）是 09·R3 同槽与「按 plugin 前缀清理」的依据；
 * - `pl:` 与 `gp:` 两个命名空间互不可达：同名 id 的 plugin 与玩法拼不出同一物理键；
 * - 共享键的 hash-tag 取 pluginId，同一 plugin 的共享键同槽、与任何 `{uid}` 槽无关。
 *
 * ⛔ 本文件不登记任何具体 plugin 的 key——那属各 plugin 自己的 `core/<pluginId>/keys.ts`。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { kPluginShared, kPluginUser, kGameplay, kUser, zoneCtx } from "../src/core/infra/keys";

test("kPluginUser 分段契约：pl 命名空间 + pluginId + name + {uid} 末段", () => {
    const key = kPluginUser("redeem", "claimed", "u1", { zone: "global" });
    assert.equal(key.endsWith("pl:redeem:claimed:{u1}"), true, `实际 ${key}`);
    assert.equal(key.slice(key.lastIndexOf("{")), "{u1}");
    assert.equal(kUser("u1").slice(kUser("u1").lastIndexOf("{")), "{u1}");
    assert.notEqual(kPluginUser("redeem", "claimed", "u1", { zone: "per-zone" }), kUser("u1"));
    // 同名 id 的 plugin 与玩法：两个命名空间段保证物理键不同。
    assert.notEqual(
        kPluginUser("snake", "user", "u1", { zone: "global" }),
        kGameplay("snake", "user", "u1", { zone: "global" }),
    );
});

test("kPluginUser scope 显式：per-zone 随 sId 变前缀，global 恒定", () => {
    const perZoneBase = kPluginUser("f", "wallet", "u1", { zone: "per-zone" });
    const perZoneS3 = zoneCtx.run({ sId: 3 }, () => kPluginUser("f", "wallet", "u1", { zone: "per-zone" }));
    const globalBase = kPluginUser("f", "wallet", "u1", { zone: "global" });
    const globalS3 = zoneCtx.run({ sId: 3 }, () => kPluginUser("f", "wallet", "u1", { zone: "global" }));
    assert.notEqual(perZoneS3, perZoneBase);
    assert.match(perZoneS3, /_s3_pl:f:wallet:\{u1\}$/u);
    assert.equal(globalS3, globalBase);
    assert.equal(zoneCtx.run({ sId: 0 }, () => kPluginUser("f", "wallet", "u1", { zone: "per-zone" })), globalBase);
});

test("kPluginShared：hash-tag 取 pluginId，同 plugin 共享键同槽；可选末段走同一闸", () => {
    const seq = kPluginShared("redeem", "seq", { zone: "global" });
    const codes = kPluginShared("redeem", "codes", { zone: "global" }, "batch-1");
    assert.equal(seq.endsWith("pl:redeem:seq:{redeem}"), true, `实际 ${seq}`);
    assert.equal(codes.endsWith("pl:redeem:codes:{redeem}:batch-1"), true, `实际 ${codes}`);
    // 两个共享键的 hash-tag 相同（同槽），且不等于任何 uid 槽。
    const tagOf = (key: string): string => key.slice(key.indexOf("{"), key.indexOf("}") + 1);
    assert.equal(tagOf(seq), tagOf(codes));
    assert.notEqual(tagOf(seq), "{redeem-user}");
    assert.match(zoneCtx.run({ sId: 2 }, () => kPluginShared("f", "n", { zone: "per-zone" })), /_s2_pl:f:n:\{f\}$/u);
});

test("kPlugin* 分段字面量闸：能拼出歧义物理键的分段一律拒绝", () => {
    assert.throws(() => kPluginUser("a:b", "c", "u1", { zone: "global" }), /kPlugin pluginId/u);
    assert.throws(() => kPluginUser("a", "b:c", "u1", { zone: "global" }), /kPlugin name/u);
    assert.throws(() => kPluginUser("", "n", "u1", { zone: "global" }), /kPlugin pluginId/u);
    assert.throws(() => kPluginShared("f", "n", { zone: "global" }, "x{y}"), /kPlugin key/u);
    assert.throws(() => kPluginShared("f{x}", "n", { zone: "global" }), /kPlugin pluginId/u);
    assert.doesNotThrow(() => kPluginUser("under-ground.idle_2", "n", "u1", { zone: "global" }));
});
