/**
 * AppRuntime 宿主行为断言（Non-intrusive §7.2/§7.3 阶段 5b）。
 *
 * 取代原 Main.ts 的源文本 pin：dispose **顺序**（原来只 pin 存在性）、tick 转发、
 * app generation 门（构造递增 / dispose 冻结）全部升级为行为断言；
 * 会话/宿主生命周期接线（stopGameplay 三条、journal 生命周期、ticker 暂停）
 * 经真实 LifecycleBus/SessionCoordinator 驱动。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAppHost } from "./appHostHarness";

test("AppRuntime.dispose：顺序行为断言 disposePages→battleAbort→unsubs→unregisterGameplay→controller.dispose，且幂等", async () => {
  const { appRuntime, makeNode } = await loadAppHost();
  const runtime = new appRuntime.AppRuntime({ node: makeNode() }) as unknown as Record<string, any>;
  const realDisposePages = runtime.disposePages as () => void;
  const order: string[] = [];
  runtime.disposePages = () => order.push("disposePages");
  runtime.battleAbort = { abort: () => order.push("battleAbort") };
  runtime.unsubs.splice(0);
  runtime.unsubs.push(() => order.push("unsubs"));
  runtime.unregisterGameplay = () => order.push("unregisterGameplay");
  runtime.roomController = {
    dispose: () => {
      order.push("controllerDispose");
      return Promise.resolve();
    },
  };
  runtime.scheduler.add(() => {});
  assert.equal(runtime.scheduler.size, 1);

  runtime.dispose();
  assert.deepEqual(order, [
    "disposePages",
    "battleAbort",
    "unsubs",
    "unregisterGameplay",
    "controllerDispose",
  ], "dispose 必须逐字保序原 Main.onDestroy 的销毁次序");
  assert.equal(runtime.scheduler.size, 0, "dispose 后 ticker 订阅归零");

  runtime.dispose();
  assert.equal(order.length, 5, "重复 dispose 必须幂等");
  realDisposePages();
});

test("AppRuntime：app generation 构造递增、dispose 冻结（取代 pageLifecycleGeneration）", async () => {
  const { appRuntime, appGeneration, makeNode } = await loadAppHost();
  const before = appGeneration.currentAppGeneration();
  const first = new appRuntime.AppRuntime({ node: makeNode() });
  assert.ok(first.generation > before, "构造必须递增 app generation");
  const firstScope = (first as unknown as Record<string, any>).pageScope as {
    isActive(): boolean;
  };
  assert.equal(firstScope.isActive(), true, "构造后 scope 属于当前世代");

  first.dispose();
  assert.ok(appGeneration.currentAppGeneration() > first.generation,
    "dispose 后世代前进：旧 runtime 捕获的世代永不再现（冻结）");
  assert.equal(firstScope.isActive(), false, "dispose 后旧 scope 失活");
  assert.equal(first.isDisposed, true);

  const second = new appRuntime.AppRuntime({ node: makeNode() });
  assert.ok(second.generation > first.generation, "新宿主必须拿到更新的世代");
  assert.equal(firstScope.isActive(), false, "新宿主不复活旧 scope");
  second.dispose();
});

test("AppRuntime.tick：转发 RoomController.tick 与 FrameScheduler；dispose 后不再驱动", async () => {
  const { appRuntime, makeNode } = await loadAppHost();
  const runtime = new appRuntime.AppRuntime({ node: makeNode() }) as unknown as Record<string, any>;
  const controllerTicks: number[] = [];
  const schedulerTicks: number[] = [];
  runtime.roomController = {
    tick: (dt: number) => {
      controllerTicks.push(dt);
      return Promise.resolve();
    },
  };
  runtime.scheduler.add((dt: number) => schedulerTicks.push(dt));

  runtime.tick(0.16);
  assert.deepEqual(controllerTicks, [0.16], "tick 必须转发 controller.tick");
  assert.deepEqual(schedulerTicks, [0.16], "tick 必须驱动 route-scoped ticker");

  runtime.roomController = null;
  runtime.tick(0.2);
  assert.deepEqual(schedulerTicks, [0.16, 0.2], "无 controller 时 ticker 仍被驱动");

  runtime.dispose();
  runtime.tick(0.3);
  assert.deepEqual(schedulerTicks, [0.16, 0.2], "dispose 后 ticker 已清空");
});

test("wireSessionLifecycle：transport 失效先拆玩法 generation；journal/ticker 生命周期接线", async () => {
  const { appRuntime, session, wiring, makeNode } = await loadAppHost();
  const runtime = new appRuntime.AppRuntime({ node: makeNode() }) as unknown as Record<string, any>;
  const stopReasons: unknown[] = [];
  runtime.roomController = {
    stop: (reason: unknown) => {
      stopReasons.push(reason);
      return Promise.resolve();
    },
  };
  try {
    runtime.wireSessionLifecycle();

    // 宿主 hide 只暂停本地 ticker；show 恢复（§7.3）。
    wiring.lifecycleBus.publish("host", { kind: "hide", seq: 9001 });
    assert.equal(runtime.scheduler.isPaused, true, "hide 必须暂停本地 ticker");
    wiring.lifecycleBus.publish("host", { kind: "show", seq: 9002 });
    assert.equal(runtime.scheduler.isPaused, false, "show 必须恢复本地 ticker");

    // dropped：journal 只做 inflight → unknown（⛔ 不产生新条目、不清空）。
    runtime.pendingOperationJournal.begin({
      uid: "uid-lifecycle",
      clientReqId: "req-1",
      route: "user.updateProfile",
      payload: { nickname: "n" },
    });
    wiring.lifecycleBus.publish("connection", { kind: "dropped", connGeneration: 41, seq: 9003 });
    assert.equal(runtime.pendingOperationJournal.entryOf("req-1")?.state, "unknown",
      "onDrop 在途写必须结算为 ResultUnknown");
    assert.equal(runtime.pendingOperationJournal.size, 1, "final-loss 前 journal 必须保留");

    // auth-invalid：同一同步栈里 stopGameplay(cancelled) + journal 清空（session ended）。
    session.setSession({ userId: "uid-lifecycle", accessToken: "token-lifecycle", isNewAccount: false });
    session.notifyAuthInvalid("AUTH_REQUIRED");
    assert.deepEqual(stopReasons, [{ kind: "cancelled" }],
      "auth-invalid 必须先拆玩法 generation（stopGameplay cancelled）");
    assert.equal(runtime.pendingOperationJournal.size, 0, "auth-invalid = session ended，journal 同步清空");

    // battle/conn lost → room-lost。
    session.setSession({ userId: "uid-lifecycle", accessToken: "token-lifecycle-2", isNewAccount: false });
    session.notifyBattleLost();
    assert.deepEqual(stopReasons.at(-1), { kind: "room-lost" });

    // dispose 后：连接/宿主/会话订阅计数归零（行为验证 + bus 计数）。
    const hostListeners = wiring.lifecycleBus.listenerCount("host");
    const connListeners = wiring.lifecycleBus.listenerCount("connection");
    runtime.roomController = null;
    runtime.dispose();
    assert.ok(wiring.lifecycleBus.listenerCount("host") < hostListeners,
      "dispose 必须解绑 host 通道订阅");
    assert.ok(wiring.lifecycleBus.listenerCount("connection") < connListeners,
      "dispose 必须解绑 connection 通道订阅");
    const stopsBefore = stopReasons.length;
    session.notifyBattleLost();
    assert.equal(stopReasons.length, stopsBefore, "dispose 后 session 订阅不得再驱动 stopGameplay");
    wiring.lifecycleBus.publish("host", { kind: "hide", seq: 9004 });
    assert.equal(runtime.scheduler.isPaused, false, "dispose 后宿主事件不得再影响 ticker");
  } finally {
    session.clearSession();
  }
});
