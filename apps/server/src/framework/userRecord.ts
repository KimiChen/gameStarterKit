/**
 * 玩家档记录原语（框架层）：建号 / 活跃索引 / 按需取字段。
 *
 * 玩法视图（UserView 等）在 src/player/userStore.ts——那边才是日常加档字段的地方；
 * 本文件是 uow 提交尾部 / 登录点 / 端点读路径共同依赖的底座，⛔ 不放玩法字段知识。
 * ⛔ 全仓库禁止 HGETALL（09·R1）——一律 HMGET 按需取字段。
 */
import { SCHEMA_VERSION } from "./infra/config";
import { activeLruBucketOf, kActiveLru, kUser, zoneCtx } from "./infra/keys";
import { clientFor, indexClientFor } from "./infra/redisRoute";
import { CREATE_USER, evalshaWithReload } from "./infra/redisScripts";
import { readLiveUserFields } from "./liveSchema";
import { USER_GENERIC_WRITE_RESERVED_FIELDS } from "./userSchema";

/** 按需取字段。⛔ 禁止 HGETALL。缺失字段返回 null（09·R9：hmget 数组自己 zip）。 */
export async function loadFields(uid: string, fields: string[]): Promise<Record<string, string | null>> {
  const read = await readLiveUserFields(uid, fields);
  return read.fields;
}

/** 刷活跃索引（登录点 + withUser 写提交尾部共同构成完整索引，冷档候选靠它，08）。 */
export async function touchActive(uid: string, sId: number): Promise<void> {
  await zoneCtx.run({ sId }, async () => {
    const bucket = activeLruBucketOf(uid);
    await indexClientFor(bucket).zadd(kActiveLru(bucket), Date.now(), uid);
  });
}

/**
 * 建号创建 user:{uid}（唯一合法创建点之一，另一个是 thaw，09·R2）。
 * 原子 Lua：已存在则不动返回 'exists'——重复建号绝不清档。
 */
export async function createUser(
  uid: string,
  initFields: Record<string, string> = {},
): Promise<"ok" | "exists"> {
  return createUserRecord(uid, initFields, null);
}

/** 建角专用入口：pending marker 由底座参数写入，不借普通 initFields 绕过保留字段闸。 */
export async function createCharacterUser(
  uid: string,
  initFields: Record<string, string> = {},
): Promise<"ok" | "exists"> {
  return createUserRecord(uid, initFields, "pending");
}

async function createUserRecord(
  uid: string,
  initFields: Record<string, string>,
  registration: "pending" | null,
): Promise<"ok" | "exists"> {
  for (const field of USER_GENERIC_WRITE_RESERVED_FIELDS) {
    if (Object.hasOwn(initFields, field)) {
      throw new Error(`createUser initFields 不得覆盖保留字段：${field}`);
    }
  }
  const argv: string[] = [String(SCHEMA_VERSION), String(Date.now()), registration ?? ""];
  for (const [f, v] of Object.entries(initFields)) { argv.push(f, v); }
  return await evalshaWithReload(clientFor(uid), CREATE_USER, [kUser(uid)], argv) as "ok" | "exists";
}
