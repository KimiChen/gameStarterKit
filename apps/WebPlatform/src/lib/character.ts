/**
 * 角色/足迹注册表 char_registry —— WebPlatform 权威（DUAL_MODE §2.7 / U5）。
 * 存在性权威（register/query/has 喂 F4 + ul）；展示投影列（name/level/avatar/last_login）future。
 * MySQL-only，⛔ 无 Redis。
 */
import { getPool } from "./mysql";
import type { ResultSetHeader, RowDataPacket } from "./mysql";

/** 建角登记 char_registry 行（存在性权威；§2.6 排序上先于 Redis 档）。幂等。 */
export async function characterRegister(uid: string, sId: number): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "INSERT INTO char_registry (user_id, server_id) VALUES (?,?) ON DUPLICATE KEY UPDATE user_id = user_id", // ⛔ 非 INSERT IGNORE（09·DB1）
    [uid, sId]);
}

/** uid 在哪些区建过角（ul 源）。 */
export async function characterZones(uid: string): Promise<number[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT server_id FROM char_registry WHERE user_id = ? ORDER BY created_at", [uid]);
  return rows.map((r) => Number(r.server_id));
}

/** uid 在本区是否建过角（F4「本区建过角没」判据，sId≥1）。 */
export async function characterHas(uid: string, sId: number): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT 1 FROM char_registry WHERE user_id = ? AND server_id = ? LIMIT 1", [uid, sId]);
  return rows.length > 0;
}
