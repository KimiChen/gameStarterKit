/**
 * MF2-B1（docs/MMO.md MF2 / docs/MMO-PLAN.md MF2-B1）：shared `protocol/identity.ts` 的资产主体 / persona 引用零依赖校验器
 * 与三个新错误码（PersonaSlotTaken / PersonaNotFound / ControlConflict）。
 * 变异验证：validateAssetOwnerRef 删 exact keys 断言 → 「混搭 / 多余键被拒」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSET_OWNER_KIND_ACCOUNT, ASSET_OWNER_KIND_PERSONA, ERROR_CODE_VALUES, ErrorCode, ErrorMessage, PERSONA_MAX_SLOTS_HARD, WireValidationError,
  accountOwner, assetOwnerColumns, assetOwnerFromColumns, assetOwnerKey, isErrorCode, isSameAssetOwner, personaOwner,
  validateAssetOwnerRef, validatePersonaId, validatePersonaRef,
} from "@game/shared";

const PID = "p_0123456789abcdefXYZ";

test("validateAssetOwnerRef：account / persona 两形态 exact；混搭、多余键、坏 kind、坏 id 一律 WireValidationError", () => {
  assert.deepEqual(validateAssetOwnerRef({ kind: "account", uid: "u-1" }), { kind: "account", uid: "u-1" });
  assert.deepEqual(validateAssetOwnerRef({ kind: "persona", personaId: PID }), { kind: "persona", personaId: PID });
  // 库自带 helper 的码（assertExactKeys / boundedString）以 /^WIRE_/ 判；本文件自有码精确判。
  const rejects = (input: unknown, code: RegExp | string): void => {
    assert.throws(() => validateAssetOwnerRef(input),
      (error: unknown) => error instanceof WireValidationError && (typeof code === "string" ? error.code === code : code.test(error.code)),
      `${JSON.stringify(input)} → ${String(code)}`);
  };
  rejects({ kind: "account", uid: "u-1", personaId: PID }, /^WIRE_/u);
  rejects({ kind: "persona", personaId: PID, uid: "u-1" }, /^WIRE_/u);
  rejects({ kind: "account" }, /^WIRE_/u);
  rejects({ kind: "guild", uid: "u-1" }, "ASSET_OWNER_KIND");
  rejects({ kind: "persona", personaId: "short" }, /^WIRE_/u);
  rejects({ kind: "persona", personaId: "x".repeat(16) + "!" }, "PERSONA_ID");
  rejects({ kind: "account", uid: "" }, /^WIRE_/u);
  rejects({ kind: "account", uid: "u 1" }, "ASSET_OWNER_UID");
  rejects(null, "ASSET_OWNER");
  rejects([], "ASSET_OWNER");
});

test("validatePersonaRef / validatePersonaId：personaId 形状 + 可选 controlEpoch（非负安全整数）", () => {
  assert.deepEqual(validatePersonaRef({ personaId: PID }), { personaId: PID });
  assert.deepEqual(validatePersonaRef({ personaId: PID, controlEpoch: 3 }), { personaId: PID, controlEpoch: 3 });
  assert.throws(() => validatePersonaRef({ personaId: PID, controlEpoch: -1 }), WireValidationError);
  assert.throws(() => validatePersonaRef({ personaId: PID, controlEpoch: 1.5 }), WireValidationError);
  assert.throws(() => validatePersonaRef({ personaId: PID, extra: 1 }), WireValidationError);
  assert.equal(validatePersonaId(PID), PID);
  assert.throws(() => validatePersonaId(`${PID}/`), WireValidationError);
});

test("列形态与键：account → (0, '')，persona → (1, id)；反向解析 fail-closed；assetOwnerKey 两族不撞", () => {
  assert.deepEqual(assetOwnerColumns(accountOwner("u-1")), { ownerKind: ASSET_OWNER_KIND_ACCOUNT, ownerId: "" });
  assert.deepEqual(assetOwnerColumns(personaOwner(PID)), { ownerKind: ASSET_OWNER_KIND_PERSONA, ownerId: PID });
  assert.deepEqual(assetOwnerFromColumns("u-1", 0, ""), { kind: "account", uid: "u-1" });
  assert.deepEqual(assetOwnerFromColumns("u-1", "0", null), { kind: "account", uid: "u-1" }, "mysql2 可能给字符串 / NULL");
  assert.deepEqual(assetOwnerFromColumns("u-1", 1, PID), { kind: "persona", personaId: PID });
  assert.throws(() => assetOwnerFromColumns("u-1", 0, PID), WireValidationError, "(0, 非空) 拒");
  assert.throws(() => assetOwnerFromColumns("u-1", 1, ""), WireValidationError, "(1, '') 拒");
  assert.throws(() => assetOwnerFromColumns("u-1", 2, ""), WireValidationError);
  assert.equal(assetOwnerKey(accountOwner("u-1")), "account:u-1");
  assert.equal(assetOwnerKey(personaOwner(PID)), `persona:${PID}`);
  assert.equal(isSameAssetOwner(accountOwner("u-1"), accountOwner("u-1")), true);
  assert.equal(isSameAssetOwner(accountOwner("u-1"), personaOwner(PID)), false);
  assert.equal(PERSONA_MAX_SLOTS_HARD, 16, "MMO.md §11.2 冻结值");
});

test("错误码：4xxx persona / 主体段登记且文案穷尽；与既有段不重叠", () => {
  assert.deepEqual([ErrorCode.PersonaSlotTaken, ErrorCode.PersonaNotFound, ErrorCode.ControlConflict], [4001, 4002, 4003]);
  for (const code of [4001, 4002, 4003] as const) {
    assert.equal(isErrorCode(code), true);
    assert.ok(ErrorMessage[code].length > 0);
  }
  assert.equal(new Set(ERROR_CODE_VALUES).size, ERROR_CODE_VALUES.length, "错误码值唯一");
});
