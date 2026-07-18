/**
 * 玩家档玩法视图（读路径，[03 · 读写分路](docs/SERVER.md)）。
 *
 * **日常加玩家档字段的流程**：shared 的 IUserView（protocol/lobbyRpc/user.ts，类型真源）
 * → 本文件 readUser 字段列表 → 07 字段表；跨版本演进另需
 * core/archive/lazyMigrate.ts 写迁移步骤。建号/活跃索引/按需取字段等框架原语在 core/userRecord.ts。
 *
 * 只读 handler **不取分布式锁、不进脏表**（09·G2）；读别人的档必须 readonly 冻结对象。
 * 字段约定（框架标准字段，05）：货币（gold）权威在 MySQL 不在这里；段位星数为 `star`
 *（applyEffect Lua 的 star 增量正是此字段）；其余标量原名进 user:{uid}。
 */
import type { IPublicUserView, IUserView } from "@game/shared";
import { loadFields } from "../core/userRecord";

/** 自己可见的档视图 —— 类型真源在 shared/protocol/lobbyRpc/user.ts 的 IUserView（双端同一定义）。 */
export type UserView = IUserView;

/** 他档公开视图 —— 真源 IPublicUserView，⛔ 不含私有字段（体力/设置等）。 */
export type PublicUserView = IPublicUserView;

const num = (v: string | null, dflt = 0): number => (v === null ? dflt : Number(v));
/** 布尔偏好读侧兜底：字段缺失 = 默认值（"缺失即默认"模式，存量档零迁移）。 */
const flag = (v: string | null, dflt = true): boolean => (v === null ? dflt : v === "1");

/** 只读自档。档不存在（可能冷档）返回 null——上层决定 ensureLive 还是 404。 */
export async function readUser(uid: string): Promise<UserView | null> {
  const f = await loadFields(uid, [
    "star", "maxRound", "wins", "losses", "stamina", "lastStaminaRecoverAt", "musicOn", "sfxOn", "guildId", "ver",
  ]);
  if (f.ver === null) { return null; } // 建号必写 ver=0，ver 缺失 ⇒ 档不存在
  return {
    uid,
    star: num(f.star), maxRound: num(f.maxRound), wins: num(f.wins), losses: num(f.losses),
    stamina: num(f.stamina), lastStaminaRecoverAt: num(f.lastStaminaRecoverAt),
    musicOn: flag(f.musicOn), sfxOn: flag(f.sfxOn),
    guildId: num(f.guildId), // 缺失 = 0 = 无工会（缺失即默认，⛔ 不回填）
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
