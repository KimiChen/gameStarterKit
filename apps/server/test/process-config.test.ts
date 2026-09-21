import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { splitProcessPlan } from "../tools/dev-split";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
function config(env: Record<string, string>) {
    return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
        "const c=await import('./src/core/infra/config.ts');console.log(JSON.stringify([c.LOBBY_PORT,c.GAME_PORT,c.WORLD_PORT]))"], {
        cwd: serverRoot, env: { ...process.env, PORT: "28100", LOBBY_PORT: "", GAME_PORT: "", WORLD_PORT: "", ...env },
        encoding: "utf8", timeout: 15_000,
    });
}

test("独立入口缺省遵循 PORT，显式角色端口独立生效，坏配置加载即拒", () => {
    const defaults = config({});
    assert.equal(defaults.status, 0, defaults.stderr);
    assert.deepEqual(JSON.parse(defaults.stdout), [28100, 28100, 28100]);
    const custom = config({ LOBBY_PORT: "28201", GAME_PORT: "28202", WORLD_PORT: "28203" });
    assert.equal(custom.status, 0, custom.stderr);
    assert.deepEqual(JSON.parse(custom.stdout), [28201, 28202, 28203]);
    for (const [key, value] of [["LOBBY_PORT", "28100junk"], ["GAME_PORT", "0"], ["WORLD_PORT", "65536"]]) {
        const result = config({ [key]: value });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, new RegExp(key));
    }
});

test("WS 发现配置拒路径、凭据和越界端口，接受空值与合法 origin", () => {
    for (const key of ["LOBBY_PUBLIC_WS_URL", "GAME_PUBLIC_WS_URL", "WORLD_PUBLIC_WS_URL"]) {
        for (const value of ["ws://host.test/lobby", "ws://user:pass@host.test", "ws://host.test:0", "ws://host.test:65536"]) {
            const result = config({ [key]: value });
            assert.notEqual(result.status, 0);
            assert.match(result.stderr, new RegExp(key));
        }
        const result = config({ [key]: "wss://host.test:443" });
        assert.equal(result.status, 0, result.stderr);
    }
});

test("dev:split 为各子进程发布同一端点表，分配不同端口及 NODE_ID", () => {
    const plan = splitProcessPlan({}, 28200);
    assert.deepEqual(plan.map((entry) => entry.port), [28200, 28201, 28202]);
    assert.equal(new Set(plan.map((entry) => entry.env.NODE_ID)).size, 3);
    for (const { env } of plan) {
        assert.equal(env.LOBBY_PUBLIC_WS_URL, "ws://127.0.0.1:28200");
        assert.equal(env.GAME_PUBLIC_WS_URL, "ws://127.0.0.1:28201");
        assert.equal(env.WORLD_PUBLIC_WS_URL, "ws://127.0.0.1:28202");
    }
    const explicit = splitProcessPlan({ LOBBY_PORT: "28300", WORLD_PUBLIC_WS_URL: "wss://world.test", NODE_ID: "machine" }, 28200);
    assert.equal(explicit[0].port, 28300);
    assert.equal(explicit[2].env.WORLD_PUBLIC_WS_URL, "wss://world.test");
    assert.equal(explicit[1].env.NODE_ID, "machine.game:28201");
    assert.throws(() => splitProcessPlan({ WORLD_PORT: "28200" }, 28200), /互异/);
    assert.throws(() => splitProcessPlan({}, 65535), /GAME_PORT/);
    assert.throws(() => splitProcessPlan({ GAME_PORT: "2junk" }, 28200), /GAME_PORT/);
});
