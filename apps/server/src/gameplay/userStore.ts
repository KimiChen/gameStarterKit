/**
 * 玩法档读路径 + 建号（[03 · 读写分路](../../../../docs/server/03-gateway-data-layer.md#读写分路重要)）。
 *
 * 只读 handler **不取分布式锁、不进脏表**（09·G2）；读别人的档必须 readonly 冻结对象。
 * ⛔ 全文件禁止 HGETALL（09·R1）——一律 HMGET 按需取字段。
 *
 * 字段约定（框架标准字段，05）：货币（gold）权威在 MySQL 不在这里；段位星数为 `star`
 *（applyEffect Lua 的 star 增量正是此字段）；其余标量原名进 user:{uid}。
 */
import { SCHEMA_VERSION } from "../infra/config";
import { activeLruBucketOf, kActiveLru, kUser } from "../infra/keys";
import { clientFor, indexClientFor } from "../infra/redisRoute";
import { CREATE_USER, evalshaWithReload } from "../infra/redisScripts";

/** 自己可见的档视图（07 UserView 按本作实际字段落地，见文件头映射说明）。 */
export interface UserView {
  uid: string;
  star: number;       // 段位星数（源 curStar）
  maxRound: number;
  wins: number;
  losses: number;
  stamina: number;
  /** 体力恢复计时起点（ms）；0 = 满体力/未开始恢复（shared logic/stamina.ts，07 字段表） */
  lastStaminaRecoverAt: number;
  // 音频偏好字段级上云（07 字段表）：缺失=默认开——存量档零迁移，⛔ 不回填
  musicOn: boolean;
  sfxOn: boolean;
  ver: number;
}

/** 看别人主页的公开视图：⛔ 不含私有字段（体力/设置等）。 */
export interface PublicUserView {
  readonly uid: string;
  readonly nickname: string;
  readonly avatarId: number;
  readonly province: string;
  readonly star: number;
  readonly maxRound: number;
  readonly wins: number;
  readonly losses: number;
}

const num = (v: string | null, dflt = 0): number => (v === null ? dflt : Number(v));
/** 布尔偏好读侧兜底：字段缺失 = 默认值（"缺失即默认"模式，存量档零迁移）。 */
const flag = (v: string | null, dflt = true): boolean => (v === null ? dflt : v === "1");

/** 按需取字段。⛔ 禁止 HGETALL。缺失字段返回 null（09·R9：hmget 数组自己 zip）。 */
export async function loadFields(uid: string, fields: string[]): Promise<Record<string, string | null>> {
  const vals = await clientFor(uid).hmget(kUser(uid), ...fields);
  return Object.fromEntries(fields.map((f, i) => [f, vals[i]]));
}

/** 只读自档。档不存在（可能冷档）返回 null——上层决定 ensureLive 还是 404。 */
export async function readUser(uid: string): Promise<UserView | null> {
  const f = await loadFields(uid, [
    "star", "maxRound", "wins", "losses", "stamina", "lastStaminaRecoverAt", "musicOn", "sfxOn", "ver",
  ]);
  if (f.ver === null) { return null; } // 建号必写 ver=0，ver 缺失 ⇒ 档不存在
  return {
    uid,
    star: num(f.star), maxRound: num(f.maxRound), wins: num(f.wins), losses: num(f.losses),
    stamina: num(f.stamina), lastStaminaRecoverAt: num(f.lastStaminaRecoverAt),
    musicOn: flag(f.musicOn), sfxOn: flag(f.sfxOn),
    ver: num(f.ver),
  };
}

/** 只读他档：冻结对象，任何赋值直接 TypeError——绝不可能把别人的档 flush 回去（03）。 */
export async function readUserReadonly(targetUid: string): Promise<PublicUserView | null> {
  const f = await loadFields(targetUid, ["nickname", "avatarId", "province", "star", "maxRound", "wins", "losses", "ver"]);
  if (f.ver === null) { return null; }
  return Object.freeze({
    uid: targetUid,
    nickname: f.nickname ?? "", avatarId: num(f.avatarId, -1), province: f.province ?? "",
    star: num(f.star), maxRound: num(f.maxRound), wins: num(f.wins), losses: num(f.losses),
  });
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
