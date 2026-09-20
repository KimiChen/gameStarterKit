/**
 * MMO MF5a-B1：shared `defineS2C(type, validator, { perSession?, coalesceKey? })` 运行时契约（docs/MMO.md §5.4 MF5a）。
 *  - 两参形态：perSession=false / coalesceKey=null（真仓既有 token 全部如此，生成物字节不变的前提）；
 *  - perSession 只能是 true；coalesceKey 须与 perSession 同现且是 payload 字段名；未知键 / 非对象拒；
 *  - token 冻结（⛔ 运行期改写 perSession 绕过 S2CPorts 闸）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { defineS2C, gameplayS2CTokens, GAME_WIRE_PER_SESSION } from "@game/shared";

const validate = (input: unknown): { readonly entityId: string } => input as { readonly entityId: string };

test("defineS2C：两参 = 全房消息；perSession / coalesceKey 进 token 且冻结", () => {
  const plain = defineS2C("s2c.fx.plain", validate);
  assert.equal(plain.perSession, false);
  assert.equal(plain.coalesceKey, null);
  const enter = defineS2C("s2c.fx.enter", validate, { perSession: true });
  assert.deepEqual([enter.perSession, enter.coalesceKey], [true, null]);
  const update = defineS2C("s2c.fx.update", validate, { perSession: true, coalesceKey: "entityId" });
  assert.deepEqual([update.perSession, update.coalesceKey], [true, "entityId"]);
  assert.ok(Object.isFrozen(update));
  assert.throws(() => { (update as { perSession: boolean }).perSession = false; }, TypeError);
});

test("defineS2C：非法选项在声明期拒", () => {
  const cases: readonly (readonly [unknown, RegExp])[] = [
    [{ perSession: false }, /perSession 只能是 true/u],
    [{ coalesceKey: "entityId" }, /只对 perSession: true 有意义/u],
    [{ perSession: true, coalesceKey: "" }, /必须是 payload 字段名/u],
    [{ perSession: true, coalesceKey: "a-b" }, /必须是 payload 字段名/u],
    [{ perSession: true, coalesceKey: 42 }, /必须是 payload 字段名/u],
    [{ perSession: true, extra: 1 }, /含未知键：extra/u],
    [null, /第三参必须是对象/u],
    [[], /第三参必须是对象/u],
  ];
  for (const [options, pattern] of cases) {
    assert.throws(() => defineS2C("s2c.fx.bad", validate, options as never), pattern, JSON.stringify(options));
  }
});

test("真仓：GAME_WIRE_PER_SESSION 与运行时 token 逐条一致；既有全房 mode 无 perSession；观察者夹具 / kit 世界玩法的关键条目钉死", () => {
  // MMO MF6b：core 表经 CORE_S2C_OPTIONS 声明的 perSession token（s2c.world.chat，不合并）
  const expected: Record<string, string | null> = { "s2c.world.chat": null };
  // 既有全房消息 mode（MF5a 前的形态）：⛔ 任何 perSession——它们的 S2C 仍是 broadcast；新 mode（夹具 / kit 世界玩法）从运行时 token 派生
  const LEGACY_BROADCAST_MODES = new Set(["ballMove", "idle", "snake", "tally", "arenaCapture", "arenaDuel"]);
  for (const [modeId, tokens] of Object.entries(gameplayS2CTokens)) {
    for (const token of Object.values(tokens as Record<string, { type: string; perSession: boolean; coalesceKey: string | null }>)) {
      if (LEGACY_BROADCAST_MODES.has(modeId)) {
        assert.equal(token.perSession, false, `${token.type} 既有 mode 仍是全房消息`);
        assert.equal(token.coalesceKey, null);
        continue;
      }
      if (token.perSession) expected[token.type] = token.coalesceKey;
      else assert.equal(token.coalesceKey, null, `${token.type} 非 perSession 不得带 coalesceKey`);
    }
  }
  assert.deepEqual({ ...GAME_WIRE_PER_SESSION }, expected);
  // worldFixture 的 pos 是 MF4 的直发回执（刻意非 perSession），其余七个观察者 token + MF8 transfer perSession
  const table: Readonly<Record<string, string | null>> = GAME_WIRE_PER_SESSION;
  assert.equal(table["s2c.worldFixture.pos"], undefined, "直发回执不进 perSession 表");
  assert.equal(GAME_WIRE_PER_SESSION["s2c.viewFixture.update"], "id", "位置类按 id 合并");
  assert.equal(GAME_WIRE_PER_SESSION["s2c.worldFixture.update"], "id", "世界夹具位置类同样按 id 合并");
  assert.equal(Object.keys(GAME_WIRE_PER_SESSION).filter((type) => type.startsWith("s2c.worldFixture.")).length, 8, "worldFixture 七个观察者 token + MF8 transfer");
  // mmo kit（MK0）：观察者六件 + private / opResult / transferReady / prompt 十个 perSession，update 按 id 合并；scriptState / notice 是分线广播
  assert.equal(GAME_WIRE_PER_SESSION["s2c.mmoWorld.update"], "id");
  assert.equal(Object.keys(GAME_WIRE_PER_SESSION).filter((type) => type.startsWith("s2c.mmoWorld.")).length, 10, "mmoWorld 十个 perSession token");
  assert.equal(table["s2c.mmoWorld.notice"], undefined, "分线广播不进 perSession 表");
});
