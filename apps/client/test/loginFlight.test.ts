/**
 * Keep a source-level identity regression for the exact continuation shape that prevents a
 * session transition from awaiting its own openLogin promise. The production flow runtime is
 * exercised with engine stubs in viewLifecycle.test.ts; this probe complements that behavior test.
 *
 * 阶段 5b：页面组合根状态机迁至 app/loginFlow.ts（view/pages.ts 为零状态转发 façade），
 * transition 固定次序与文案映射归 app/SessionCoordinator.ts，Main 的装配 pin 移交
 * app/AppRuntime.ts——每条 pin 的判别力在新宿主上等价重建（⛔ 未先删后补）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const FLOW_SOURCE = new URL("../src/app/loginFlow.ts", import.meta.url);
const COORDINATOR_SOURCE = new URL("../src/app/SessionCoordinator.ts", import.meta.url);
const RUNTIME_SOURCE = new URL("../src/app/AppRuntime.ts", import.meta.url);
const PAGES_SOURCE = new URL("../src/view/pages.ts", import.meta.url);

test("loginFlow transition：按 flight identity 延后重开，不能 await 自身 Promise", () => {
  const source = readFileSync(FLOW_SOURCE, "utf8");
  assert.match(source, /interface LoginFlight\s*\{/,
    "登录事务必须有显式 flight 记录，而不是只保存一个裸 Promise");
  assert.match(source, /current && current === observedFlight && !current\.settled/,
    "处理器必须识别当前正在执行的 observed flight");
  assert.match(source, /current\.promise\.then\(continueReopen, continueReopen\)/,
    "当前 flight 未完成时必须挂 settle 后的一次性重开 continuation");
  assert.match(source, /current\.onEnterBattle = onEnterBattle/,
    "合流调用必须更新到最新宿主的 enterBattle 回调");
  assert.match(source, /runAuthenticatedLoginFlow\(response/,
    "页面登录必须经统一的 setSession→join→GetInfo 回滚编排");
  assert.match(source, /shouldRollback: \(\) =>/,
    "旧页面世代失败时必须按 owner/session 世代跳过全局清理");
  assert.match(source, /!current\.invalidated && current\.owner === owner/,
    "已失效的旧 flight 不得被同一页面世代重新复用");
  assert.doesNotMatch(source, /if \(reopen && reopen !== openLoginInFlight\)/,
    "不能用可变的裸 Promise 身份比较决定是否 await");
  assert.match(source, /let unregisterSessionEvents: \(\(\) => void\) \| null = null/,
    "页面组合根必须持有会话监听的解绑句柄");
  assert.match(source, /export function disposePageSessionEvents\(owner\?: PageSessionOwner\): void/,
    "页面销毁必须有显式的会话监听 disposer");
  assert.match(source, /currentAppGeneration\(\) === wiredAppGeneration/,
    "会话接线必须捕获接线时的 app generation 做活性判定");
  assert.match(source, /currentAppGeneration\(\) !== transitionAppGeneration/,
    "旧 app generation 的异步 transition 不得触碰新场景");
});

test("SessionCoordinator：回登录 transition 固定次序与文案映射的唯一所有权", () => {
  const source = readFileSync(COORDINATOR_SOURCE, "utf8");
  assert.match(source, /export function attachSessionNavigator\(navigator: SessionNavigator\): \(\) => void/,
    "SessionCoordinator 必须是 returnToLogin/reconciler 的唯一注册入口");
  assert.match(source, /registerReturnToLogin\(async \(reason: ReturnToLoginReason\) =>/,
    "transition 处理器必须由 attachSessionNavigator 内部注册");
  assert.match(source, /await navigator\.leave\(\);/,
    "固定次序：先释放大厅连接");
  assert.match(source, /navigator\.closeLobby\(\);/,
    "固定次序：leave 复验后关闭 authenticated 页面组");
  assert.match(source, /await navigator\.prompt\(title, content\);/,
    "固定次序：必须打开并 await session 作用域的用户可见提示");
  assert.match(source, /await navigator\.reopenLogin\(transitionId, transitionGen, observedFlight\);/,
    "固定次序：提示复验后才调度重开 Login");
  assert.match(source, /returnToLoginPromptOf/,
    "回登录原因 → 文案的映射必须由 SessionCoordinator 拥有");
  assert.match(source, /ForceLogoutMessage\[ForceLogoutReason\.Replaced\]/,
    "AUTH_INVALID 子因文案分支必须保留（顶号）");
  const flow = readFileSync(FLOW_SOURCE, "utf8");
  assert.doesNotMatch(flow, /registerReturnToLogin\(|registerSessionReconciler\(/,
    "loginFlow ⛔ 不得直接注册单槽处理器（§7.2 (a)：注册方唯一）");
});

test("pages.ts 保持零状态纯转发 façade（模块级状态与注册全部迁出）", () => {
  const source = readFileSync(PAGES_SOURCE, "utf8");
  assert.doesNotMatch(source, /^\s*(let|var)\s/m,
    "façade ⛔ 不得持有任何模块级可变状态");
  assert.doesNotMatch(source, /registerReturnToLogin|registerSessionReconciler|ViewMgr/,
    "façade ⛔ 不得注册会话处理器或触达 ViewMgr");
  assert.match(source, /from "\.\.\/app\/loginFlow"/,
    "façade 必须纯转发 app/loginFlow 的等价物");
});

test("AppRuntime：宿主装配保留 flight/scope/session 世代的迁移前判别力", () => {
  const source = readFileSync(RUNTIME_SOURCE, "utf8");
  assert.match(source, /this\.disposePages\?\.\(\)/,
    "AppRuntime.dispose 必须释放 pages 组合根");
  assert.match(source, /createPageSessionScope\(\)/,
    "AppRuntime 必须为每个宿主生命周期取得 owner scope");
  assert.match(source, /openLogin\(\(\) => this\.enterBattle\(\), this\.pageScope\)/,
    "AppRuntime 必须把 owner scope 传给 openLogin");
  assert.match(source, /const sessionGeneration = getSessionGeneration\(\)/,
    "gameplay transition 必须捕获所属会话世代");
  assert.match(source, /const isCurrent = \(\): boolean => !this\.disposed[\s\S]*getSessionGeneration\(\) === sessionGeneration/,
    "迟到 stop 后回登录前必须复核宿主、取消信号与会话世代");
});
