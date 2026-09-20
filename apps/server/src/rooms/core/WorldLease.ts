/**
 * 世界权威租约（MMO MF4-B4，docs/MMO.md §4.5 Recovering / §5.4 MF4）：Redis 侧「谁在跑这条分线」的快速排他 + 失效检测，
 * 与 MySQL `world_instance.authority_epoch`（control.ts）配合——租约决定**谁能开始**，epoch 决定**谁的提交算数**；⛔ 不逐 tick 碰 MySQL。
 *
 * - 取租：`WORLD_LEASE_ACQUIRE` 一条 Lua：fence INCR 发号 + `SET NX PX ttl`（value = `<holder>:<fence>`）；已被持有 ⇒ `held`。
 * - 续租：`WORLD_LEASE_RENEW` CAS：value 逐字等于自己的才 PEXPIRE，否则 `lost`（被顶替 / 已过期后被别人拿走 / 键被清）。
 * - 释放：`WORLD_LEASE_RELEASE` CAS：只删自己的。
 * - `start(onLost)`：按 renewMs 续租，`lost`（或连续 I/O 失败跨过 ttl）⇒ 回调一次（WorldRoom 据此 Draining）；⛔ 不重试取租。
 * 时钟 / 定时器可注入（无头单测）；Lua 语义只在 test:int（真 Redis）上钉。⛔ 不 import colyseus（rooms/core 导入闸）。
 */
import type Redis from "ioredis";
import { WORLD_LEASE_RENEW_MS, WORLD_LEASE_TTL_MS } from "../../core/infra/config";
import { kWorldFence, kWorldLease } from "../../core/infra/keys";
import { coordClient } from "../../core/infra/redisRoute";
import { defineScript, evalshaWithReload } from "../../core/infra/redisScripts";

/** KEYS=[kWorldLease, kWorldFence] ARGV=[holder, ttlMs] → ['ok', fence] | ['held', currentValue] */
export const WORLD_LEASE_ACQUIRE = defineScript("worldLeaseAcquire", `
local cur = redis.call('GET', KEYS[1])
if cur ~= false then return { 'held', cur } end
local fence = redis.call('INCR', KEYS[2])
local value = ARGV[1] .. ':' .. tostring(fence)
-- GET 闸后本键必然缺失（Lua 原子段内无并发写）；仍带 NX 保持「⛔ 不覆盖既有租约」的语义显式可见（变异：改成无条件 SET → 双持有转红）
redis.call('SET', KEYS[1], value, 'NX', 'PX', ARGV[2])
return { 'ok', fence }
`);

/** KEYS=[kWorldLease] ARGV=[value, ttlMs] → 'renewed' | 'lost' */
export const WORLD_LEASE_RENEW = defineScript("worldLeaseRenew", `
local cur = redis.call('GET', KEYS[1])
if cur == false or cur ~= ARGV[1] then return 'lost' end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 'renewed'
`);

/** KEYS=[kWorldLease] ARGV=[value] → 1 | 0 */
export const WORLD_LEASE_RELEASE = defineScript("worldLeaseRelease", `
local cur = redis.call('GET', KEYS[1])
if cur == false or cur ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1
`);

export type WorldLeaseRedis = Pick<Redis, "evalsha" | "script" | "eval">;

export interface WorldLeaseDeps {
    /** coord Redis getter（每次取以容 ioredis 重连）。 */
    readonly client: () => WorldLeaseRedis;
    readonly ttlMs: number;
    readonly renewMs: number;
    readonly setTimer: (fn: () => void, ms: number) => unknown;
    readonly clearTimer: (handle: unknown) => void;
    readonly now: () => number;
}

export const defaultWorldLeaseDeps: WorldLeaseDeps = {
    client: () => coordClient(),
    ttlMs: WORLD_LEASE_TTL_MS,
    renewMs: WORLD_LEASE_RENEW_MS,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
    now: () => Date.now(),
};

export type WorldLeaseRenewOutcome = "renewed" | "lost" | "unknown";

export class WorldLease {
    private timer: unknown = null;
    private lostNotified = false;
    private lastRenewedAt: number;
    private stopped = false;

    private constructor(
        readonly sId: number,
        readonly instanceId: string,
        readonly holder: string,
        readonly fence: number,
        private readonly deps: WorldLeaseDeps,
    ) {
        this.lastRenewedAt = deps.now();
    }

    /** 租约 value（`<holder>:<fence>`）；Lua 侧 CAS 用。 */
    get value(): string {
        return `${this.holder}:${this.fence}`;
    }

