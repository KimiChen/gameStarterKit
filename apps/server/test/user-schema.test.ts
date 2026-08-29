import assert from "node:assert/strict";
import { test } from "node:test";
import { SCHEMA_VERSION } from "../src/core/infra/config";
import { UnitOfWork } from "../src/core/uow";
import {
  USER_GENERIC_WRITE_RESERVED_FIELDS,
  USER_SCHEMA_MIGRATIONS,
  migrateUserSchemaToCurrent,
  validateUserSchema,
} from "../src/core/userSchema";
import { lazyMigrateSchema } from "../src/core/archive/lazyMigrate";
import type { ArchiveSnapshot } from "../src/core/archive/archiveScripts";

const v1 = (checkedAt?: string): Record<string, string> => ({
  schemaVersion: "1",
  ver: "7",
  fence: "3",
  createdAt: "100",
  nickname: "legacy",
  ...(checkedAt === undefined ? {} : { characterRegistrationCheckedAt: checkedAt }),
});

test("user schema registry is continuous through current v2", () => {
  assert.equal(SCHEMA_VERSION, 2);
  assert.deepEqual(
    USER_SCHEMA_MIGRATIONS.map(({ fromVersion, toVersion }) => [fromVersion, toVersion]),
    [[1, 2]],
  );
});

test("v1->v2 adds missing checkedAt=0, preserves legal old values, bumps ver and never mutates input", () => {
  const missing = v1();
  const before = { ...missing };
  assert.deepEqual(migrateUserSchemaToCurrent(missing, 1), {
    ...missing,
    schemaVersion: "2",
    ver: "8",
    characterRegistrationCheckedAt: "0",
  });
  assert.deepEqual(missing, before, "pure migration must not alter a MySQL snapshot object");

  const present = v1("123456");
  assert.equal(migrateUserSchemaToCurrent(present, 1).characterRegistrationCheckedAt, "123456");
});

test("v1 explicit malformed checkedAt and overflowing ver fail before a migration result exists", () => {
  for (const value of ["", "-1", "01", "1.5", "NaN", "9007199254740992"]) {
    assert.throws(
      () => migrateUserSchemaToCurrent(v1(value), 1),
      /characterRegistrationCheckedAt/,
      `malformed checkedAt=${JSON.stringify(value)} must not be replaced by 0`,
    );
  }
  assert.throws(
    () => migrateUserSchemaToCurrent({ ...v1(), ver: String(Number.MAX_SAFE_INTEGER) }, 1),
    /无法执行 schema v1->v2/,
  );
});

test("current v2 is a validated no-op and requires canonical checkedAt", () => {
  const current = {
    schemaVersion: "2", ver: "9", fence: "4", createdAt: "100",
    characterRegistrationCheckedAt: "321", nickname: "current",
  };
  assert.deepEqual(migrateUserSchemaToCurrent(current, 2), current);
  assert.equal(validateUserSchema(current, 2).checkedAt, "321");
  assert.throws(
    () => validateUserSchema({ ...current, characterRegistrationCheckedAt: undefined }, 2),
    /缺失/,
  );
  assert.throws(
    () => validateUserSchema({ ...current, schemaVersion: "3" }),
    /不受支持/,
  );
});

test("lazy archive migration returns a new snapshot and leaves success/failure inputs untouched", async () => {
  const snapshot: ArchiveSnapshot = {
    user: v1("77"),
    bag: [{ a: "1" }, {}, {}, {}],
    applied: ["op", "100"],
    appliedPayload: { op: "payload" },
  };
  const original = structuredClone(snapshot);
  const migrated = await lazyMigrateSchema(snapshot, 1);
  assert.notStrictEqual(migrated, snapshot);
  assert.notStrictEqual(migrated.user, snapshot.user);
  assert.deepEqual(snapshot, original);
  assert.equal(migrated.user.schemaVersion, "2");

  const malformed: ArchiveSnapshot = {
    ...structuredClone(snapshot),
    user: { ...snapshot.user, characterRegistrationCheckedAt: "-1" },
  };
  const malformedOriginal = structuredClone(malformed);
  await assert.rejects(lazyMigrateSchema(malformed, 1), /characterRegistrationCheckedAt/);
  assert.deepEqual(malformed, malformedOriginal, "failed migration must not normalize the source object");
});

test("generic UoW reserved fields are exact and rejected before dirty state", () => {
  assert.deepEqual(USER_GENERIC_WRITE_RESERVED_FIELDS, [
    "schemaVersion",
    "ver",
    "fence",
    "createdAt",
    "characterRegistration",
    "characterRegistrationCheckedAt",
  ]);
  const uow = new UnitOfWork("schema-test", 1);
  for (const field of USER_GENERIC_WRITE_RESERVED_FIELDS) {
    assert.throws(() => uow.set(field, "x"), /保留字段/);
    assert.equal(uow.hasDirty, false);
  }
  uow.set("lastActiveAt", "1");
  assert.equal(uow.hasDirty, true);
});
