/**
 * 玩法自有键工厂 `kGameplay`（core/infra/keys.ts）的中央契约：
 * - scope 必须显式且只有两种取值，per-zone / global 的前缀行为必须真的不同；
 * - 分段顺序（`gp:` → modeId → name → `{uid}` 末段）是 09·R3 同槽与「按玩法前缀清理」的依据；
 * - 分段字面量闸挡住能拼出歧义物理键的输入。
 *
 * ⛔ 本文件不登记任何具体玩法的 key——那属各玩法 `rooms/modes/<id>/keys.ts`。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { kGameplay, kUser, zoneCtx } from "../src/core/infra/keys";

test("kGameplay 分段契约：gp 命名空间 + modeId + name + {uid} 末段", () => {
    const key = kGameplay("snake", "user", "u1", { zone: "global" });
    assert.equal(key.endsWith("gp:snake:user:{u1}"), true, `实际 ${key}`);
    // hash-tag 必须是末段：与该 uid 的框架键（kUser）同槽，才可进同一条 Lua。
    assert.equal(key.slice(key.lastIndexOf("{")), "{u1}");
    assert.equal(kUser("u1").slice(kUser("u1").lastIndexOf("{")), "{u1}");
    // `gp:` 命名空间段把玩法键族与框架键族隔开：玩法永远不可能拼出 `user:{uid}`。
    assert.equal(kGameplay("snake", "user", "u1", { zone: "per-zone" }).includes("gp:"), true);
    assert.notEqual(kGameplay("snake", "user", "u1", { zone: "per-zone" }), kUser("u1"));
});

test("kGameplay scope 显式：per-zone 随 sId 变前缀，global 恒定", () => {
    const perZoneBase = kGameplay("m", "wallet", "u1", { zone: "per-zone" });
    const perZoneS3 = zoneCtx.run({ sId: 3 }, () => kGameplay("m", "wallet", "u1", { zone: "per-zone" }));
    const globalBase = kGameplay("m", "wallet", "u1", { zone: "global" });
    const globalS3 = zoneCtx.run({ sId: 3 }, () => kGameplay("m", "wallet", "u1", { zone: "global" }));

    assert.notEqual(perZoneS3, perZoneBase, "per-zone 必须真的带区前缀（否则两种 scope 无差别）");
    assert.match(perZoneS3, /_s3_gp:m:wallet:\{u1\}$/u);
    assert.equal(globalS3, globalBase, "global 不随区变");
    assert.doesNotMatch(globalS3, /_s\d+_gp:/u);
    // sId=0（单形态）时两类前缀相等——这正是分类错误测不出来的形态，故上面必须用非零 sId。
    assert.equal(zoneCtx.run({ sId: 0 }, () => kGameplay("m", "wallet", "u1", { zone: "per-zone" })), globalBase);
});

test("kGameplay 分段字面量闸：能拼出歧义物理键的分段一律拒绝", () => {
    // `a:b` + `c` 与 `a` + `b:c` 会拼出同一串字节；放行就是两个玩法静默共用一个键。
    assert.throws(() => kGameplay("a:b", "c", "u1", { zone: "global" }), /kGameplay modeId/u);
    assert.throws(() => kGameplay("a", "b:c", "u1", { zone: "global" }), /kGameplay name/u);
    assert.throws(() => kGameplay("", "user", "u1", { zone: "global" }), /kGameplay modeId/u);
    assert.throws(() => kGameplay("snake", "", "u1", { zone: "global" }), /kGameplay name/u);
    // hash-tag 括号同样禁止：会改变 Cluster 路由。
    assert.throws(() => kGameplay("sn{ake}", "user", "u1", { zone: "global" }), /kGameplay modeId/u);
    // manifest 允许的 id 字符集（字母数字与 . _ -）必须放行。
    assert.doesNotThrow(() => kGameplay("drop-in.fixture_2", "user", "u1", { zone: "global" }));
});
