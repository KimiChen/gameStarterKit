/**
 * 玩家档记录原语（框架层）：建号 / 活跃索引 / 按需取字段。
 *
 * 玩法视图（UserView 等）在 src/player/userStore.ts——那边才是日常加档字段的地方；
 * 本文件是 uow 提交尾部 / 登录点 / 端点读路径共同依赖的底座，⛔ 不放玩法字段知识。
 * ⛔ 全仓库禁止 HGETALL（09·R1）——一律 HMGET 按需取字段。
 */
import { SCHEMA_VERSION } from "./infra/config";
import { activeLruBucketOf, kActiveLru, kUser } from "./infra/keys";
import { clientFor, indexClientFor } from "./infra/redisRoute";
import { CREATE_USER, evalshaWithReload } from "./infra/redisScripts";

/** 按需取字段。⛔ 禁止 HGETALL。缺失字段返回 null（09·R9：hmget 数组自己 zip）。 */
export async function loadFields(uid: string, fields: string[]): Promise<Record<string, string | null>> {
  const vals = await clientFor(uid).hmget(kUser(uid), ...fields);
  return Object.fromEntries(fields.map((f, i) => [f, vals[i]]));
}

/** 刷活跃索引（登录点 + withUser 写提交尾部共同构成完整索引，冷档候选靠它，08）。 */
export async function touchActive(uid: string): Promise<void> {
  const bucket = activeLruBucketOf(uid);
  await indexClientFor(bucket).zadd(kActiveLru(bucket), Date.now(), uid);
}

/**
 * 建号创建 user:{uid}（唯一合法创建点之一，另一个是 thaw，09·R2）。
 * 原子 Lua：已存在则不动返回 'exists'——重复建号绝不清档。
 */
export async function createUser(
  uid: string,
  initFields: Record<string, string> = {},
): Promise<"ok" | "exists"> {
  const argv: string[] = [String(SCHEMA_VERSION), String(Date.now())];
  for (const [f, v] of Object.entries(initFields)) { argv.push(f, v); }
  return await evalshaWithReload(clientFor(uid), CREATE_USER, [kUser(uid)], argv) as "ok" | "exists";
}
