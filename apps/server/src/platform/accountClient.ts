/**
 * 账号/门户 plane 接缝（DUAL_MODE §2.7 / [WEBPLATFORM.md](../../../../docs/WEBPLATFORM.md)）。
 *
 * 游戏服要访问账号平面（身份/token/角色注册表/撤销/选服目录）**一律走 `account.*`**：
 * - `in-process`（dev/test）→ `inProcessAccount` 直调 `@game/webplatform/lib`（与游戏服共库）；
 * - `http`（prod split）→ `httpAccount` 走 HTTP 指向 apps/WebPlatform 进程（独立账号库）。
 *
 * ⚠ **为什么必须走接缝**：split 下 lib 被注入了**游戏服的池**（`core/infra/mysql.ts`），
 * 在 `platform/` 之外直调 lib 就是打在**组游戏库**上 —— 那里没有 accounts/char_registry，
 * 结果是**静默错误**（`affectedRows=0`、空集）而非报错。由 `test/lib-import-ban.test.ts` 机检。
 *
 * ⚠ 一致性两级（§2.7）：`character` 的**存在性**（register/query/has）是 WebPlatform 权威、强一致；
 * 展示投影（名/等级/头像/上次登录）是业务组 best-effort 推的只读副本，不在本接口的强一致面内（future）。
 */
import type { IAreaListRes } from "@game/shared";
import { ACCOUNT_MODE } from "../core/infra/config";
import { httpAccount } from "./httpAccount";
import { inProcessAccount } from "./inProcessAccount";

export interface AccountClient {
  /** token 反查 uid + 校验（strict=建连回源 MySQL 权威，false=快路径只查组 sess 缓存）。失败抛（09·G1）。 */
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
  /** 封号（账号级）：权威 `status=1 + token_hash=NULL` = **下次登不上**。返回是否命中（false=无此账号）。 */
  ban(uid: string): Promise<boolean>;
  /** 强制下线/换端：权威 `token_hash=NULL`（status 不变，可重新登录换发）。返回是否命中。 */
  revoke(uid: string): Promise<boolean>;
  /** 选服目录 + `ul`（token 可选、best-effort 回填；无效/过期一律空，⛔ 不抛）。 */
  areaList(token: string | null): Promise<IAreaListRes>;
}

/** 当前账号 client：`ACCOUNT_MODE=http`（split）→ httpAccount；否则内嵌 inProcessAccount。 */
export const account: AccountClient = ACCOUNT_MODE() === "http" ? httpAccount : inProcessAccount;
