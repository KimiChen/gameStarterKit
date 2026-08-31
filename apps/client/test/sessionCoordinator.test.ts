/**
 * SessionCoordinator + LifecycleBus + CocosLifecycleBridge（Non-intrusive §7.3 阶段 5a）：
 *  - closed{auth-invalid} 全链（transport→bus→Coordinator）在**同一同步栈**清凭证再广播；
 *  - 单槽注册 fail-fast（§7.2 (b)）；
 *  - bus→derive 全分支矩阵；
 *  - LifecycleBus 严格同步（无微任务）；
 *  - CocosLifecycleBridge stub 注入。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  ForceLogoutReason, LOBBY_MSG_PUSH, LobbyPush,
} from "../src/shared/index";
import { WebSocketClient } from "../src/net/WebSocketClient";
import { wireConnectionEvents } from "../src/app/wiring";
import {
  handleLobbyConnectionEvent,
  clearSession,
  isLoggedIn,
  onAuthInvalid,
  onBattleLost,
  onConnLost,
  registerReturnToLogin,
  registerSessionReconciler,
  setSession,
} from "../src/app/SessionCoordinator";
import { getToken, initPortal, portalRequest } from "../src/core/http";
import { LifecycleBus } from "../src/app/LifecycleBus";
import type { LobbyConnectionEvent } from "../src/net/connectionEvents";

wireConnectionEvents();

const login = (uid: string) => setSession({
  userId: uid,
  accessToken: `${uid}.${"a".repeat(48)}`,
  isNewAccount: false,
});

function makeFakeRoom() {
  const handlers = new Map<string, (msg: unknown) => void>();
  const cbs: { leave?: (code?: number) => void } = {};
  const room = {
    sessionId: "s_coord",
    reconnection: { enabled: true },
    send() { /* noop */ },
    onMessage(type: string, cb: (msg: unknown) => void) { handlers.set(type, cb); return () => { handlers.delete(type); }; },
    onDrop() { return () => {}; },
    onReconnect() { return () => {}; },
    onLeave(cb: (code?: number) => void) { cbs.leave = cb; return () => {}; },
    leave: async () => true,
    removeAllListeners() { /* noop */ },
  };
  const push = (type: string, data: unknown) => handlers.get(LOBBY_MSG_PUSH)?.({ type, data });
  return { room, push, cbs };
}

async function joinWithFakeRoom(fake: ReturnType<typeof makeFakeRoom>): Promise<void> {
  const internals = WebSocketClient.inst as unknown as { client: unknown; endpoint: string };
  internals.endpoint = "http://session-coordinator.example";
  internals.client = { auth: { token: "" }, joinOrCreate: async () => fake.room };
  await WebSocketClient.inst.join("coordinator-token");
}

