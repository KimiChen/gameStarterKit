/**
 * 兑换码插件（plugins/redeem）客户端逻辑：输入规范化与提交闸、成功/失败提示、在途闸、
 * 宿主未就绪（runtime null）时 ⛔ 不做假实现。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { describeRedeemError, normalizeRedeemInput, RedeemLogic } from "../src/features/redeem/logic/RedeemLogic";
import type { RedeemRuntime } from "../src/features/redeem/logic/redeemRuntime";

class FakeRpcError extends Error {
    constructor(readonly code: string) { super(code); }
}

function runtimeWith(claim: RedeemRuntime["claim"]): RedeemRuntime & { closed: number } {
    const runtime = { closed: 0, claim, close() { runtime.closed += 1; } };
    return runtime;
}

test("redeem：输入 trim+大写；格式不合规不可提交；改输入清掉旧提示", async () => {
    const runtime = runtimeWith(async (code) => ({ code, reward: { kind: "coins", amount: 100 }, balance: 100 }));
    const logic = new RedeemLogic(runtime);
    let changed = 0;
    logic.onChanged = () => { changed += 1; };
    assert.equal(normalizeRedeemInput("  welcome2026 "), "WELCOME2026");
    logic.setInput("abc");
    assert.equal(logic.canSubmit(), false, "3 位不合规");
    logic.setInput(" welcome2026 ");
    assert.equal(logic.inputCode(), "WELCOME2026");
    assert.equal(logic.canSubmit(), true);
    assert.equal(await logic.submit(), true);
    assert.equal(logic.currentNotice().kind, "success");
    assert.match(logic.currentNotice().text, /\+100 金币，余额 100/u);
    assert.equal(logic.inputCode(), "", "成功后清空输入");
    logic.setInput("SNAKE90");
    assert.equal(logic.currentNotice().kind, "idle", "改输入清掉旧提示");
    assert.ok(changed >= 4);
    logic.close();
    assert.equal(runtime.closed, 1);
});

test("redeem：域错误码翻译；在途期间拒绝二次提交；失败后可重试", async () => {
    let resolve: ((value: { code: string; reward: { kind: "coins"; amount: number }; balance: number }) => void) | null = null;
    let calls = 0;
    const runtime = runtimeWith(() => new Promise((r) => { calls += 1; resolve = r; }));
    const logic = new RedeemLogic(runtime);
    logic.setInput("WELCOME2026");
    const first = logic.submit();
    assert.equal(logic.isBusy(), true);
    assert.equal(logic.canSubmit(), false);
    assert.equal(await logic.submit(), false, "在途期间 no-op");
    assert.equal(calls, 1);
    resolve!({ code: "WELCOME2026", reward: { kind: "coins", amount: 100 }, balance: 100 });
    assert.equal(await first, true);

    const failing = new RedeemLogic(runtimeWith(async () => { throw new FakeRpcError("REDEEM_CODE_USED"); }));
    failing.setInput("WELCOME2026");
    assert.equal(await failing.submit(), false);
    assert.equal(failing.currentNotice().kind, "error");
    assert.equal(failing.currentNotice().text, "这个兑换码你已经使用过了");
    assert.equal(failing.inputCode(), "WELCOME2026", "失败保留输入以便重试");
    assert.equal(failing.canSubmit(), true);

    assert.equal(describeRedeemError(new FakeRpcError("REDEEM_CODE_INVALID")), "兑换码不存在，请检查后重试");
    assert.match(describeRedeemError(new FakeRpcError("TIMEOUT")), /不会重复兑换/u);
    assert.equal(describeRedeemError(new FakeRpcError("SOMETHING")), "兑换失败（SOMETHING）");
    assert.equal(describeRedeemError(new Error("x")), "兑换失败，请稍后重试");
});

test("redeem：宿主未就绪（runtime null）→ 不可提交、提示未就绪、close 无副作用", async () => {
    const logic = new RedeemLogic(null);
    assert.equal(logic.isReady(), false);
    logic.setInput("WELCOME2026");
    assert.equal(logic.canSubmit(), false);
    assert.equal(await logic.submit(), false);
    assert.equal(logic.currentNotice().text, "兑换功能未就绪（feature 未装载）");
    logic.close();
});
