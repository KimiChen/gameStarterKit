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

test("§7.8 宿主前后台：hide 停喂 tick + 拒新输入；show 按 ready/drop 宽限/final-loss 三态恢复", async () => {
  const { appRuntime, wiring, makeNode } = await loadAppHost();
  // battle 快照 seam：可变对象驱动三态（生产缺省读 roomClient 派生快照）。
  const battle = { state: "ready" as "idle" | "joining" | "ready" | "dropped", connGeneration: 1 };
  const runtime = new appRuntime.AppRuntime({
    node: makeNode(),
    battleConnection: () => ({ ...battle }),
  }) as unknown as Record<string, any>;
  const controllerTicks: number[] = [];
  const inputs: unknown[] = [];
  runtime.roomController = {
    status: "running",
    currentGeneration: 1,
    tick: (dt: number) => { controllerTicks.push(dt); return Promise.resolve(true); },
    input: (value: unknown) => { inputs.push(value); return Promise.resolve(true); },
    stop: () => Promise.resolve(),
  };
  try {
    runtime.wireSessionLifecycle();
    runtime.tick(0.1);
    assert.equal(controllerTicks.length, 1);
    assert.equal(await runtime.dispatchGameplayInput({ type: "target", x: 1, y: 2 }), true);
    assert.equal(inputs.length, 1);

    // (1)(2) hide：停喂玩法 tick、拒新输入意图（被拒输入不触达 controller ⇒ seq 不跳变）。
    wiring.lifecycleBus.publish("host", { kind: "hide", seq: 8101 });
    runtime.tick(0.1);
    assert.equal(controllerTicks.length, 1, "hide 期间必须停喂玩法 tick");
    assert.equal(runtime.scheduler.isPaused, true, "hide 仍暂停 route-scoped ticker");
    assert.equal(await runtime.dispatchGameplayInput({ type: "release" }), false,
      "hide 期间禁止产生新的输入意图");
    assert.equal(inputs.length, 1, "被拒输入不得到达 controller");

    // (3) show@ready：立即恢复 tick 与输入（权威快照：Lobby 经 RefreshCoordinator，
    // GameRoom state 由存活 socket 持续同步）。
    wiring.lifecycleBus.publish("host", { kind: "show", seq: 8102 });
    runtime.tick(0.1);
    assert.equal(controllerTicks.length, 2, "show@ready 恢复玩法 tick");
    assert.equal(await runtime.dispatchGameplayInput({ type: "release" }), true);
    assert.equal(inputs.length, 2);

    // (3)(4) show@drop 宽限：本地 tick 恢复，但输入挂起等 reconnect（完整快照过闸）。
    wiring.lifecycleBus.publish("host", { kind: "hide", seq: 8103 });
    battle.state = "dropped";
    wiring.lifecycleBus.publish("host", { kind: "show", seq: 8104 });
    runtime.tick(0.1);
    assert.equal(controllerTicks.length, 3, "drop 宽限的 show 恢复本地 tick");
    assert.equal(await runtime.dispatchGameplayInput({ type: "release" }), false,
      "drop 宽限的 show 后输入必须等 reconnect");
    wiring.lifecycleBus.publish("battle", { kind: "reconnected", connGeneration: 1, seq: 8105 });
    assert.equal(await runtime.dispatchGameplayInput({ type: "release" }), true,
      "reconnected（重连完整快照已过校验）解除输入挂起");
    assert.equal(inputs.length, 3);

    // (3) show@final-loss：连接已死（快照 idle）——既有恢复路径负责拆局，不留输入挂起。
    wiring.lifecycleBus.publish("host", { kind: "hide", seq: 8106 });
    battle.state = "idle";
    wiring.lifecycleBus.publish("host", { kind: "show", seq: 8107 });
    assert.equal(runtime.battleInputHold, false, "final-loss 不得遗留输入挂起（走既有恢复路径）");
    assert.equal(runtime.hostHidden, false);
  } finally {
    runtime.roomController = null;
    runtime.dispose();
  }
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


test("launch 统一启动通道经 PluginHost 闸：failed 不启动、userIntent 重试成功后启动、常驻与未托管直通", async () => {
  // 缺口：此前 AppRuntime.launch 直接 launchGameplay，PluginHost 状态机（failed/disabled）
  // 在生产启动通道上无任何判定——菜单 enabled 只是渲染期快照，渲染后失败的 plugin
  // 照常进玩法；userIntent 重试也没有生产调用方。本用例钉住启动时刻的唯一判定。
  // 变异锚点：launch 退化为直走 launchGameplay ⇒ ① 的 started=0 断言必红。
  const { appRuntime, makeNode } = await loadAppHost();
  let failInstall = true;
  let installs = 0;
  const hostedPlugins = [
    { id: "builtin", resident: true },
    {
      id: "fx",
      load: () => ({
        install: () => {
          installs++;
          if (failInstall) throw new Error("fixture install failed");
        },
      }),
    },
  ];
  const runtime = new appRuntime.AppRuntime({
    node: makeNode(),
    hostedPlugins,
    launchPluginMap: new Map([["ballMove", "builtin"], ["fxGame", "fx"]]),
  }) as unknown as Record<string, any>;
  let started = 0;
  runtime.launchGameplay = async () => { started++; };

  // ① 托管 plugin install 失败：玩法不得启动（启动时刻再闸，不信渲染期快照）。
  await runtime.launch({ kind: "gameplay", gameplayId: "fxGame" });
  assert.equal(started, 0, "plugin failed 时不得启动玩法");
  assert.equal(runtime.plugins.statusOf("fx"), "failed");

  // ② 点击 = 显式用户意图：重试装载成功后照常启动，且装载恰好重试一次。
  failInstall = false;
  await runtime.launch({ kind: "gameplay", gameplayId: "fxGame" });
  assert.equal(runtime.plugins.statusOf("fx"), "active");
  assert.equal(started, 1, "userIntent 重试成功后必须启动玩法");
  assert.equal(installs, 2, "装载必须恰好重试一次");

  // ③ resident built-in：恒 active 短路，零开销直通（不触发任何装载）。
  await runtime.launch({ kind: "gameplay", gameplayId: "ballMove" });
  assert.equal(started, 2, "常驻 plugin 必须直通");

  // ④ 未托管 target（无 contribution 映射）：不受 plugin 闸管控，直通。
  await runtime.launch({ kind: "gameplay", gameplayId: "otherGame" });
  assert.equal(started, 3, "未托管 target 必须直通");

  runtime.dispose();
});

test("launch 闸 await 窗口的活性复验：换代/dispose 后迟到的 install 完成不得启动玩法", async () => {
  // 缺口（47dc934 引入的回归）：launch 的 PluginHost 闸是 await——install 挂起期间
  // 会话可能换代（returnToLogin 后重新登录）、app 可能 dispose。若无复验，迟到的
  // install 完成会带着旧意图进 launchGameplay（closeGroup("authenticated") 关掉换代后
  // 重开的 Login / 在新会话下启动玩法）。观察面取 started 计数：launchGameplay 被
  // override，变异（删复验/删入口 disposed）后 started 必不为 0。
  const { appRuntime, session, makeNode } = await loadAppHost();
  const makeRuntime = () => {
    let resolveGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => { resolveGate = resolve; });
    let installs = 0;
    const hostedPlugins = [
      { id: "builtin", resident: true },
      {
        id: "fx",
        load: async () => {
          await gate;
          return { install: () => { installs++; } };
        },
      },
    ];
    const runtime = new appRuntime.AppRuntime({
      node: makeNode(),
      hostedPlugins,
      launchPluginMap: new Map([["ballMove", "builtin"], ["fxGame", "fx"]]),
    }) as unknown as Record<string, any>;
    let started = 0;
    runtime.launchGameplay = async () => { started++; };
    return {
      runtime,
      resolveGate: () => resolveGate(),
      installs: () => installs,
      started: () => started,
    };
  };

  // ① 挂起 install 期间会话换代：resolve 后 install 虽完成（active），玩法不得启动。
  const first = makeRuntime();
  try {
    const pending = first.runtime.launch({ kind: "gameplay", gameplayId: "fxGame" });
    session.setSession({ userId: "uid-relaunch", accessToken: "token-relaunch", isNewAccount: false });
    first.resolveGate();
    await pending;
    assert.equal(first.installs(), 1, "install 本身照常完成（复验只拦启动，不拦装载结算）");
    assert.equal(first.runtime.plugins.statusOf("fx"), "active");
    assert.equal(first.started(), 0, "换代后迟到的 install 完成不得启动玩法");
  } finally {
    session.clearSession();
    first.runtime.dispose();
  }

  // ② dispose() 后 launch：入口即拒——不触发装载，也不启动。
  // gate 先放行：变异（删入口 disposed）时装载会跑完并以 installs=1 干净转红，不挂死。
  const second = makeRuntime();
  second.resolveGate();
  second.runtime.dispose();
  await second.runtime.launch({ kind: "gameplay", gameplayId: "fxGame" });
  assert.equal(second.installs(), 0, "dispose 后 launch 不得触发 plugin 装载");
  assert.equal(second.started(), 0, "dispose 后 launch 不得启动玩法");

  // ③ 闸 await 期间 dispose（常驻 plugin：闸恒 active，窗口只有一个微任务跳）。
  const third = makeRuntime();
  const inFlight = third.runtime.launch({ kind: "gameplay", gameplayId: "ballMove" });
  third.runtime.dispose();
  await inFlight;
  assert.equal(third.started(), 0, "闸 await 期间 dispose 后不得启动玩法");
});

test("deriveLaunchPluginIds：生产派生 ballMove→builtin；多贡献者取先到者（生成器已闸一 gameplayId 一贡献者）", async () => {
  // 缺口（变异 M4/M5 存活）：此前派生内联在构造函数里，生产路径（不注入
  // launchPluginMap seam）零覆盖——把 map 键改成 pluginId（M4）或去掉 !map.has
  // 守卫（M5）全绿存活。codegen:plugins 已拒绝同一 gameplayId 的第二贡献者，
  // 这里的「先到者不被覆盖」只是对手工 fixture 的防御语义。
  const { appRuntime, loginFlow, makeNode } = await loadAppHost();

  // ① 生产派生（杀 M4）：不注入任何 seam 构造 AppRuntime，内部映射必须含
  // ballMove → builtin；纯函数喂真实 menuContributions() 得到同一结果。
  const runtime = new appRuntime.AppRuntime({ node: makeNode() }) as unknown as Record<string, any>;
  try {
    assert.equal(runtime.launchPluginIds.get("ballMove"), "builtin",
      "生产派生必须以 gameplayId 为键映射到贡献 plugin");
    assert.equal(
      appRuntime.deriveLaunchPluginIds(loginFlow.appPluginRegistry.menuContributions()).get("ballMove"),
      "builtin");
  } finally {
    runtime.dispose();
  }

  // ② 多贡献者（杀 M5）：同 gameplayId 两条 contribution（B 在前）→ 取 B；
  // 去掉 !map.has 守卫会被后来者覆盖成 A。route 形态的 contribution ⛔ 不进表。
  const contribution = (pluginId: string, entryId: string) => ({
    entryId, pluginId, label: entryId, labelKey: `menu.${entryId}`,
    launch: { kind: "gameplay" as const, gameplayId: "sharedGame" },
  });
  const sorted = [contribution("featB", "bEntry"), contribution("featA", "aEntry")];
  assert.equal(appRuntime.deriveLaunchPluginIds(sorted).get("sharedGame"), "featB",
    "同一 gameplayId 多贡献者必须取先到的贡献者");
  const routeOnly = [{
    entryId: "panel", pluginId: "featC", label: "panel", labelKey: "menu.panel",
    launch: { kind: "route" as const, routeId: "panel" },
  }];
  assert.equal(appRuntime.deriveLaunchPluginIds(routeOnly).size, 0, "route 形态的入口不进 gameplayId 映射");
});

test("launch 点击恒为 userIntent：连续点击不计入自动重试上限，永不进 disabled", async () => {
  // 缺口（变异 M2-drop-userIntent 存活）：既有用例只覆盖「failed 后一次点击重试成功」，
  // 没钉住「点击不消耗自动重试预算」——把 launch 的 { userIntent: true } 改成 {} 时
  // 全绿存活，用户连点几次入口就把 plugin 点进 disabled(app-generation)。
  const { appRuntime, makeNode } = await loadAppHost();
  const hostedPlugins = [
    { id: "fx", load: () => ({ install: () => { throw new Error("install always fails"); } }) },
  ];
  const runtime = new appRuntime.AppRuntime({
    node: makeNode(),
    hostedPlugins,
    launchPluginMap: new Map([["fxGame", "fx"]]),
  }) as unknown as Record<string, any>;
  let started = 0;
  runtime.launchGameplay = async () => { started++; };

  // 对照 PluginHost 实现读出本 runtime 生效的自动重试上限（默认 2），点击数取上限 + 2，
  // 保证只要点击被计入自动重试就必然越过上限。
  const maxAutoRetries = (runtime.plugins as unknown as Record<string, any>).maxAutoRetries as number;
  assert.equal(typeof maxAutoRetries, "number");
  for (let i = 0; i < maxAutoRetries + 2; i++) {
    await runtime.launch({ kind: "gameplay", gameplayId: "fxGame" });
    assert.equal(runtime.plugins.statusOf("fx"), "failed",
      `第 ${i + 1} 次点击后必须仍是 failed——点击 = userIntent，不消耗自动重试预算`);
  }
  assert.equal(started, 0, "install 恒失败时玩法始终不得启动");
  // 非 userIntent 的内部路径按上限进 disabled 由既有用例钉住：
  // 本文件「launch 统一启动通道：disabled(app-generation)…」与 pluginHost.test.ts
  // 「failed 两条出路…」。
  runtime.dispose();
});

test("launch 闸对未托管 pluginId 的裁定与渲染侧一致：不误伤、直通", async () => {
  // 缺口：映射指向不在 hostedPlugins 的 plugin id 时，渲染侧 pluginAvailability
  // 防御性返回 "available"（入口可点击），而闸侧 pluginHost.launch 对未登记 id
  // fail-fast throw——同一个入口两侧裁定不一致：可点击却点不动（unhandled rejection）。
  // 修复后闸侧经 hosts() 与渲染侧同款裁定：未托管即直通，不进闸。
  const { appRuntime, makeNode } = await loadAppHost();
  const runtime = new appRuntime.AppRuntime({
    node: makeNode(),
    hostedPlugins: [{ id: "builtin", resident: true }],
    launchPluginMap: new Map([["fxGame", "ghost"]]),
  }) as unknown as Record<string, any>;
  let started = 0;
  runtime.launchGameplay = async () => { started++; };

  await runtime.launch({ kind: "gameplay", gameplayId: "fxGame" });
  assert.equal(started, 1, "未托管 pluginId 必须直通（与渲染侧防御裁定一致），且不得 rejection");
  runtime.dispose();
});

test("launch 统一启动通道：disabled(app-generation) 的 plugin 同样不得启动玩法", async () => {
  const { appRuntime, makeNode } = await loadAppHost();
  const hostedPlugins = [
    { id: "fx", load: () => ({ install: () => { throw new Error("always fails"); } }) },
  ];
  const runtime = new appRuntime.AppRuntime({
    node: makeNode(),
    hostedPlugins,
    launchPluginMap: new Map([["fxGame", "fx"]]),
  }) as unknown as Record<string, any>;
  let started = 0;
  runtime.launchGameplay = async () => { started++; };

  // 自动重试预算耗尽（默认上限 2：首次 failed 后两次自动重试仍失败）→ disabled。
  assert.equal(await runtime.plugins.launch("fx"), "failed");
  assert.equal(await runtime.plugins.launch("fx"), "failed");
  assert.equal(await runtime.plugins.launch("fx"), "failed");
  assert.equal(await runtime.plugins.launch("fx"), "disabled", "超限必须置 disabled(app-generation)");

  await runtime.launch({ kind: "gameplay", gameplayId: "fxGame" });
  assert.equal(started, 0, "disabled plugin 不得启动玩法（userIntent 也不能越过 disabled）");
  runtime.dispose();
});

test("bootstrap：portalUrl 空串回落 DEV_SERVER_URL（dev 下 portal 即游戏服自身）；显式坏值仍 fail-fast", async () => {
  const { bootstrap, makeNode } = await loadAppHost();
  // dev 动线：portalUrl 留空不再必填——回落 DEV_SERVER_URL（AUTH_PROVIDER=dev 的游戏服
  // 复刻 /v1/sessions/dev 与 /v1/areas 的锁定契约形状）。
  const runtime = bootstrap.createAppRuntime({ node: makeNode(), serverUrl: "", portalUrl: "" });
  assert.ok(runtime, "portalUrl 空串必须可启动（回落 DEV_SERVER_URL）");
  runtime.dispose();

  // 显式坏值不得被回落掩盖：initPortal 的 origin 校验保持 fail-fast。
  assert.throws(
    () => bootstrap.createAppRuntime({ node: makeNode(), serverUrl: "", portalUrl: "not-a-url" }),
    /origin|http/,
    "显式非法 portalUrl 必须 fail-fast（回落只兜底空串）",
  );
});

test("bootstrap：?server= 查询参数覆盖 serverUrl（LAN 调试），portal 空串跟随同一地址", async () => {
  const { bootstrap, makeNode } = await loadAppHost();
  const globalWithLocation = globalThis as { location?: { search?: string } };
  const savedLocation = globalWithLocation.location;
  try {
    globalWithLocation.location = { search: "?server=http://10.0.1.10:2568" };
    assert.equal(bootstrap.serverUrlFromQuery(), "http://10.0.1.10:2568", "必须读出 server 参数");
    const runtime = bootstrap.createAppRuntime({ node: makeNode(), serverUrl: "", portalUrl: "" });
    runtime.dispose();
    globalWithLocation.location = { search: "" };
    assert.equal(bootstrap.serverUrlFromQuery(), null, "无参数必须回落（返回 null）");
  } finally {
    if (savedLocation === undefined) delete globalWithLocation.location;
    else globalWithLocation.location = savedLocation;
  }
});

test("玩法侧退出（controllerBridge.requestStop）后恢复 authenticated base；未登录 / 无 base / 已 dispose 不恢复", async () => {
  // 2026-09-05 Creator 预览实测：结算/离开经 host.requestExit → controller.stop 后整屏黑——closed{voluntary}
  // 不触发导航、stop 也不导航，没人把 launchGameplay 进战斗前关掉的 authenticated 组恢复回来。
  const { appRuntime, makeNode } = await loadAppHost();
  const runtime = new appRuntime.AppRuntime({ node: makeNode() }) as unknown as Record<string, any>;
  const restores: unknown[] = [];
  let hasBase = true;
  runtime.navigation = Object.assign(Object.create(runtime.navigation), {
    hasAuthenticatedBase: () => hasBase,
    restoreAuthenticatedBase: async (context: unknown) => { restores.push(context); return null; },
  });
  let loggedIn = true;
  runtime.ports = {
    ...runtime.ports,
    session: Object.assign(Object.create(runtime.ports.session), {
      isLoggedIn: () => loggedIn,
      getUserId: () => "u-1",
      getSessionProfile: () => ({ stamina: 7 }),
    }),
  };
  const bridge = runtime.gameplayServices.controllerBridge;
  try {
    await bridge.requestStop({ kind: "manual" });
    assert.deepEqual(restores, [{ userId: "u-1", user: { stamina: 7 } }], "玩法侧退出后必须恢复 authenticated base");

    loggedIn = false;
    await bridge.requestStop({ kind: "manual" });
    assert.equal(restores.length, 1, "未登录不恢复");
    loggedIn = true;

    hasBase = false;
    await bridge.requestStop({ kind: "manual" });
    assert.equal(restores.length, 1, "从未登记 base（开发快捷入口）不恢复");
    hasBase = true;

    runtime.dispose();
    await bridge.requestStop({ kind: "manual" });
    assert.equal(restores.length, 1, "dispose 后不恢复");
  } finally {
    runtime.dispose();
  }
});
