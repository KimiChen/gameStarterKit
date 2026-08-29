/**
 * 玩家档 schema 的唯一契约：版本校验、逐版本迁移和普通写保留字段。
 *
 * 本模块只依赖纯 TypeScript；热档原子迁移与冷档 lazy thaw 都必须消费这里的
 * registry/validator，不能在 Redis/MySQL 适配层另写一套业务迁移规则。
 */
import { SCHEMA_VERSION } from "./infra/config";

export const USER_GENERIC_WRITE_RESERVED_FIELDS = [
  "schemaVersion",
  "ver",
  "fence",
  "createdAt",
  "characterRegistration",
  "characterRegistrationCheckedAt",
] as const;

const genericWriteReserved = new Set<string>(USER_GENERIC_WRITE_RESERVED_FIELDS);
const CANONICAL_UNSIGNED = /^(?:0|[1-9]\d*)$/;

export interface ValidatedUserSchema {
  readonly version: number;
  readonly ver: number;
  readonly fence: number;
  readonly checkedAt: string | null;
}

export interface UserSchemaMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (user: Readonly<Record<string, string>>) => Record<string, string>;
}

function canonicalUnsignedSafeInt(raw: unknown, field: string): number {
  if (typeof raw !== "string" || !CANONICAL_UNSIGNED.test(raw)) {
    throw new Error(`${field} 不是规范非负整数字符串：${String(raw)}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} 超出安全整数范围：${String(raw)}`);
  }
  return value;
}

function optionalCanonicalUnsignedSafeInt(raw: unknown, field: string): string | null {
  if (raw === null || raw === undefined) { return null; }
  canonicalUnsignedSafeInt(raw, field);
  return raw as string;
}

/** 普通 UoW/CAS 写不得覆盖框架元数据或角色登记权威字段。 */
export function assertGenericUserFieldWritable(field: string): void {
  if (genericWriteReserved.has(field)) {
    throw new Error(`玩家档保留字段禁止普通写入：${field}`);
  }
}

/**
 * 深校验一份 user hash 的版本相关字段。业务字段集合是开放的，但框架元数据和
 * 当前版本新增字段必须完整、规范；显式 expectedVersion 同时校验外层冷档版本。
 */
export function validateUserSchema(
  user: Readonly<Record<string, string | null | undefined>>,
  expectedVersion?: number,
): ValidatedUserSchema {
  const version = canonicalUnsignedSafeInt(user.schemaVersion, "user.schemaVersion");
  if (version < 1 || version > SCHEMA_VERSION) {
    throw new Error(`user.schemaVersion 不受支持：${version}（current=${SCHEMA_VERSION}）`);
  }
  if (expectedVersion !== undefined && version !== expectedVersion) {
    throw new Error(`user schema 里外不一致：outer=${expectedVersion} embedded=${version}`);
  }

  const ver = canonicalUnsignedSafeInt(user.ver, "user.ver");
  const fence = canonicalUnsignedSafeInt(user.fence, "user.fence");
  if (user.createdAt !== null && user.createdAt !== undefined) {
    canonicalUnsignedSafeInt(user.createdAt, "user.createdAt");
  }

  const checkedAt = optionalCanonicalUnsignedSafeInt(
    user.characterRegistrationCheckedAt,
    "user.characterRegistrationCheckedAt",
  );
  if (version >= 2 && checkedAt === null) {
    throw new Error("user.characterRegistrationCheckedAt 缺失（schema v2 必填）");
  }
  return { version, ver, fence, checkedAt };
}

const migrateV1ToV2 = (
  user: Readonly<Record<string, string>>,
): Record<string, string> => {
  const validated = validateUserSchema(user, 1);
  if (validated.ver >= Number.MAX_SAFE_INTEGER) {
    throw new Error("user.ver 已到安全整数上限，无法执行 schema v1->v2 迁移");
  }
  return {
    ...user,
    schemaVersion: "2",
    ver: String(validated.ver + 1),
    characterRegistrationCheckedAt: validated.checkedAt ?? "0",
  };
};

/** 按 fromVersion 严格连续登记；新增版本必须先补 migration 再提升 SCHEMA_VERSION。 */
export const USER_SCHEMA_MIGRATIONS: readonly UserSchemaMigration[] = [
  { fromVersion: 1, toVersion: 2, migrate: migrateV1ToV2 },
];

const migrationByFrom = new Map(USER_SCHEMA_MIGRATIONS.map((migration) => [
  migration.fromVersion,
  migration,
] as const));

function assertMigrationRegistry(): void {
  for (let version = 1; version < SCHEMA_VERSION; version++) {
    const migration = migrationByFrom.get(version);
    if (!migration || migration.toVersion !== version + 1) {
      throw new Error(`玩家档 migration registry 不连续：缺少 v${version}->v${version + 1}`);
    }
  }
  for (const migration of USER_SCHEMA_MIGRATIONS) {
    if (migration.fromVersion < 1 || migration.toVersion !== migration.fromVersion + 1
      || migration.toVersion > SCHEMA_VERSION) {
      throw new Error(
        `玩家档 migration registry 非法：v${migration.fromVersion}->v${migration.toVersion}`,
      );
    }
  }
}
assertMigrationRegistry();

/** 热档只承诺 N/N-1；更老热档必须离线修复，不能跨多版静默写回。 */
export function isSupportedHotUserSchema(version: number): boolean {
  return version === SCHEMA_VERSION
    || (version === SCHEMA_VERSION - 1 && migrationByFrom.has(version));
}

/**
 * 纯函数逐级迁到当前版本。每一步先后都走同一深校验；返回新对象，不修改来源快照。
 * ver 每步 bump 一次，使 schema 变换与普通状态写一样可被 freeze 的版本复检观察到。
 */
export function migrateUserSchemaToCurrent(
  source: Readonly<Record<string, string>>,
  fromVersion?: number,
): Record<string, string> {
  let current = { ...source };
  let validated = validateUserSchema(current, fromVersion);
  while (validated.version < SCHEMA_VERSION) {
    const migration = migrationByFrom.get(validated.version);
    if (!migration) {
      throw new Error(`玩家档缺少 v${validated.version} 迁移到当前版本的路径`);
    }
    current = migration.migrate(current);
    validated = validateUserSchema(current, migration.toVersion);
  }
  return current;
}
