/**
 * MMO MF10-B2 多 world 进程启用路径：`WORLD_MULTI_PROCESS=1` ⇒ 需要 REDIS_COLYSEUS_URL 且必须是与 durable / coord 不同的 Redis **实例**
 * （host:port；独立 db 不算），加载期断言（config.ts）；未启用 ⇒ 不碰 Redis driver / presence。`worldServerOptions()` 按裁决装配
 * driver / presence / publicAddress / selectProcessIdToCreateRoom（放置钩子可注入，缺省交 Colyseus 最少房间策略）。
 * 变异验证：assertWorldMultiProcessRedis 删「同实例即拒」比较 →「同实例拒」转红；worldServerOptions 未启用也装 driver →「未启用不装」转红。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertWorldMultiProcessRedis, redisInstanceOf } from "../src/core/infra/worldMultiProcess";
import { worldServerOptions } from "../src/world.config";

test("断言：未启用直接绿；启用缺 URL / 同 durable 实例 / 同 coord 实例（含只换 db）⇒ 红；独立实例 ⇒ 绿", () => {
    assert.deepEqual(assertWorldMultiProcessRedis({ multiProcess: 0, colyseusUrl: "", durableUrl: "redis://127.0.0.1:6401/0", coordUrl: "redis://127.0.0.1:6402/0" }), { enabled: false, colyseusUrl: "" });
    assert.throws(() => assertWorldMultiProcessRedis({ multiProcess: 1, colyseusUrl: "", durableUrl: "redis://127.0.0.1:6401/0", coordUrl: "redis://127.0.0.1:6402/0" }), /需要 REDIS_COLYSEUS_URL/u);
    assert.throws(() => assertWorldMultiProcessRedis({ multiProcess: 1, colyseusUrl: "redis://127.0.0.1:6401/9", durableUrl: "redis://127.0.0.1:6401/0", coordUrl: "redis://127.0.0.1:6402/0" }), /同一 Redis 实例 127\.0\.0\.1:6401/u, "只换 db 不算独立");
    assert.throws(() => assertWorldMultiProcessRedis({ multiProcess: 1, colyseusUrl: "redis://127.0.0.1:6402", durableUrl: "redis://127.0.0.1:6401/0", coordUrl: "redis://127.0.0.1:6402/0" }), /coord/u, "与 coord 同实例");
    assert.throws(() => assertWorldMultiProcessRedis({ multiProcess: 1, colyseusUrl: "http://127.0.0.1:6403", durableUrl: "redis://127.0.0.1:6401/0", coordUrl: "redis://127.0.0.1:6402/0" }), /redis:\/\//u, "非 redis scheme");
    assert.throws(() => assertWorldMultiProcessRedis({ multiProcess: 2, colyseusUrl: "redis://127.0.0.1:6403", durableUrl: "", coordUrl: "" }), /只能是 0 或 1/u);
    assert.deepEqual(assertWorldMultiProcessRedis({ multiProcess: 1, colyseusUrl: "redis://127.0.0.1:6403/0", durableUrl: "redis://127.0.0.1:6401/0", coordUrl: "redis://127.0.0.1:6402/0" }), { enabled: true, colyseusUrl: "redis://127.0.0.1:6403/0" });
    assert.equal(redisInstanceOf("redis://Cache.Example.com/3"), "cache.example.com:6379", "缺端口补 6379、主机小写");
});

test("worldServerOptions：未启用 ⇒ 空（Colyseus 单进程缺省）；启用 ⇒ driver / presence 构造于 REDIS_COLYSEUS_URL、publicAddress、放置钩子可注入", async () => {
    const built: string[] = [];
    const factories = { driver: (url: string) => { built.push(`driver:${url}`); return { kind: "driver" }; }, presence: (url: string) => { built.push(`presence:${url}`); return { kind: "presence" }; } };
    assert.deepEqual(worldServerOptions({ verdict: { enabled: false, colyseusUrl: "" }, publicAddress: "", factories: factories as never }), {}, "未启用不装 driver / presence / publicAddress");
    assert.deepEqual(built, []);
    const enabled = worldServerOptions({ verdict: { enabled: true, colyseusUrl: "redis://127.0.0.1:6403/0" }, publicAddress: "world-a.example.com:2570", factories: factories as never });
    assert.deepEqual(Object.keys(enabled).sort(), ["driver", "presence", "publicAddress"]);
    assert.deepEqual(built, ["driver:redis://127.0.0.1:6403/0", "presence:redis://127.0.0.1:6403/0"]);
    assert.equal(enabled.publicAddress, "world-a.example.com:2570");
    assert.equal(enabled.selectProcessIdToCreateRoom, undefined, "缺省交 Colyseus 最少房间策略");
    const placed = worldServerOptions({
        verdict: { enabled: true, colyseusUrl: "redis://127.0.0.1:6403/0" }, publicAddress: "", factories: factories as never,
        placement: { select: async (roomName, options) => `${roomName}:${String((options as { mapId?: string }).mapId)}` },
    });
    assert.equal(await placed.selectProcessIdToCreateRoom!("world", { mapId: "m1" }), "world:m1", "放置钩子透传 roomName / options");
});

test("config.ts 加载期断言：WORLD_MULTI_PROCESS=1 且 REDIS_COLYSEUS_URL 与 durable 同实例 ⇒ 拒启（子进程非 0 退出）；独立实例 ⇒ 正常加载", () => {
    const serverRoot = fileURLToPath(new URL("..", import.meta.url));
    const probe = (env: Record<string, string>) => spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import(\"./src/core/infra/config.ts\"); console.log(\"config-ok\");"], {
        cwd: serverRoot, encoding: "utf8", timeout: 60_000,
        env: { ...process.env, NODE_ENV: "test", REDIS_URL: "redis://127.0.0.1:6401/0", REDIS_COORD_URL: "redis://127.0.0.1:6402/0", ...env },
    });
    const red = probe({ WORLD_MULTI_PROCESS: "1", REDIS_COLYSEUS_URL: "redis://127.0.0.1:6401/9" });
    assert.notEqual(red.status, 0, "同实例（只换 db）⇒ 拒启");
    assert.match(`${red.stdout}${red.stderr}`, /同一 Redis 实例/u);
    const green = probe({ WORLD_MULTI_PROCESS: "1", REDIS_COLYSEUS_URL: "redis://127.0.0.1:6403/0" });
    assert.equal(green.status, 0, `独立实例 ⇒ 正常加载：${green.stderr.slice(0, 400)}`);
    assert.match(green.stdout, /config-ok/u);
    const off = probe({ WORLD_MULTI_PROCESS: "0", REDIS_COLYSEUS_URL: "redis://127.0.0.1:6401/9" });
    assert.equal(off.status, 0, "未启用不断言");
});
