/** 热档 schema 的原子只读与锁内迁移适配层。 */
import { BusyError, ColdUserError } from "./errors";
import { SCHEMA_VERSION } from "./infra/config";
import { kLock, kUser } from "./infra/keys";
import { clientFor } from "./infra/redisRoute";
import {
  evalshaWithReload, MIGRATE_USER_SCHEMA, READ_USER_FIELDS,
} from "./infra/redisScripts";
import {
  isSupportedHotUserSchema, migrateUserSchemaToCurrent, validateUserSchema,
  type ValidatedUserSchema,
} from "./userSchema";

const META_FIELD_COUNT = 5;

export interface LiveUserFieldRead {
  readonly kind: "live";
  readonly schema: ValidatedUserSchema;
  readonly fields: Readonly<Record<string, string | null>>;
  /** 原子读出的最小 user 记录，供 registry 计算迁移目标。 */
  readonly schemaRecord: Readonly<Record<string, string>>;
}

export interface AbsentUserFieldRead {
  readonly kind: "absent";
  readonly fields: Readonly<Record<string, null>>;
}

/** Test-only race injection; production leaves it empty. */
export const _liveSchemaTestHooks: {
  beforeAtomicMigration?: (uid: string) => Promise<void>;
} = {};

/**
 * 单条只读 Lua 同时判断 key 类型、存在性并 HMGET schema 元数据及业务字段。
 * N/N-1 都只校验不写；future、过旧和畸形元数据直接失败。
 */
export async function readLiveUserFields(
  uid: string,
  fields: readonly string[],
): Promise<LiveUserFieldRead | AbsentUserFieldRead> {
  const raw = await evalshaWithReload(
    clientFor(uid),
    READ_USER_FIELDS,
    [kUser(uid)],
    [...fields],
  );
  if (!Array.isArray(raw) || raw.length < 1) {
    throw new Error(`readUserFields 返回非法结果：${String(raw)}`);
  }
  if (raw[0] === "absent") {
    return {
      kind: "absent",
      fields: Object.fromEntries(fields.map((field) => [field, null])) as Record<string, null>,
    };
  }
  if (raw[0] !== "live" || raw.length !== 1 + META_FIELD_COUNT + fields.length) {
    throw new Error(`readUserFields 返回非法形状：${JSON.stringify(raw)}`);
  }

  const text = (value: unknown): string | null => value === null
    ? null
    : typeof value === "string"
      ? value
      : (() => { throw new Error(`readUserFields 返回非字符串：${String(value)}`); })();
  const schemaVersion = text(raw[1]);
  const ver = text(raw[2]);
  const fence = text(raw[3]);
  const createdAt = text(raw[4]);
  const checkedAt = text(raw[5]);
  const schemaRecord: Record<string, string> = {};
  if (schemaVersion !== null) { schemaRecord.schemaVersion = schemaVersion; }
  if (ver !== null) { schemaRecord.ver = ver; }
  if (fence !== null) { schemaRecord.fence = fence; }
  if (createdAt !== null) { schemaRecord.createdAt = createdAt; }
  if (checkedAt !== null) { schemaRecord.characterRegistrationCheckedAt = checkedAt; }
  const schema = validateUserSchema(schemaRecord);
  if (!isSupportedHotUserSchema(schema.version)) {
    throw new Error(
      `热档 schemaVersion 不受支持：${schema.version}（只接受 ${SCHEMA_VERSION}/${SCHEMA_VERSION - 1}）`,
    );
  }
  return {
    kind: "live",
    schema,
    schemaRecord,
    fields: Object.fromEntries(fields.map((field, index) => [
      field,
      text(raw[1 + META_FIELD_COUNT + index]),
    ])),
  };
}

export async function inspectLiveUserSchema(
  uid: string,
): Promise<"absent" | "current" | "previous"> {
  const read = await readLiveUserFields(uid, []);
  if (read.kind === "absent") { return "absent"; }
  return read.schema.version === SCHEMA_VERSION ? "current" : "previous";
}

/** 调用方必须持有同 uid 的 `lock:{uid}`。 */
export async function migrateLiveUserSchemaLocked(
  uid: string,
  myFence: number,
): Promise<"current" | "migrated"> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const read = await readLiveUserFields(uid, []);
    if (read.kind === "absent") { throw new ColdUserError(); }
    const migrated = read.schema.version === SCHEMA_VERSION
      ? { ...read.schemaRecord }
      : migrateUserSchemaToCurrent(read.schemaRecord, read.schema.version);
    if (_liveSchemaTestHooks.beforeAtomicMigration) {
      await _liveSchemaTestHooks.beforeAtomicMigration(uid);
    }
    const result = await evalshaWithReload(
      clientFor(uid),
      MIGRATE_USER_SCHEMA,
      [kLock(uid), kUser(uid)],
      [
        String(myFence),
        String(read.schema.version),
        String(read.schema.ver),
        String(read.schema.fence),
        read.schemaRecord.createdAt ?? "",
        read.schema.checkedAt ?? "",
        migrated.schemaVersion,
        migrated.ver,
        migrated.characterRegistrationCheckedAt,
      ],
    );
    if (result === "ok") { return "migrated"; }
    if (result === "current") { return "current"; }
    if (result === "cold") { throw new ColdUserError(); }
    if (result === "lost") { throw new BusyError(`热档 schema 迁移锁已易主 uid=${uid}`); }
    if (result !== "changed") {
      throw new Error(`migrateUserSchema 返回非法结果：${String(result)}`);
    }
  }
  throw new BusyError(`热档 schema 迁移连续变化 uid=${uid}`);
}
