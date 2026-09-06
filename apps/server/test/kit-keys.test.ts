/**
 * kit 自有键工厂 `kKitUser` / `kKitShared`（core/infra/keys.ts）的中央契约——与 plugin-keys.test.ts 的
 * `kPluginUser` / `kPluginShared` 对称（docs/KIT.md §2「Redis 键」行）：
 * - scope 显式且 per-zone / global 前缀行为真的不同；
 * - 分段顺序（`kt:` → kitId → name → `{uid}` 末段）是 09·R3 同槽、冷档同条 Lua 与「按 kit 前缀清理」的依据；
 * - `kt:` 与 `pl:` / `gp:` / 框架 `user:` 互不可达：同名 id 的 kit / plugin / 玩法拼不出同一物理键；
 * - 共享键的 hash-tag **强制带分片键**：per-zone 带 `s<sId>`，global 不带；整 kit 单 tag 在构造上不可能。
 *
 * ⛔ 本文件不登记任何具体 kit 的 key——那属各 kit 自己的 `apps/server/src/kits/<kitId>/keys.ts`。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kGameplay, kKitShared, kKitUser, kPluginShared, kPluginUser, kUser, zoneCtx,
} from "../src/core/infra/keys";

const tagOf = (key: string): string => key.slice(key.indexOf("{"), key.indexOf("}") + 1);

test("kKitUser 分段契约：kt 命名空间 + kitId + name + {uid} 末段", () => {
  const key = kKitUser("arena", "tileOwner", "u1", { zone: "global" });
  assert.equal(key.endsWith("kt:arena:tileOwner:{u1}"), true, `实际 ${key}`);
  assert.equal(key.slice(key.lastIndexOf("{")), "{u1}");
  assert.equal(tagOf(key), tagOf(kUser("u1")), "与该 uid 的框架键同槽（冷档同条 Lua 的前提）");
  assert.notEqual(kKitUser("arena", "tileOwner", "u1", { zone: "per-zone" }), kUser("u1"));
});

test("kt: 与 pl: / gp: / 框架键互不可达：同名 id 三个命名空间拼不出同一物理键", () => {
  const kit = kKitUser("snake", "user", "u1", { zone: "global" });
  const plugin = kPluginUser("snake", "user", "u1", { zone: "global" });
  const gameplay = kGameplay("snake", "user", "u1", { zone: "global" });
  assert.notEqual(kit, plugin);
  assert.notEqual(kit, gameplay);
  assert.notEqual(plugin, gameplay);
  assert.notEqual(kit, kUser("u1"));
  assert.equal(new Set([kit, plugin, gameplay, kUser("u1")]).size, 4);
  // 共享键同样隔开：同 (id, name) 的 kit 与 plugin 共享键不同。
  assert.notEqual(
    kKitShared("snake", "seq", "0", { zone: "global" }),
    kPluginShared("snake", "seq", { zone: "global" }, "0"),
  );
});

test("kKitUser scope 显式：per-zone 随 sId 变前缀，global 恒定", () => {
  const perZoneBase = kKitUser("arena", "tileOwner", "u1", { zone: "per-zone" });
  const perZoneS3 = zoneCtx.run({ sId: 3 }, () => kKitUser("arena", "tileOwner", "u1", { zone: "per-zone" }));
  const globalBase = kKitUser("arena", "tileOwner", "u1", { zone: "global" });
  const globalS3 = zoneCtx.run({ sId: 3 }, () => kKitUser("arena", "tileOwner", "u1", { zone: "global" }));
  assert.notEqual(perZoneS3, perZoneBase);
  assert.match(perZoneS3, /_s3_kt:arena:tileOwner:\{u1\}$/u);
  assert.equal(globalS3, globalBase);
  assert.equal(zoneCtx.run({ sId: 0 }, () => kKitUser("arena", "tileOwner", "u1", { zone: "per-zone" })), globalBase);
});

test("kKitShared：tag 强制带分片键；per-zone 的 tag 带 s<sId>，global 不带", () => {
  const globalKey = kKitShared("arena", "board", "7", { zone: "global" });
  assert.equal(globalKey.endsWith("kt:arena:board:{arena:7}"), true, `实际 ${globalKey}`);
  assert.equal(tagOf(globalKey), "{arena:7}");

  const perZoneS2 = zoneCtx.run({ sId: 2 }, () => kKitShared("arena", "board", "7", { zone: "per-zone" }));
  assert.match(perZoneS2, /_s2_kt:arena:board:\{arena:s2:7\}$/u, `实际 ${perZoneS2}`);
  assert.equal(tagOf(perZoneS2), "{arena:s2:7}");
  // 未建 zoneCtx（单形态）= s0：前缀不带区、tag 仍带 s0（分类语义与 P() 一致）。
  const perZoneS0 = kKitShared("arena", "board", "7", { zone: "per-zone" });
  assert.equal(tagOf(perZoneS0), "{arena:s0:7}");
  assert.equal(zoneCtx.run({ sId: 0 }, () => kKitShared("arena", "board", "7", { zone: "per-zone" })), perZoneS0);
  // global 不读区上下文。
  assert.equal(zoneCtx.run({ sId: 2 }, () => kKitShared("arena", "board", "7", { zone: "global" })), globalKey);

  // 同 (kitId, shard) 的共享键同槽；不同 shard / 不同区不同槽；永不与 {uid} 槽混淆。
  assert.equal(tagOf(globalKey), tagOf(kKitShared("arena", "ranking", "7", { zone: "global" })));
  assert.notEqual(tagOf(globalKey), tagOf(kKitShared("arena", "board", "8", { zone: "global" })));
  assert.notEqual(tagOf(perZoneS2), tagOf(zoneCtx.run({ sId: 3 }, () => kKitShared("arena", "board", "7", { zone: "per-zone" }))));
  assert.notEqual(tagOf(globalKey), tagOf(kKitUser("arena", "board", "arena", { zone: "global" })));
  assert.notEqual(tagOf(globalKey), tagOf(kKitUser("arena", "board", "7", { zone: "global" })));
});

test("kKit* 分段字面量闸：能拼出歧义物理键的分段一律拒绝；shard 必填非空（整 kit 单 tag 不可能）", () => {
  assert.throws(() => kKitUser("a:b", "c", "u1", { zone: "global" }), /kKit kitId/u);
  assert.throws(() => kKitUser("a", "b:c", "u1", { zone: "global" }), /kKit name/u);
  assert.throws(() => kKitUser("", "n", "u1", { zone: "global" }), /kKit kitId/u);
  assert.throws(() => kKitUser("a{x}", "n", "u1", { zone: "global" }), /kKit kitId/u);
  assert.throws(() => kKitShared("a", "n", "", { zone: "global" }), /kKit shard/u);
  assert.throws(() => kKitShared("a", "n", "x{y}", { zone: "global" }), /kKit shard/u);
  assert.throws(() => kKitShared("a", "n", "s:1", { zone: "per-zone" }), /kKit shard/u);
  assert.throws(() => kKitShared("a{x}", "n", "0", { zone: "global" }), /kKit kitId/u);
  assert.throws(() => kKitShared("a", "n:m", "0", { zone: "global" }), /kKit name/u);
  assert.doesNotThrow(() => kKitUser("under-ground.idle_2", "n", "u1", { zone: "global" }));
  assert.doesNotThrow(() => kKitShared("under-ground.idle_2", "n", "shard-0.1", { zone: "global" }));
});
