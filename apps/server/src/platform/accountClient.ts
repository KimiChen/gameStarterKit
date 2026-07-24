/**
 * 账号 plane 接缝（docs/DUAL_MODE.md §2.7 / M12c）。
 *
 * 业务侧对「身份/token/角色注册表」的一切访问走本接口，不再直连 core/auth 或手写 char_registry SQL。
 * - Step 1：同进程实现（inProcessAccount）委托现有函数。
 * - 2b-2：账号逻辑迁 `@game/webplatform`（MySQL-only lib）；`inProcessAccount` 内嵌委托它（dev/test 不走 HTTP）。
 * - 2c：`httpAccount` 走 HTTP 指向 apps/WebPlatform 进程（prod-split）；本接口与调用点不动。
 *
 * ⚠ 一致性两级（§2.7）：`character` 的**存在性**（register/query/has）是 WebPlatform 权威、强一致；
 * 展示投影（名/等级/头像/上次登录）是业务组 best-effort 推的只读副本，不在本接口的强一致面内（future）。
 */
import { verifyBearer } from "../core/auth/session";
import { accountExists, characterHas, characterRegister, characterZones } from "@game/webplatform/lib";
// 池共用注入在 core/infra/mysql.ts（池模块，注入可靠）——见那里的 useServerPool。

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

/** 同进程实现：character/accountExists 委托 `@game/webplatform` lib（MySQL-only）；verify 暂走 core/auth（2b-2 后续迁）。 */
export const inProcessAccount: AccountClient = {
  verify: (token, strict) => verifyBearer(token, strict),
  character: {
    register: (uid, sId) => characterRegister(uid, sId),
    query: (uid) => characterZones(uid),
    has: (uid, sId) => characterHas(uid, sId),
  },
  accountExists: (uid) => accountExists(uid),
};

/** 当前账号 client（M12c Step 2c 起可切 httpAccount 指向 apps/WebPlatform 进程）。 */
export const account: AccountClient = inProcessAccount;
