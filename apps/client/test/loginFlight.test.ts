/**
 * pages.ts is intentionally not imported here: its composition root binds Cocos/FairyGUI modules
 * that are unavailable in the headless runner. Keep a small source-level regression for the
 * identity rule that prevents a session transition from awaiting its own openLogin promise.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("pages login transition：按 flight identity 延后重开，不能 await 自身 Promise", () => {
  const source = readFileSync(new URL("../src/view/pages.ts", import.meta.url), "utf8");
  assert.match(source, /interface LoginFlight\s*\{/,
    "登录事务必须有显式 flight 记录，而不是只保存一个裸 Promise");
  assert.match(source, /current && current === observedFlight && !current\.settled/,
    "处理器必须识别当前正在执行的 observed flight");
  assert.match(source, /current\.promise\.then\(continueReopen, continueReopen\)/,
    "当前 flight 未完成时必须挂 settle 后的一次性重开 continuation");
  assert.match(source, /current\.onEnterBattle = onEnterBattle/,
    "合流调用必须更新到最新 Main 的 enterBattle 回调");
  assert.doesNotMatch(source, /if \(reopen && reopen !== openLoginInFlight\)/,
    "不能用可变的裸 Promise 身份比较决定是否 await");
});
