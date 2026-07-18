/**
 * 每 RPC 工作单元（[03 · UnitOfWork](docs/SERVER.md)）。
 *
 * 脏追踪必须**每 RPC 作用域**（09·R8）：⛔ module 级全局脏表会在 await 点被别的玩家 RPC
 * 改写，把 A 的改动 flush 进 B；⛔ 也不用 Proxy 魔术拦截——`set()` 显式记脏。
 * `lock → load → mutate → commit / rollback` 是单一提交边界：没 commit 就没写，天然不落。
 */
import { kUser } from "./infra/keys";
import { clientFor } from "./infra/redisRoute";
import { CAS_HSET, evalshaWithReload } from "./infra/redisScripts";
import { ColdUserError, StaleFenceError } from "./errors";
import { withUserLock } from "./locks";
import { touchActive } from "./userRecord";

export class UnitOfWork {
  private dirty = new Map<string, string>(); // 作用域对象，绝不是单例（09·R8）

  constructor(readonly uid: string, readonly fence: number) {}

  /** 本次请求是否有待写字段（withUser 尾部据此接线活跃索引）。 */
  get hasDirty(): boolean { return this.dirty.size > 0; }

  /** 按需取字段（⛔ 禁止 HGETALL，09·R1）。缺失字段为 null。 */
  async loadFields(fields: string[]): Promise<Record<string, string | null>> {
    // ioredis 的 hmget 返回与请求字段顺序对齐的数组（缺失为 null），不是对象——自己 zip（09·R9）
    const vals = await clientFor(this.uid).hmget(kUser(this.uid), ...fields);
    return Object.fromEntries(fields.map((f, i) => [f, vals[i]]));
  }

  set(field: string, value: string): void { this.dirty.set(field, value); }

  /** 单条 Lua casHset：fence CAS + 只写脏字段 + bump ver。stale → 抛（客户端自动重试）。 */
  async commit(): Promise<void> {
    if (this.dirty.size === 0) { return; }
    const argv: string[] = [String(this.fence)];
    for (const [f, v] of this.dirty) { argv.push(f, v); }
    const r = await evalshaWithReload(clientFor(this.uid), CAS_HSET, [kUser(this.uid)], argv);
    if (r === "stale") { throw new StaleFenceError(); }
    if (r === "cold") { throw new ColdUserError(); } // 档已冻结：上层 ensureLive 后重试（08）
    this.dirty.clear();
  }

  discard(): void { this.dirty.clear(); }
}

/**
 * 写路径入口：localMutex → 跨实例锁 → UoW → fn → commit（[03]）。
 * 只读请求⛔不要走这里（09·G2）——用 userStore 的 readUser / readUserReadonly。
 * commit 尾部接线活跃索引（10·M5：与 M3 登录点一起构成完整 active:lru）。
 */
export async function withUser<T>(uid: string, fn: (uow: UnitOfWork) => Promise<T>): Promise<T> {
  return withUserLock(uid, async (fence) => {
    const uow = new UnitOfWork(uid, fence);
    try {
      const r = await fn(uow);
      const wrote = uow.hasDirty;
      if (wrote) { uow.set("lastActiveAt", String(Date.now())); }
      await uow.commit();
      // 活跃索引是派生数据：commit 成功后尽力刷，失败靠下次写/登录补，不影响本次正确性
      if (wrote) { await touchActive(uid).catch(() => {}); }
      return r;
    } catch (e) {
      uow.discard(); // 没 commit 就没写，天然不落
      throw e;
    }
  });
}