test("closed{auth-invalid} 全链同一同步栈：广播时凭证已清、此后 HTTP 不带旧 Bearer", async () => {
  await WebSocketClient.inst.leave().catch(() => {});
  const fake = makeFakeRoom();
  await joinWithFakeRoom(fake);
  login("u_sync_clear");
  const staleToken = getToken();
  assert.ok(staleToken !== "");

  let tokenAtBroadcast: string | null = null;
  let loggedInAtBroadcast: boolean | null = null;
  let reasonSeen = "";
  const off = onAuthInvalid((reason) => {
    // ⚠ 变异验证：若在 SessionCoordinator.notifyAuthInvalid 的 clearSession 与
    // 广播循环之间插入任何 await（把广播挪进微任务），这里将捕获到未清除的旧
    // token（staleToken），下面的断言转红。同步栈语义就是本测试钉住的不变量。
    tokenAtBroadcast = getToken();
    loggedInAtBroadcast = isLoggedIn();
    reasonSeen = reason;
  });
  try {
    fake.push(LobbyPush.ForceLogout, { reason: ForceLogoutReason.Replaced });
    // push 回调栈内已完成派生：不需要任何 await 即可观察到广播结果。
    assert.equal(reasonSeen, "FORCE_REPLACED");
    assert.equal(tokenAtBroadcast, "", "订阅者只能观察到已经无凭证的状态（先清 token 再广播）");
    assert.equal(loggedInAtBroadcast, false);
    assert.equal(getToken(), "");

    // 此后的 Portal 请求（portalOptional：有 token 才带 Bearer）不得携带旧 Bearer。
    const headers: Array<[string, string]> = [];
    const originalXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    class ProbeXhr {
      status = 0; responseText = ""; timeout = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      open(_method: string, _url: string): void {}
      setRequestHeader(name: string, value: string): void { headers.push([name, value]); }
      send(): void {
        this.status = 200;
        this.responseText = JSON.stringify({
          hash: "coordinator-directory",
          isOps: false,
          myServerIds: [],
          servers: [{
            serverId: 1,
            name: "区1",
            status: "smooth",
            tag: "normal",
            openTime: 1,
            gameHttpUrl: "https://game-1.example",
            gameWsUrl: "wss://game-1.example",
          }],
        });
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = ProbeXhr;
    try {
      initPortal("https://portal.example");
      await portalRequest("GET", "/v1/areas");
    } finally {
      (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = originalXhr;
    }
    assert.ok(!headers.some(([name]) => name.toLowerCase() === "authorization"),
      "auth-invalid 之后的请求不得携带旧 Bearer");
  } finally {
    off();
    clearSession();
    await WebSocketClient.inst.leave().catch(() => {});
  }
});

test("单槽注册 fail-fast：已注册未释放时 registerReturnToLogin/registerSessionReconciler 直接 throw", () => {
  const offReturn = registerReturnToLogin(() => {});
  try {
    assert.throws(() => registerReturnToLogin(() => {}), /fail-fast/,
      "returnToLogin 双注册必须 throw（⛔ 不允许静默覆盖）");
  } finally {
    offReturn();
  }
  // 释放后可重新注册；旧 disposer 因身份比对不会误清新注册。
  const offSecond = registerReturnToLogin(() => {});
  offReturn(); // 旧 disposer：no-op
  assert.throws(() => registerReturnToLogin(() => {}), /fail-fast/,
    "旧 disposer 不得清掉新注册（身份比对语义保留）");
  offSecond();

  const offReconciler = registerSessionReconciler(() => true);
  try {
    assert.throws(() => registerSessionReconciler(() => true), /fail-fast/,
      "session reconciler 双注册必须 throw");
  } finally {
    offReconciler();
  }
  const offAgain = registerSessionReconciler(() => true);
  offAgain();
});

test("bus→derive 分支矩阵：closed 三分类派生正确，非 closed 事件不触发 session 广播", async () => {
  const auth: string[] = [];
  const conn: number[] = [];
  const battle: number[] = [];
  const reasons: string[] = [];
  const offAuth = onAuthInvalid((reason) => auth.push(reason));
  const offConn = onConnLost(() => conn.push(1));
  const offBattle = onBattleLost(() => battle.push(1));
  const offReturn = registerReturnToLogin((reason) => { reasons.push(reason.kind); });
  const base = { connGeneration: 1, seq: 1 } as const;
  try {
    login("u_branches");

    const passthrough: LobbyConnectionEvent[] = [
      { kind: "joining", ...base },
      { kind: "ready", ...base },
      { kind: "dropped", ...base },
      { kind: "reconnected", ...base },
    ];
    for (const event of passthrough) handleLobbyConnectionEvent(event);
    assert.deepEqual([auth.length, conn.length, battle.length], [0, 0, 0],
      "joining/ready/dropped/reconnected 本批仅透传，session 层不派生");

    handleLobbyConnectionEvent({ kind: "closed", reason: "voluntary", ...base });
    assert.deepEqual([auth.length, conn.length], [0, 0], "voluntary 不触发任何 session 广播");
    await Promise.resolve();
    assert.deepEqual(reasons, [], "voluntary 不触发导航");
    assert.equal(isLoggedIn(), true, "voluntary 不清会话");

    handleLobbyConnectionEvent({ kind: "closed", reason: "final-loss", ...base });
    assert.deepEqual(conn, [1], "final-loss → connLost 广播");
    assert.equal(isLoggedIn(), false, "无 reconciler 时 final-loss 进入统一回登录出口并清理凭证");
    await Promise.resolve();
    assert.deepEqual(reasons, ["CONN_LOST"]);

    login("u_branches_2");
    handleLobbyConnectionEvent({ kind: "closed", reason: "auth-invalid", authReason: "ACCOUNT_BANNED", ...base });
    assert.deepEqual(auth, ["ACCOUNT_BANNED"], "auth-invalid → notifyAuthInvalid(authReason)");
    assert.equal(isLoggedIn(), false);
    await Promise.resolve();
    assert.deepEqual(reasons, ["CONN_LOST", "AUTH_INVALID"]);
    assert.deepEqual(battle, [], "连接事件不派生 battleLost（battle transport 归一属阶段 9）");
  } finally {
    offAuth(); offConn(); offBattle(); offReturn();
    clearSession();
  }
});

test("LifecycleBus：严格同步转发（无微任务）、通道隔离、解绑与异常隔离", () => {
  const bus = new LifecycleBus();
  const seen: string[] = [];
  const offThrow = bus.subscribe("host", (event) => {
    seen.push(`throw:${event.kind}#${event.seq}`);
    throw new Error("host listener boom");
  });
  const offTail = bus.subscribe("host", (event) => { seen.push(`tail:${event.kind}#${event.seq}`); });
  const offConn = bus.subscribe("connection", (event) => { seen.push(`conn:${event.kind}`); });

  bus.publish("host", { kind: "hide", seq: 1 });
  // publish 返回时订阅者必须已被同步调用——若发布经 queueMicrotask/Promise 转发，
  // 此处断言立即转红（无需 await）。
  assert.deepEqual(seen, ["throw:hide#1", "tail:hide#1"],
    "host 发布必须严格同步送达全部订阅者，且异常不中断后续 listener");
  assert.ok(!seen.some((entry) => entry.startsWith("conn:")), "通道之间不得串扰");

  offThrow();
  bus.publish("host", { kind: "show", seq: 2 });
  assert.deepEqual(seen.slice(2), ["tail:show#2"], "解绑后不再送达");
  offTail();
  offConn();
  bus.publish("host", { kind: "hide", seq: 3 });
  assert.equal(seen.length, 3, "全部解绑后发布是 no-op");
});

test("CocosLifecycleBridge：EVENT_HIDE/EVENT_SHOW 进 bus host 通道，seq 单调，卸载幂等解绑", async () => {
  type LoaderModule = { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const require = createRequire(import.meta.url);
  const moduleApi = require("node:module") as LoaderModule;
  const originalLoad = moduleApi._load;
  moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
    if (request === "cc") {
      return {
        game: { on: () => {}, off: () => {} },
        Game: { EVENT_HIDE: "game_on_hide", EVENT_SHOW: "game_on_show" },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  let bridge: typeof import("../src/app/CocosLifecycleBridge");
  try {
    bridge = await import("../src/app/CocosLifecycleBridge");
  } finally {
    moduleApi._load = originalLoad;
  }

  const listeners = new Map<string, () => void>();
  const host = {
    on: (type: string, callback: () => void) => { listeners.set(type, callback); },
    off: (type: string, callback: () => void) => {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
  };
  const bus = new LifecycleBus();
  const events: Array<{ kind: string; seq: number }> = [];
  const offHost = bus.subscribe("host", (event) => { events.push({ kind: event.kind, seq: event.seq }); });

  const dispose = bridge.installCocosLifecycleBridge(bus, host);
  assert.deepEqual([...listeners.keys()].sort(), ["game_on_hide", "game_on_show"],
    "bridge 必须挂 EVENT_HIDE/EVENT_SHOW 两个宿主监听");

  listeners.get("game_on_hide")?.();
  listeners.get("game_on_show")?.();
  listeners.get("game_on_hide")?.();
  assert.deepEqual(events.map((event) => event.kind), ["hide", "show", "hide"]);
  for (let index = 1; index < events.length; index++) {
    assert.ok(events[index].seq > events[index - 1].seq, "host 事件 seq 必须单调递增");
  }

  dispose();
  dispose(); // 幂等
  assert.equal(listeners.size, 0, "卸载必须解绑全部宿主监听");
  offHost();
});
