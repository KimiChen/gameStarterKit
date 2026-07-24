/**
 * 账号身份/令牌原语（accounts）—— WebPlatform 权威（DUAL_MODE §2.7）。MySQL-only，⛔ 无 Redis。
 * 令牌签发/校验/撤销随 2b-2 后续子步迁入；此处先放 accountExists（F4「是不是真账号」判据）。
 */
import { getPool } from "./mysql";
import type { RowDataPacket } from "./mysql";

/** uid 是否真账号（F4 sId=0 判据）。 */
export async function accountExists(uid: string): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT 1 FROM accounts WHERE user_id = ? LIMIT 1", [uid]);
  return rows.length > 0;
}
