/**
 * 多 world 进程启用路径的纯判定（MMO MF10-B2，docs/MMO.md §5.4 MF10 / D27）：
 *  - `WORLD_MULTI_PROCESS=1` 时才需要 RedisDriver / RedisPresence（多个 world 进程之间共享房间列表 / IPC；lobby / game 进程不需要：
 *    客户端先由 lobby world.enter 取凭据 / 端点，再向 world 端 joinOrCreate；lobby 不调用 matchmaker 创建世界房）；
 *  - 承载 driver / presence 的 Redis **必须是独立实例**（host:port 与 durable / coord 都不同；⛔ 独立 db 不够：Pub/Sub 是实例全局的，
 *    roomcaches / roomcount / $lobby 等固定键名与频道不可加前缀，见 app.config.ts 多项目段）——加载期断言，错配即拒启。
 * 纯函数便于单测（config.ts 在加载期调用一次）。
 */
export interface WorldMultiProcessInput {
    readonly multiProcess: number;
    readonly colyseusUrl: string;
    readonly durableUrl: string;
    readonly coordUrl: string;
}

export interface WorldMultiProcessVerdict {
    readonly enabled: boolean;
    /** 启用时 = REDIS_COLYSEUS_URL；未启用 = ""。 */
    readonly colyseusUrl: string;
}

/** `redis://host:port/db` → `host:port`（小写；无端口补 6379）；解析失败 ⇒ 原串。 */
export function redisInstanceOf(url: string): string {
    try {
        const parsed = new URL(url);
        const port = parsed.port === "" ? "6379" : parsed.port;
        return `${parsed.hostname.toLowerCase()}:${port}`;
    } catch {
        return url.trim().toLowerCase();
    }
}

export function assertWorldMultiProcessRedis(input: WorldMultiProcessInput): WorldMultiProcessVerdict {
    if (input.multiProcess !== 0 && input.multiProcess !== 1) {
        throw new Error(`WORLD_MULTI_PROCESS(${String(input.multiProcess)}) 只能是 0 或 1`);
    }
    if (input.multiProcess === 0) return { enabled: false, colyseusUrl: "" };
    const colyseusUrl = input.colyseusUrl.trim();
    if (colyseusUrl === "" || !/^rediss?:\/\//u.test(colyseusUrl)) {
        throw new Error("WORLD_MULTI_PROCESS=1 需要 REDIS_COLYSEUS_URL（redis:// 独立实例，承载 RedisDriver / RedisPresence）");
    }
    const instance = redisInstanceOf(colyseusUrl);
    for (const [label, other] of [["REDIS_URL（durable）", input.durableUrl], ["REDIS_COORD_URL（coord）", input.coordUrl]] as const) {
        if (other.trim() !== "" && redisInstanceOf(other) === instance) {
            throw new Error(`REDIS_COLYSEUS_URL 与 ${label} 指向同一 Redis 实例 ${instance}：driver / presence 的固定键与 Pub/Sub 频道不可加前缀，必须独立实例（⛔ 独立 db 不够）`);
        }
    }
    return { enabled: true, colyseusUrl };
}
