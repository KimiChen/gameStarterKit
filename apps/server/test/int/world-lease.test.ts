/**
 * MMO MF4-B4 世界权威租约真 Redis 回归（docs/MMO.md §5.4 MF4；coord Redis 上的三条 Lua）：
 *  - 同实例两个持有者争抢只一个 Active（第二个 `held`）；fence 单调发号；
 *  - 持有者停止续租 ⇒ TTL 过期 ⇒ 顶替者取到新 fence ⇒ 旧持有者续租 `lost`、续租循环回调 onLost 恰一次（→ Draining）；
 *  - 释放只删自己的；旧 fence 的 value 释放 / 续租不了新租约；
 *  - `renew * 3 ≤ ttl` 构造期断言。
 * 前置：本地 Redis 栈已启动。⚠ int 文件只能单文件串行跑。
 * 变异验证：WORLD_LEASE_RENEW 不比 value 直接 PEXPIRE（续租永不过期）→ 「顶替后旧持有者 lost」转红；ACQUIRE 改无条件 SET → 「只一个持有者」转红。
 */
import "./env-setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { kWorldFence, kWorldLease } from "../../src/core/infra/keys";
import { closeRedis, coordClient } from "../../src/core/infra/redisRoute";
import { WorldLease, defaultWorldLeaseDeps, type WorldLeaseDeps } from "../../src/rooms/core/WorldLease";
import { assertRedisUp, sleep, testUid } from "./helpers";

const SID = 0;
const instances: string[] = [];
const instance = (n: string): string => { const id = `wl_${testUid(n).slice(-16)}`; instances.push(id); return id; };
const deps = (ttlMs: number, renewMs: number): WorldLeaseDeps => ({ ...defaultWorldLeaseDeps, ttlMs, renewMs });

after(async () => {
    const keys = instances.flatMap((id) => [kWorldLease(SID, id), kWorldFence(SID, id)]);
    if (keys.length > 0) await coordClient().unlink(...keys);
    await closeRedis();
});

test("同实例争抢只一个持有者；fence 单调；释放只删自己的；构造期断言 renew*3 ≤ ttl", async () => {
    await assertRedisUp();
    const id = instance("race");
    const [a, b] = await Promise.all([WorldLease.acquire(SID, id, "node-a", deps(1_500, 500)), WorldLease.acquire(SID, id, "node-b", deps(1_500, 500))]);
    const winner = a ?? b;
    assert.ok(winner, "必须有一个赢家");
    assert.equal(a === null || b === null, true, "只一个 Active");
    assert.equal(winner.fence, 1, "首个 fence = 1");
    assert.equal(await winner.renew(), "renewed");
    assert.equal(await WorldLease.acquire(SID, id, "node-c", deps(1_500, 500)), null, "被持有 ⇒ held");
    assert.equal(await winner.release(), true);
    assert.equal(await winner.release(), false, "已释放再放 ⇒ 0（只删自己的、幂等）");
    const next = await WorldLease.acquire(SID, id, "node-c", deps(1_500, 500));
    assert.ok(next);
    assert.equal(next.fence, 2, "fence 永不重置、单调");
    assert.equal(await winner.renew(), "lost", "旧 fence 的 value 续不了新租约");
    await next.release();
    await assert.rejects(WorldLease.acquire(SID, id, "node-d", deps(1_000, 400)), RangeError, "renew*3 > ttl 拒");
    await assert.rejects(WorldLease.acquire(SID, id, "bad:holder", deps(1_500, 500)), RangeError);
});

test("丢租 ⇒ Draining：持有者停续租 → TTL 过期 → 顶替者取到新 fence → 旧持有者续租 lost、续租循环 onLost 恰一次", { timeout: 20_000 }, async () => {
    await assertRedisUp();
    const id = instance("lost");
    const a = await WorldLease.acquire(SID, id, "node-a", deps(900, 300));
    assert.ok(a);
    // a 不续租（模拟卡死 / 分区）；TTL 过期后 b 取到租约
    await sleep(1_200);
    const b = await WorldLease.acquire(SID, id, "node-b", deps(900, 300));
    assert.ok(b, "过期后顶替者能取到");
    assert.equal(b.fence, 2);
    assert.equal(await a.renew(), "lost", "旧持有者续租 lost（value 不匹配）");
    // 续租循环：b 正常续租；a 起循环 ⇒ 第一次 tick 即 lost ⇒ onLost 恰一次
    let bLost = 0;
    b.start(() => { bLost += 1; });
    let aLost: string[] = [];
    a.start((reason) => { aLost.push(reason); });
    await sleep(1_000);
    assert.deepEqual(aLost, ["lost"], "旧持有者 onLost 恰一次");
    assert.equal(bLost, 0, "顶替者续租正常");
    assert.equal(await coordClient().get(kWorldLease(SID, id)), b.value);
    b.stop();
    // 停止续租后 TTL 内 value 仍是 b 的；过期后键消失
    await sleep(1_200);
    assert.equal(await coordClient().exists(kWorldLease(SID, id)), 0, "停续租 ⇒ 自然过期");
    assert.equal(await b.renew(), "lost");
    await b.release();
    a.stop();
});
