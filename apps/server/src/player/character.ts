/**
 * 建角（DUAL_MODE §2.6 / M12a）：玩家**首进某区**时创建该区角色。
 *
 * 两件事，⚠ **顺序固定**：
 *  ① `char_registry` 行（durable 区成员标记，F4「本区建过角没」判据 + ul 源）——**先写**；
 *  ② `s{sId}_user` per-zone 玩法档（core createUser，唯一合法建点 09·R2）——后建。
 * 于是「有档 ⇒ 必有 char 行」恒成立（无 false-negative 静默丢档，§2.6）；两步都幂等，
 * 中途崩溃下次进区自愈（char 行 ODKU no-op、createUser 'exists'）。
 *
 * ⚠ 建号 vs 建角：登录建的是**基础前缀档**（sId=0，大混服/大厅基线，见 auth/wxLogin）；
 * 区服的 per-zone 角色档在此按 sId≥1 建。大混服（sId=0）此处 createUser 命中 'exists'（登录已建），
 * 仅补一条 char_registry 行（无害，供 ul 统一）。
 */
import { STAMINA_MAX } from "@game/shared";
import { zoneCtx } from "../core/infra/keys";
import { createUser } from "../core/userRecord";
import { account } from "../platform/accountClient";

/** 首进区角色初始字段（与登录建号一致；缺 musicOn/sfxOn = 读侧默认开，07 字段表）。 */
const zoneCharInit = (): Record<string, string> => ({
  registerTime: String(Date.now()),
  stamina: String(STAMINA_MAX),
  lastStaminaRecoverAt: "0", // 满体力：恢复计时未开始
  avatarId: "-1",
});

/** 幂等建角：char_registry 行先写，再建 s{sId}_user。失败不抛给连接（调用方 best-effort，重连自愈）。 */
export async function ensureCharacter(uid: string, sId: number): Promise<void> {
  await account.character.register(uid, sId);              // char_registry 行先写（§2.6，走账号 plane 接缝）
  await zoneCtx.run({ sId }, () => createUser(uid, zoneCharInit()));
}

/** 查 uid 在哪些区建过角（喂 ul「我的区」/ F4 判据）。M12c：委托账号 plane 接缝（Step 2 起远调 WebPlatform）。 */
export async function listCharacterZones(uid: string): Promise<number[]> {
  return account.character.query(uid);
}
