import assert from "node:assert/strict";
import { test } from "node:test";
import { recoverGameplayStartFailure } from "../src/logic/gameplay";

test("gameplay start recovery：正常停止后再回登录", async () => {
    const startError = new Error("join failed");
    const calls: string[] = [];

    await recoverGameplayStartFailure(startError, {
        stop: async (reason) => {
            calls.push("stop");
            assert.deepEqual(reason, { kind: "plugin-error", error: startError });
        },
        isCurrent: () => true,
        reportStopError: () => { calls.push("report"); },
        returnToLogin: async () => { calls.push("return-to-login"); },
    });

    assert.deepEqual(calls, ["stop", "return-to-login"]);
});

test("gameplay start recovery：同步 stop 异常被报告且不阻断回登录", async () => {
    const stopError = new Error("sync stop failed");
    const calls: string[] = [];
    let reported: unknown;

    await recoverGameplayStartFailure(new Error("join failed"), {
        stop: () => {
            calls.push("stop");
            throw stopError;
        },
        isCurrent: () => true,
        reportStopError: (error) => {
            calls.push("report");
            reported = error;
        },
        returnToLogin: () => { calls.push("return-to-login"); },
    });

    assert.strictEqual(reported, stopError);
    assert.deepEqual(calls, ["stop", "report", "return-to-login"]);
});

test("gameplay start recovery：异步 stop 拒绝被报告且不阻断回登录", async () => {
    const stopError = new Error("async stop failed");
    const calls: string[] = [];
    let reported: unknown;

    await recoverGameplayStartFailure(new Error("join failed"), {
        stop: async () => {
            calls.push("stop");
            throw stopError;
        },
        isCurrent: () => true,
        reportStopError: (error) => {
            calls.push("report");
            reported = error;
        },
        returnToLogin: async () => { calls.push("return-to-login"); },
    });

    assert.strictEqual(reported, stopError);
    assert.deepEqual(calls, ["stop", "report", "return-to-login"]);
});

test("gameplay start recovery：回登录失败保持原异常向上传播", async () => {
    const navigationError = new Error("return to login failed");
    const calls: string[] = [];
    let caught: unknown;

    try {
        await recoverGameplayStartFailure(new Error("join failed"), {
            stop: () => { calls.push("stop"); },
            isCurrent: () => true,
            returnToLogin: async () => {
                calls.push("return-to-login");
                throw navigationError;
            },
        });
    } catch (error) {
        caught = error;
    }

    assert.strictEqual(caught, navigationError);
    assert.deepEqual(calls, ["stop", "return-to-login"]);
});

test("gameplay start recovery：停止期间 ownership 失效时不触碰新会话", async () => {
    const calls: string[] = [];
    let current = true;

    await recoverGameplayStartFailure(new Error("stale join failed"), {
        stop: async () => {
            calls.push("stop");
            current = false;
        },
        isCurrent: () => current,
        returnToLogin: () => { calls.push("return-to-login"); },
    });

    assert.deepEqual(calls, ["stop"]);
});
