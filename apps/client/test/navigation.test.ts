/**
 * NavigationService 单元行为（Non-intrusive §7.2 阶段 5b）：route ownership handle
 * 的取消回滚、closeGroup 对 closeLobby 硬编码数组的等价替代、authenticated base 的
 * 登记/恢复/清除、route refcount 通知。ViewMgr 经注入 seam 替身（不触达 fairygui）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILTIN_PLUGIN } from "../src/app/builtinPlugin";
import { PluginRegistry } from "../src/app/PluginRegistry";
import {
  NavigationService,
  type NavigationServiceOptions,
} from "../src/app/NavigationService";

interface FakeHandle {
  view: Record<string, unknown>;
  signal: AbortSignal;
  generation: number;
  close(): void;
  run<T>(action: (view: never, context: never) => T | Promise<T>): Promise<T>;
}

function makeFakeViews() {
  const opens: string[] = [];
  const closes: string[] = [];
  const handles = new Map<string, FakeHandle & { closed: boolean }>();
  let disposals = 0;
  let generation = 0;
  const makeHandle = (name: string) => {
    const controller = new AbortController();
    const handle = {
      view: { name },
      signal: controller.signal,
      generation: ++generation,
      closed: false,
      close: () => {
        if (handle.closed) return;
        handle.closed = true;
        controller.abort();
      },
      run: async <T>(action: (view: never, context: never) => T | Promise<T>): Promise<T> =>
        action(handle.view as never, {
          signal: controller.signal,
          generation: handle.generation,
          isActive: () => !handle.closed,
        } as never),
    };
    handles.set(name, handle);
    return handle;
  };
  const module = {
    ViewMgr: {
      open: async (name: string) => {
        opens.push(name);
        return makeHandle(name);
      },
      close: (name: string) => {
        closes.push(name);
        handles.get(name)?.close();
      },
      isOpen: (name: string) => !(handles.get(name)?.closed ?? true),
      disposeViewRoot: () => { disposals++; },
    },
  };
  return {
    module,
    opens,
    closes,
    handles,
    get disposals() { return disposals; },
  };
}

function makeNavigation() {
  const fake = makeFakeViews();
  const registry = new PluginRegistry([BUILTIN_PLUGIN]);
  const navigation = new NavigationService(registry, {
    loadViews: async () => fake.module,
  } as unknown as NavigationServiceOptions);
  return { fake, registry, navigation };
}

test("open：route → view 解析、栈登记；close/abort 即出栈（取消回滚）", async () => {
  const { fake, navigation } = makeNavigation();
  const login = await navigation.open("login");
  assert.deepEqual(fake.opens, ["Login"], "route id 必须解析到注册 view 名");
  assert.equal(login.routeId, "login");
  assert.equal(login.pluginId, "builtin");
  assert.equal(login.group, "authenticated");
  assert.ok(login.generation > 0, "route handle 必须携带导航世代");
  assert.deepEqual(navigation.openRoutes(), ["login"]);

  login.close();
  assert.equal(login.signal.aborted, true, "close 必须取消底层打开事务");
  assert.deepEqual(navigation.openRoutes(), [], "close 后必须出栈");

  assert.throws(() => navigation.close("nope"), /未登记的 route/, "未知 route fail-fast");
  await assert.rejects(navigation.open("nope"), /未登记的 route/);
});

test("closeGroup(authenticated)：按描述符声明顺序关闭原 closeLobby 数组成员，不触碰 system 组", async () => {
  const { fake, navigation } = makeNavigation();
  await navigation.open("login");
  await navigation.open("home");
  await navigation.open("confirm");
  navigation.closeGroup("authenticated");
  // 原 closeLobby 硬编码数组的成员与顺序（Login/AreaList/LoginNotice/Home）逐字保留；
  // 其后是后加入 authenticated 组的壳页面，同样按 plugin.json 的 routes 声明顺序。
  assert.deepEqual(fake.closes, ["Login", "AreaList", "LoginNotice", "Home", "PromoHome", "Settings", "EntryGroup"],
    "closeGroup 必须按描述符声明顺序关闭 authenticated 组全部成员（含原 closeLobby 四项）");
  assert.deepEqual(navigation.openRoutes(), ["confirm"],
    "system 组（session 作用域提示）不得被 authenticated 组关闭");
});

test("closeGroup/disposeViewRoot：ViewMgr 未加载（无页面打开过）时是 no-op，不强行拉起 FGUI", () => {
  const { fake, navigation } = makeNavigation();
  navigation.closeGroup("authenticated");
  navigation.disposeViewRoot();
  assert.deepEqual(fake.closes, []);
  assert.equal(fake.disposals, 0);
});

test("replace/back：关闭当前栈顶（旧 handle signal 立即失效）后打开新 route", async () => {
  const { navigation } = makeNavigation();
  const login = await navigation.open("login");
  const notice = await navigation.replace("loginNotice");
  assert.equal(login.signal.aborted, true, "replace 必须取消旧栈顶");
  assert.deepEqual(navigation.openRoutes(), ["loginNotice"]);
  navigation.back();
  assert.equal(notice.signal.aborted, true, "back 关闭当前栈顶");
  assert.deepEqual(navigation.openRoutes(), []);
});

test("authenticated base：登记/恢复/清除；恢复走登记的 reopen 而非硬编码页面", async () => {
  const { navigation } = makeNavigation();
  assert.equal(navigation.hasAuthenticatedBase(), false);
  assert.equal(await navigation.restoreAuthenticatedBase(), null,
    "未登记 base（未完成登录）时恢复必须返回 null");

  const restored: unknown[] = [];
  navigation.setAuthenticatedBase("home", async (context) => {
    restored.push(context);
    return navigation.open("home");
  });
  assert.equal(navigation.hasAuthenticatedBase(), true);
  assert.equal(navigation.authenticatedBaseRouteId(), "home");

  const handle = await navigation.restoreAuthenticatedBase({ userId: "u1" });
  assert.equal(handle?.routeId, "home");
  assert.deepEqual(restored, [{ userId: "u1" }], "恢复上下文必须原样传给登记的 reopen");

  navigation.clearAuthenticatedBase();
  assert.equal(navigation.hasAuthenticatedBase(), false);
  assert.equal(await navigation.restoreAuthenticatedBase(), null);

  assert.throws(() => navigation.setAuthenticatedBase("nope", async () => null),
    /未登记的 route/, "base 只能登记已注册 route");
});

test("route observer：refcount 变化通知（PluginHost 停用判定的地面真相）", async () => {
  const { navigation } = makeNavigation();
  const notifications: Array<{ pluginId: string; count: number }> = [];
  navigation.setRouteObserver((pluginId, count) => notifications.push({ pluginId, count }));
  const login = await navigation.open("login");
  const home = await navigation.open("home");
  assert.equal(navigation.openRouteCountOf("builtin"), 2);
  login.close();
  home.close();
  assert.deepEqual(notifications, [
    { pluginId: "builtin", count: 1 },
    { pluginId: "builtin", count: 0 },
  ], "每次 route 关闭必须带当前 open 计数通知");
  navigation.setRouteObserver(null);
});