    /** 取租：拿到返回租约，被持有返回 null（⛔ 不等待、不重试——Recovering 的调用方决定退出还是稍后再试）。 */
    static async acquire(sId: number, instanceId: string, holder: string, deps: WorldLeaseDeps = defaultWorldLeaseDeps): Promise<WorldLease | null> {
        if (!Number.isSafeInteger(sId) || sId < 0 || sId > 0xffff) throw new RangeError(`[WorldLease] sId 非法：${String(sId)}`);
        if (typeof instanceId !== "string" || instanceId.length === 0 || instanceId.length > 64) throw new RangeError("[WorldLease] instanceId 必须是 1..64 字符");
        if (typeof holder !== "string" || holder.length === 0 || holder.length > 64 || holder.includes(":")) throw new RangeError("[WorldLease] holder 必须是 1..64 字符且不含 ':'");
        if (deps.renewMs < 1 || deps.renewMs * 3 > deps.ttlMs) throw new RangeError(`[WorldLease] renewMs(${deps.renewMs}) * 3 必须 ≤ ttlMs(${deps.ttlMs})`);
        const reply = await evalshaWithReload(deps.client() as Redis, WORLD_LEASE_ACQUIRE, [kWorldLease(sId, instanceId), kWorldFence(sId, instanceId)], [holder, deps.ttlMs]);
        if (!Array.isArray(reply) || reply.length < 2) throw new Error(`[WorldLease] acquire 返回非法：${JSON.stringify(reply)}`);
        if (reply[0] === "held") return null;
        if (reply[0] !== "ok") throw new Error(`[WorldLease] acquire 返回非法：${JSON.stringify(reply)}`);
        const fence = Number(reply[1]);
        if (!Number.isSafeInteger(fence) || fence < 1) throw new Error(`[WorldLease] fence 非法：${String(reply[1])}`);
        return new WorldLease(sId, instanceId, holder, fence, deps);
    }

    /** 续租一次：`renewed` / `lost`（CAS 不匹配）/ `unknown`（I/O 失败，租约状态未知；连续 unknown 跨过 ttl 视同 lost）。 */
    async renew(): Promise<WorldLeaseRenewOutcome> {
        let reply: unknown;
        try {
            reply = await evalshaWithReload(this.deps.client() as Redis, WORLD_LEASE_RENEW, [kWorldLease(this.sId, this.instanceId)], [this.value, this.deps.ttlMs]);
        } catch {
            return "unknown";
        }
        if (reply === "renewed") {
            this.lastRenewedAt = this.deps.now();
            return "renewed";
        }
        return "lost";
    }

    /** 释放（只删自己的）；停止续租循环。 */
    async release(): Promise<boolean> {
        this.stop();
        try {
            const reply = await evalshaWithReload(this.deps.client() as Redis, WORLD_LEASE_RELEASE, [kWorldLease(this.sId, this.instanceId)], [this.value]);
            return reply === 1;
        } catch {
            return false;
        }
    }

    /**
     * 续租循环：每 renewMs 续一次；`lost` 或自上次成功续租起超过 ttlMs 仍未成功（连续 I/O 失败）⇒ `onLost` 恰一次并停止。
     * ⛔ 不在这里重新取租（失租后的世界必须 Draining，让新权威从检查点重建）。
     */
    start(onLost: (reason: "lost" | "expired") => void): void {
        if (this.timer !== null || this.stopped) return;
        const tick = async (): Promise<void> => {
            if (this.stopped) return;
            const outcome = await this.renew();
            if (this.stopped) return;
            if (outcome === "lost") { this.notifyLost(onLost, "lost"); return; }
            if (outcome === "unknown" && this.deps.now() - this.lastRenewedAt >= this.deps.ttlMs) { this.notifyLost(onLost, "expired"); return; }
            this.timer = this.deps.setTimer(() => { void tick(); }, this.deps.renewMs);
        };
        this.timer = this.deps.setTimer(() => { void tick(); }, this.deps.renewMs);
    }

    stop(): void {
        this.stopped = true;
        if (this.timer !== null) {
            this.deps.clearTimer(this.timer);
            this.timer = null;
        }
    }

    private notifyLost(onLost: (reason: "lost" | "expired") => void, reason: "lost" | "expired"): void {
        this.stop();
        if (this.lostNotified) return;
        this.lostNotified = true;
        onLost(reason);
    }
}
