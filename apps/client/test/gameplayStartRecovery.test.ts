import assert from "node:assert/strict";
import { test } from "node:test";
import {
    recoverGameplayStartFailure,
    reconcileGameplayStartResult,
    type GameplayStartResult,
} from "../src/logic/gameplay";

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
}

async function assertLateResultStopsOnlyOldController(
    invalidate: (signalController: AbortController, bumpGeneration: () => void) => void,
): Promise<void> {
    const oldResult = deferred<GameplayStartResult>();
    const oldStops: unknown[] = [];
    const freshStops: unknown[] = [];
    const oldController = {
        stop: async (reason: unknown) => { oldStops.push(reason); },
    };
    const freshController = {
        stop: async (reason: unknown) => { freshStops.push(reason); },
    };
    let currentController: typeof oldController | typeof freshController = oldController;
    const oldSignalController = new AbortController();
    let sessionGeneration = 41;
    const capturedGeneration = sessionGeneration;
    const isCurrent = () => !oldSignalController.signal.aborted
        && sessionGeneration === capturedGeneration;

    const continuation = reconcileGameplayStartResult(
        oldResult.promise,
        oldController,
        isCurrent,
    );

    // A new Main/session is installed while the old join is still pending.
    invalidate(oldSignalController, () => { sessionGeneration++; });
    currentController = freshController;
    oldResult.resolve({ status: "started", generation: 1, pluginId: "ballMove" });

    assert.equal(await continuation, undefined);
    assert.deepEqual(oldStops, [{ kind: "cancelled" }]);
    assert.deepEqual(freshStops, [], "迟到旧结果不得停止新 controller");
    assert.strictEqual(currentController, freshController, "新 session 必须保留自己的 controller");
}

test("gameplay start continuation：迟到 AbortSignal 结果只停止旧 controller", async () => {
    await assertLateResultStopsOnlyOldController((signalController) => signalController.abort());
});

test("gameplay start continuation：迟到 session generation 结果只停止旧 controller", async () => {
    await assertLateResultStopsOnlyOldController((_signalController, bumpGeneration) => bumpGeneration());
});

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
