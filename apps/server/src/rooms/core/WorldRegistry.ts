/**
 * WorldRegistry（MMO MF10-B1 / B2，docs/MMO.md §5.4 MF10）：分线的**实时**登记——权威房把 `seated / capacity / publicAddress / holder / mode`
 * 写进 coord Redis HASH（`kWorldInfo`，PX=WORLD_INFO_TTL_MS，按续租节拍刷新；房崩溃 ⇒ 到期自愈）。消费方：
 *  - `WorldDirectory.allocate`（满员开新线：seated ≥ capacity 视为满；无登记 = 空实例，0 人）；
 *  - `world.enter` 的 endpoint（D27：实例所在 world 进程的公开地址；无登记 ⇒ 回落 WORLD_PUBLIC_WS_URL）；
 *  - 运维只读面（MF10-B3）；
 *  - kit 卸载的分线闸（MK4-B3，tools/plugin/instanceGate.ts）：`mode` 把「权威租约还在的分线」归属到 kit。
 * 权威仍在 world_instance 表（登记只是提示，⛔ 参与任何 CAS）。⛔ 不 import colyseus / rooms/modes / websocket（rooms/core 导入闸）。
 */
import type { Redis } from "ioredis";
import { WORLD_INFO_TTL_MS } from "../../core/infra/config";
import { kWorldInfo } from "../../core/infra/keys";
import { coordClient } from "../../core/infra/redisRoute";

export interface WorldInstanceInfo {
    readonly seated: number;
    readonly capacity: number;
    /** 承载该分线的 world 进程公开 ws 地址（空串 = 未配置 / 同当前区 gameWsUrl）。 */
    readonly publicAddress: string;
    readonly holder: string;
    /** 承载该分线的 world mode id（MK4-B3：卸载分线闸按它把「在租的分线」归属到 kit；"" = 发布方未登记 mode）。 */
    readonly mode: string;
    readonly updatedAt: number;
}

/** 发布入参：updatedAt 缺省取时钟；mode 缺省 ""（旧发布方 / 壳单测），读出来恒为字符串。 */
export type WorldInstancePublish = Omit<WorldInstanceInfo, "updatedAt" | "mode"> & { readonly updatedAt?: number; readonly mode?: string };

export interface WorldRegistryPort {
    publish(sId: number, instanceId: string, info: WorldInstancePublish): Promise<void>;
    read(sId: number, instanceId: string): Promise<WorldInstanceInfo | null>;
    forget(sId: number, instanceId: string): Promise<void>;
}

type RegistryRedis = Pick<Redis, "hset" | "pexpire" | "hgetall" | "del" | "multi">;

function infoOf(raw: Record<string, string>): WorldInstanceInfo | null {
    if (!raw || typeof raw.seated !== "string") return null;
    const seated = Number(raw.seated);
    const capacity = Number(raw.capacity);
    const updatedAt = Number(raw.updatedAt);
    if (!Number.isSafeInteger(seated) || seated < 0 || !Number.isSafeInteger(capacity) || capacity < 0) return null;
    return {
        seated, capacity, publicAddress: typeof raw.publicAddress === "string" ? raw.publicAddress : "", holder: typeof raw.holder === "string" ? raw.holder : "",
        mode: typeof raw.mode === "string" ? raw.mode : "", updatedAt: Number.isSafeInteger(updatedAt) ? updatedAt : 0,
    };
}

export class RedisWorldRegistry implements WorldRegistryPort {
    constructor(private readonly client: () => RegistryRedis = coordClient, private readonly ttlMs: number = WORLD_INFO_TTL_MS, private readonly now: () => number = () => Date.now()) {}

    async publish(sId: number, instanceId: string, info: WorldInstancePublish): Promise<void> {
        const key = kWorldInfo(sId, instanceId);
        await this.client().multi()
            .hset(key, {
                seated: String(info.seated), capacity: String(info.capacity), publicAddress: info.publicAddress, holder: info.holder,
                mode: info.mode ?? "", updatedAt: String(info.updatedAt ?? this.now()),
            })
            .pexpire(key, this.ttlMs)
            .exec();
    }

    async read(sId: number, instanceId: string): Promise<WorldInstanceInfo | null> {
        const raw = await this.client().hgetall(kWorldInfo(sId, instanceId));
        return infoOf(raw);
    }

    async forget(sId: number, instanceId: string): Promise<void> {
        await this.client().del(kWorldInfo(sId, instanceId));
    }
}

/** 内存登记（壳单测 / 目录单测）：同语义（含 TTL：按注入时钟过期）。 */
export class MemoryWorldRegistry implements WorldRegistryPort {
    readonly entries = new Map<string, WorldInstanceInfo & { readonly expiresAt: number }>();
    readonly log: string[] = [];

    constructor(private readonly now: () => number = () => Date.now(), private readonly ttlMs: number = WORLD_INFO_TTL_MS) {}

    async publish(sId: number, instanceId: string, info: WorldInstancePublish): Promise<void> {
        const updatedAt = info.updatedAt ?? this.now();
        this.entries.set(`${sId}:${instanceId}`, { ...info, mode: info.mode ?? "", updatedAt, expiresAt: updatedAt + this.ttlMs });
        this.log.push(`publish:${instanceId}:${info.seated}/${info.capacity}`);
    }

    async read(sId: number, instanceId: string): Promise<WorldInstanceInfo | null> {
        const entry = this.entries.get(`${sId}:${instanceId}`);
        if (!entry) return null;
        if (entry.expiresAt <= this.now()) { this.entries.delete(`${sId}:${instanceId}`); return null; }
        const { expiresAt: _e, ...info } = entry;
        return info;
    }

    async forget(sId: number, instanceId: string): Promise<void> {
        this.entries.delete(`${sId}:${instanceId}`);
        this.log.push(`forget:${instanceId}`);
    }
}

export const redisWorldRegistry = new RedisWorldRegistry();
