/**
 * 账号 plane 接缝（docs/DUAL_MODE.md §2.7 / M12c）。
 *
 * 业务侧对「身份/token/角色注册表」的一切访问走本接口，不再直连 core/auth 或手写 char_registry SQL。
 * - Step 1（当前）：`inProcessAccount` 同进程实现，委托现有函数/表，⛔ 零行为变化。
 * - Step 2：`account` 换成指向 apps/WebPlatform（MySQL-only）的 HTTP client，本接口与调用点不动。
 *
 * ⚠ 一致性两级（§2.7）：`character` 的**存在性**（register/query/has）是 WebPlatform 权威、强一致；
 * 展示投影（名/等级/头像/上次登录）是业务组 best-effort 推的只读副本，不在本接口的强一致面内（future）。
 */
import { verifyBearer } from "../core/auth/session";
import { getPool } from "../core/infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../core/infra/mysql";

export interface AccountClient {
  /** token 反查 uid + 校验（strict=建连回源 MySQL epoch/status，false=快路径只查 sess）。失败抛（09·G1）。 */
  verify(token: string, strict: boolean): Promise<string>;
  character: {
    /** 建角登记 char_registry 行（存在性权威；§2.6 排序上先于 Redis 档）。幂等。 */
    register(uid: string, sId: number): Promise<void>;
    /** uid 在哪些区建过角（ul 源）。 */
    query(uid: string): Promise<number[]>;
    /** uid 在本区是否建过角（F4「本区建过角没」判据，sId≥1）。 */
    has(uid: string, sId: number): Promise<boolean>;
  };
  /** uid 是否真账号（F4「是不是真账号」判据，sId=0）。 */
  accountExists(uid: string): Promise<boolean>;
}

/** 同进程实现（M12c Step 1）：委托现有函数/表，零行为变化。Step 2 由 HTTP client 替换。 */
export const inProcessAccount: AccountClient = {
  verify: (token, strict) => verifyBearer(token, strict),
  character: {
    async register(uid, sId) {
      await getPool().execute<ResultSetHeader>(
        "INSERT INTO char_registry (user_id, server_id) VALUES (?,?) ON DUPLICATE KEY UPDATE user_id = user_id", // ⛔ 非 INSERT IGNORE（09·DB1）
        [uid, sId]);
    },
    async query(uid) {
      const [rows] = await getPool().query<RowDataPacket[]>(
        "SELECT server_id FROM char_registry WHERE user_id = ? ORDER BY created_at", [uid]);
      return rows.map((r) => Number(r.server_id));
    },
    async has(uid, sId) {
      const [rows] = await getPool().query<RowDataPacket[]>(
        "SELECT 1 FROM char_registry WHERE user_id = ? AND server_id = ? LIMIT 1", [uid, sId]);
      return rows.length > 0;
    },
  },
  async accountExists(uid) {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT 1 FROM accounts WHERE user_id = ? LIMIT 1", [uid]);
    return rows.length > 0;
  },
};

/** 当前账号 client（M12c Step 2 起指向 apps/WebPlatform 的 HTTP 实现）。 */
export const account: AccountClient = inProcessAccount;
