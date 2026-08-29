/**
 * 迁移页面的逻辑层无头单测（logic/page/ 纯 TS，依赖注入 net）。
 * 覆盖：选服拉取/分页/维护与未开服不可进（isServerEnterable 判定单源）/运维豁免/默认选中过滤、
 * 公告拉取/选中、登录进度/幂等、Confirm 单双按钮/只结算一次。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AreaListLogic } from "../src/logic/page/AreaListLogic";
import { LoginNoticeLogic, noticeDateStamp } from "../src/logic/page/LoginNoticeLogic";
import {
  joinSelectedServerLobby,
  LoginLogic,
  runAuthenticatedLoginFlow,
} from "../src/logic/page/LoginLogic";
import { ConfirmLogic } from "../src/logic/page/ConfirmLogic";
import {
  chooseServer,
  getCurrentGameWsUrl,
  getCurrentServer,
  getServerList,
  pickDefaultServer,
  setServerList,
} from "../src/net/serverSession";
import { isServerEnterable } from "../src/logic/areaDirectory";
import { areaStatusIconUrl } from "../src/view/areaPresentation";
import type { WebPlatformAreaListResponse, WebPlatformAreaServer } from "../src/shared/index";
import { clearSession, isLoggedIn, setSession } from "../src/net/session";

const srv = (
  serverId: number,
  tag: WebPlatformAreaServer["tag"] = "normal",
  openTime = tag === "maintenance" ? 0 : 1_700_000_000,
  status: WebPlatformAreaServer["status"] = tag === "maintenance" ? "maintenance" : "smooth",
): WebPlatformAreaServer => ({
  serverId,
  name: `区${serverId}`,
  tag,
  status,
  openTime,
  gameHttpUrl: "http://localhost:2568",
  gameWsUrl: "ws://localhost:2568",
});
const areaRes = (
  servers: WebPlatformAreaServer[],
  myServerIds: number[] = [],
  isOps = false,
): WebPlatformAreaListResponse => ({ isOps, servers, myServerIds, hash: "hh" });

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

test("AreaList：拉取 + 推荐/我的角色/全部区服页签 + 维护不可进", async () => {
  const servers = [
    srv(1, "new"),
    srv(2),
    srv(3, "maintenance"),
    ...Array.from({ length: 9 }, (_, i) => srv(11 + i)),
  ];
  const logic = new AreaListLogic({ fetchAreaList: async () => areaRes(servers, [2]) });
  const rendered: number[][] = [];
  let tabKeys: string[] = [];
  logic.onServers = (s) => rendered.push(s.map((x) => x.serverId));
  logic.onTabs = (t) => { tabKeys = t.map((x) => x.key); };
  await logic.start();
  assert.equal(logic.isOps, false);
  assert.deepEqual(tabKeys, ["recommend", "my", "all"], "固定展示推荐/我的角色/全部区服");
  assert.deepEqual(logic.serversOfTab("recommend").map((s) => s.serverId), [1], "推荐 = tag=new");
  assert.deepEqual(logic.serversOfTab("my").map((s) => s.serverId), [2], "我的 = myServerIds ∩ servers");
  assert.equal(logic.serversOfTab("all").length, 12, "全部");

  let chosen = -1;
  logic.onChoose = (s) => { chosen = s.serverId; };
  assert.equal(logic.choose(1), true);
  assert.equal(chosen, 1);
  assert.equal(logic.choose(3), false, "维护服（status=maintenance）不可进");
  assert.equal(logic.choose(999), false, "不存在的服不可进");
});

test("AreaList：未开服（openTime=0）不可进——含挂 new 角标的未开服", async () => {
  const unopened = srv(5, "new", 0);
  const logic = new AreaListLogic({ fetchAreaList: async () => areaRes([srv(1), unopened]) });
  await logic.start();
  assert.deepEqual(logic.serversOfTab("recommend").map((s) => s.serverId), [5], "推荐页签可展示未开服（预告位）");
  let chosen = -1;
  logic.onChoose = (s) => { chosen = s.serverId; };
  assert.equal(logic.choose(5), false, "未开服（openTime=0）不可进，即使挂着新服角标");
  assert.equal(chosen, -1, "onChoose 不得被触发");
  assert.equal(logic.choose(1), true, "正常服不受影响");
});

test("AreaList：运维模式（isOps）豁免——维护/未开服的开服前验证可选中", async () => {
  // isOps 是部署环境级开关（服务端 AREA_IS_OPS），非按账号：运维环境下维护服重开前、
  // 新服 openTime 翻正前都要能从选服页选中进入验证；普通环境两者都拦（上两个用例）。
  const logic = new AreaListLogic({
    fetchAreaList: async () => areaRes([srv(3, "maintenance"), srv(5, "new", 0)], [], true),
  });
  await logic.start();
  assert.equal(logic.isOps, true);
  let chosen = -1;
  logic.onChoose = (s) => { chosen = s.serverId; };
  assert.equal(logic.choose(3), true, "运维模式：维护服可选（重开前验证）");
  assert.equal(chosen, 3);
  assert.equal(logic.choose(5), true, "运维模式：未开服可选（开服前验证）");
  assert.equal(logic.choose(999), false, "不存在的服运维也不可选");
});

test("AreaList 生命周期：stop 后迟到 HTTP 不触发 tabs/list 回调", async () => {
  const pending = deferred<WebPlatformAreaListResponse>();
  let receivedSignal: AbortSignal | undefined;
  const logic = new AreaListLogic({
    fetchAreaList: async (signal) => {
      receivedSignal = signal;
      return pending.promise;
    },
  });
  let tabs = 0;
  let servers = 0;
  logic.onTabs = () => { tabs++; };
  logic.onServers = () => { servers++; };
  const started = logic.start();
  logic.stop();
  assert.equal(receivedSignal?.aborted, true, "stop 应向依赖发出 abort");
  pending.resolve(areaRes([srv(101)]));
  await started;
  assert.equal(tabs, 0);
  assert.equal(servers, 0);
});

test("AreaList 生命周期：重进页面时只接受最新世代结果", async () => {
  const first = deferred<WebPlatformAreaListResponse>();
  const second = deferred<WebPlatformAreaListResponse>();
  let call = 0;
  const logic = new AreaListLogic({
    fetchAreaList: async () => (call++ === 0 ? first.promise : second.promise),
  });
  const names: string[] = [];
  logic.onTabs = () => { names.push(logic.serversOfTab("all")[0]?.name ?? ""); };
  const oldStart = logic.start();
  const newStart = logic.start();
  first.resolve(areaRes([srv(102)]));
  second.resolve(areaRes([srv(103)]));
  await Promise.all([oldStart, newStart]);
  assert.deepEqual(names, ["区103"]);
});

test("AreaList 生命周期：拉取边界和回调均使用独立快照", async () => {
  const response = areaRes([srv(104)]);
  const logic = new AreaListLogic({ fetchAreaList: async () => response });
  await logic.start();

  // The dependency may retain and mutate its response after the await.
  response.servers[0].name = "外部突变";
  assert.equal(logic.serversOfTab("all")[0]?.name, "区104");

  const exposed = logic.serversOfTab("all");
  exposed[0].name = "视图突变";
  assert.equal(logic.serversOfTab("all")[0]?.name, "区104");

  logic.onChoose = (server) => { server.name = "回调突变"; };
  assert.equal(logic.choose(104), true);
  assert.equal(logic.serversOfTab("all")[0]?.name, "区104");
});

test("AreaList 生命周期：恶意 response 在发布前拒绝且不触发页面回调", async () => {
  const known = areaRes([srv(105)]);
  // Promise resolution probes `then`; keep that property benign so the
  // hostile shape reaches the wire validator instead of native await.
  const hostile = new Proxy(known, {
    get(target, key, receiver) {
      if (key === "then") return undefined;
      return Reflect.get(target, key, receiver);
    },
    getPrototypeOf() { throw new Error("hostile prototype"); },
  });
  const logic = new AreaListLogic({ fetchAreaList: async () => hostile as never });
  let callbacks = 0;
  logic.onTabs = () => { callbacks++; };
  await assert.rejects(logic.start(), /WIRE_KEYS|WIRE_OBJECT|WIRE/i);
  assert.equal(callbacks, 0);
});

test("Area/Notice 生命周期：stop 后主动事件也不再触发旧 View 回调", async () => {
  const areaLogic = new AreaListLogic({ fetchAreaList: async () => areaRes([srv(106)]) });
  let areaServers = 0;
  let areaChosen = 0;
  areaLogic.onServers = () => { areaServers++; };
  areaLogic.onChoose = () => { areaChosen++; };
  await areaLogic.start();
  areaLogic.stop();
  areaLogic.setTab("recommend");
  areaLogic.choose(106);
  assert.equal(areaServers, 1, "stop 前首拉应有一次列表回调");
  assert.equal(areaChosen, 0, "stop 后 choose 不应触发旧回调");

  const noticeLogic = new LoginNoticeLogic({
    fetchNotices: async () => ({ list: [{ id: 1, category: "notice" as const, title: "x", desc: "", content: "c", at: 1 }] }),
    readDontRemindToday: () => false,
    writeDontRemindToday: () => {},
  });
  let contentCalls = 0;
  noticeLogic.onContent = () => { contentCalls++; };
  await noticeLogic.start();
  noticeLogic.stop();
  noticeLogic.select(1);
  assert.equal(contentCalls, 1, "stop 前首拉应有一次正文回调");
});

test("LoginNotice 生命周期：stop 后迟到公告不更新正文", async () => {
  const pending = deferred<{ list: [{ id: number; category: "notice"; title: string; desc: string; content: string; at: number }] }>();
  const logic = new LoginNoticeLogic({
    fetchNotices: async () => pending.promise,
    readDontRemindToday: () => false,
    writeDontRemindToday: () => {},
  });
  let tabCalls = 0;
  let contentCalls = 0;
  logic.onTabs = () => { tabCalls++; };
  logic.onContent = () => { contentCalls++; };
  const started = logic.start();
  logic.stop();
  pending.resolve({ list: [{ id: 2, category: "notice", title: "x", desc: "", content: "late", at: 1 }] });
  await started;
  assert.equal(tabCalls, 0);
  assert.equal(contentCalls, 0);
});

test("Area：isServerEnterable 判定单源（维护/未开服双条件）", () => {
  assert.equal(isServerEnterable({ status: "smooth", openTime: 1_700_000_000 }), true);
  assert.equal(isServerEnterable({ status: "maintenance", openTime: 1_700_000_000 }), false, "维护不可进");
  assert.equal(isServerEnterable({ status: "smooth", openTime: 0 }), false, "未开服不可进——新服角标也一样");
  assert.equal(isServerEnterable({ status: "maintenance", openTime: 0 }), false);
});

test("serverSession：存列表 + 默认选中（myServerIds 优先，否则首个可进入服）+ 选服", () => {
  const list = areaRes([srv(1, "maintenance"), srv(2), srv(3)], [3]);
  setServerList(list);
  assert.equal(pickDefaultServer(list)?.serverId, 3, "myServerIds[0]=3 优先");
  assert.equal(pickDefaultServer(areaRes([srv(1, "maintenance"), srv(2)]))?.serverId, 2,
    "无 myServerIds → 首个可进入服（跳过维护）");
  chooseServer(srv(2));
  assert.equal(getCurrentServer()?.serverId, 2);
  assert.equal(getCurrentServer()?.gameHttpUrl, "http://localhost:2568", "选中服带独立 HTTP 地址");
  assert.equal(getCurrentServer()?.gameWsUrl, "ws://localhost:2568", "选中服带独立 WS 地址");
});

test("serverSession：默认选中跳过不可进服——最近服顺延 / 兜底扫描 / 全不可进展示位", () => {
  assert.equal(
    pickDefaultServer(areaRes([srv(1, "maintenance"), srv(2), srv(3)], [1, 3]))?.serverId,
    3,
    "myServerIds[0]=1 维护 → 顺延下一项 3",
  );
  assert.equal(pickDefaultServer(areaRes([srv(5, "new", 0), srv(2)], [5]))?.serverId, 2,
    "兜底扫描跳过未开服（tag=new/openTime=0）");
  // 全不可进 → servers[0] 展示位兜底（进服闸负责拦截，pages.ts onEnter）
  assert.equal(
    pickDefaultServer(areaRes([srv(1, "maintenance"), srv(5, "new", 0)]))?.serverId,
    1,
    "全不可进 → servers[0] 展示位兜底",
  );
  assert.equal(pickDefaultServer(areaRes([])), null, "空列表 → null");
});

test("serverSession：目录刷新保留当前区，区消失才回退默认，失败保留完整旧快照", () => {
  const first = { ...areaRes([srv(10), srv(20)], [10]), hash: "h1" };
  setServerList(first);
  chooseServer(first.servers[1]);
  assert.equal(getCurrentServer()?.serverId, 20);

  // 新目录仍含 20：地址、hash 与列表一起替换，但用户选择不被默认值覆盖。
  const refreshed = { ...areaRes([srv(10), { ...srv(20), gameWsUrl: "ws://zone20-v2" }], [10]), hash: "h2" };
  setServerList(refreshed);
  assert.equal(getCurrentServer()?.serverId, 20);
  assert.equal(getCurrentServer()?.gameWsUrl, "ws://zone20-v2");

  // 当前区不在新目录：按 myServerIds/可进入规则选择默认区。
  const removed = { ...areaRes([srv(30), srv(40)], [40]), hash: "h3" };
  setServerList(removed);
  assert.equal(getCurrentServer()?.serverId, 40);
  assert.equal(getServerList()?.hash, "h3");

  // 模拟拉取失败：调用方不执行 setServerList，旧快照必须原样可用。
  assert.equal(getCurrentServer()?.serverId, 40);
  assert.deepEqual(getServerList(), removed);
});

test("serverSession：目录输入和 getter 都是隔离副本，不会拆散 list/hash/current 快照", () => {
  const input = { ...areaRes([srv(70), srv(80)], [70]), hash: "owned" };
  setServerList(input);

  // The caller may reuse/mutate the network response after publishing it.
  input.hash = "mutated";
  input.myServerIds[0] = 80;
  input.servers[0].gameHttpUrl = "http://tampered";
  assert.equal(getCurrentServer()?.serverId, 70);
  assert.equal(getServerList()?.servers[0].gameHttpUrl, "http://localhost:2568");

  // A view may also sort/edit the returned list; that must not alter the
  // session used by the next join.
  const exposed = getServerList()!;
  exposed.hash = "getter-tampered";
  exposed.servers.reverse();
  exposed.servers[0].gameWsUrl = "ws://tampered";
  assert.equal(getCurrentServer()?.serverId, 70);
  assert.deepEqual(getServerList()?.servers.map((server) => server.serverId), [70, 80]);
});

test("serverSession：写入点拒绝恶意目录且保留上一份完整快照", () => {
  const known = areaRes([srv(81), srv(82)], [82]);
  setServerList(known);
  const before = getServerList();
  const selectedBefore = getCurrentServer();

  assert.throws(
    () => setServerList({ ...known, servers: [{ ...srv(81), gameHttpUrl: "javascript:alert(1)" }] }),
    /WIRE|HTTP|URL|response/i,
  );
  assert.deepEqual(getServerList(), before, "非法刷新不得替换目录快照");
  assert.deepEqual(getCurrentServer(), selectedBefore, "非法刷新不得改变当前区");
});

test("serverSession：WS accessor 只取当前快照，空目录后拒绝建立连接", () => {
  const list = areaRes([{ ...srv(91), gameWsUrl: "wss://zone-91.example" }]);
  setServerList(list);
  assert.equal(getCurrentGameWsUrl(), "wss://zone-91.example");
  // 生产代码只在成功拉取后发布快照；测试用合法空目录模拟无可选区服，
  // 不暴露一个没有生产调用方的公共 reset 写入点。
  setServerList(areaRes([]));
  assert.deepEqual(getServerList()?.servers, []);
  assert.equal(getCurrentServer(), null);
  assert.throws(() => getCurrentGameWsUrl(), /尚未选择区服/);
});

test("Login 大厅接缝：同一份当前目录快照提供 gameWsUrl 与 sId", async () => {
  const selected = {
    ...srv(92),
    gameHttpUrl: "https://http-zone-92.example",
    gameWsUrl: "wss://ws-zone-92.example",
  };
  setServerList(areaRes([selected]));
  const current = getCurrentServer();
  assert.ok(current);
  const calls: unknown[] = [];
  const controller = new AbortController();

  await joinSelectedServerLobby(current, "zone-92-token", {
    init: (endpoint) => { calls.push(["init", endpoint]); },
    join: async (token, options, signal) => { calls.push(["join", token, options, signal]); },
  }, controller.signal);

  assert.deepEqual(calls, [
    ["init", "wss://ws-zone-92.example"],
    ["join", "zone-92-token", { sId: 92 }, controller.signal],
  ]);
});

test("公告日期键：生产纯函数锁定 UTC+8 自然日边界", () => {
  assert.equal(noticeDateStamp(Date.parse("2026-08-28T15:59:59.999Z")), "20693");
  assert.equal(noticeDateStamp(Date.parse("2026-08-28T16:00:00.000Z")), "20694");
});

test("Area 状态展示：Public 字符串枚举稳定映射现有 FGUI 图标", () => {
  assert.equal(areaStatusIconUrl("smooth"), "ui://Dynamic_Login/login_status_1");
  assert.equal(areaStatusIconUrl("busy"), "ui://Dynamic_Login/login_status_2");
  assert.equal(areaStatusIconUrl("maintenance"), "ui://Dynamic_Login/login_status_9");
});

test("LoginNotice：页签标题最多 4 字 + 默认选中首条正文 + 切标签换正文", async () => {
  let storedDontRemind = false;
  const deps = {
    fetchNotices: async () => ({ list: [
      { id: 10, category: "notice", title: "开服狂欢", desc: "da", content: "ca", at: 2 },
      { id: 11, category: "activity", title: "版本更新公告", desc: "db", content: "cb", at: 1 },
    ] }),
    readDontRemindToday: () => storedDontRemind,
    writeDontRemindToday: (value: boolean) => { storedDontRemind = value; },
  };
  const logic = new LoginNoticeLogic(deps);
  let tabs: string[] = [];
  const content: { c: string; i: number }[] = [];
  logic.onTabs = (t) => { tabs = t; };
  logic.onContent = (it, i) => content.push({ c: it.content, i });
  await logic.start();
  assert.equal(logic.items.length, 2);
  assert.deepEqual(tabs, ["开服狂欢", "版本更新"], "4 字标题不变，超长标题截为前 4 字");
  assert.equal(logic.items[1].title, "版本更新公告", "公告原始标题保持完整");
  assert.deepEqual(content.at(-1), { c: "ca", i: 0 }, "默认选中首条 → 正文 ca（index 0）");
  logic.select(11);
  assert.equal(logic.selected?.id, 11);
  assert.deepEqual(content.at(-1), { c: "cb", i: 1 }, "切标签换正文 cb（index 1）");
  logic.select(999);
  assert.equal(logic.selected?.id, 11, "选不存在的公告 = no-op，选中态不变");
  assert.deepEqual(content.at(-1), { c: "cb", i: 1 }, "no-op 不再触发 onContent");

  assert.equal(logic.dontRemindToday, false, "初始未勾选");
  logic.setDontRemindToday(true);
  assert.equal(storedDontRemind, true, "勾选后写入存储");
  const reopened = new LoginNoticeLogic(deps);
  assert.equal(reopened.dontRemindToday, true, "关闭后重新打开可恢复勾选状态");
  reopened.setDontRemindToday(false);
  assert.equal(storedDontRemind, false, "取消勾选后清除状态");
});

test("Login：进度回调 + 登录幂等（重复点不重复请求）", async () => {
  let calls = 0;
  const logic = new LoginLogic({
    login: async (key) => {
      calls++;
      return { userId: "u_1", accessToken: `u_1.${"a".repeat(48)}-${key}`, isNewAccount: true };
    },
  });
  const prog: number[] = [];
  logic.onProgress = (r) => prog.push(r);
  const [a, b] = await Promise.all([logic.doLogin("dev_a"), logic.doLogin("dev_a")]);
  assert.equal(a?.userId, "u_1");
  assert.equal(b?.userId, "u_1", "并发第二发合流拿同一结果（不是 null）");
  assert.equal(calls, 1, "并发重复点只请求一次");
  assert.equal(logic.userId, "u_1");
  assert.ok(logic.accessToken.startsWith("u_1."));
  assert.equal(logic.isNewAccount, true);
  assert.ok(prog.includes(0.4), "账号验证成功推进到 0.4（满格由编排层进大厅/拉档案后收口）");

  const failLogic = new LoginLogic({ login: async () => null });
  assert.equal(await failLogic.doLogin("dev_a"), null, "登录失败 resolve null");
  const throwLogic = new LoginLogic({ login: async () => { throw new Error("HTTP 500"); } });
  assert.equal(await throwLogic.doLogin("dev_a"), null, "登录 reject 也按失败处理（不外抛）");
});

test("Login：签发请求失败不自动重试（由用户明确再次发起）", async () => {
  let calls = 0;
  const logic = new LoginLogic({
    login: async () => {
      calls++;
      throw Object.assign(new Error("upstream unavailable"), { status: 503, code: "UPSTREAM_UNAVAILABLE" });
    },
  });
  const texts: string[] = [];
  logic.onProgress = (_r, text) => texts.push(text);
  assert.equal(await logic.doLogin("dev_b"), null);
  assert.equal(calls, 1, "登录会签发/轮换 token，客户端不得盲目自动重试");
  assert.equal(texts[texts.length - 1], "登录失败，请重试");
});

test("Login：join/GetInfo 任一失败都清会话并释放大厅，不进入半状态", async () => {
  const response = {
    userId: "u_ready",
    accessToken: "u_ready.access-token",
    isNewAccount: false,
  };
  const user = {
    uid: response.userId,
    star: 0,
    maxRound: 0,
    wins: 0,
    losses: 0,
    stamina: 100,
    lastStaminaRecoverAt: 0,
    musicOn: true,
    sfxOn: true,
    guildId: 0,
    ver: 1,
  };

  for (const failureStage of ["join", "getInfo"] as const) {
    clearSession();
    const events: string[] = [];
    const failure = new Error(`${failureStage} failed`);
    await assert.rejects(
      runAuthenticatedLoginFlow(response, {
        setSession: (next) => { events.push("setSession"); setSession(next); },
        join: async () => {
          events.push("join");
          if (failureStage === "join") throw failure;
        },
        getInfo: async () => {
          events.push("getInfo");
          if (failureStage === "getInfo") throw failure;
          return { user };
        },
        commitProfile: () => { events.push("commitProfile"); return true; },
        clearSession: () => { events.push("clearSession"); clearSession(); },
        leave: () => { events.push("leave"); },
      }),
      (error: unknown) => error === failure,
    );
    assert.deepEqual(
      events,
      failureStage === "join"
        ? ["setSession", "join", "clearSession", "leave"]
        : ["setSession", "join", "getInfo", "clearSession", "leave"],
      `${failureStage} 失败必须先清态再释放大厅，且不得继续导航`,
    );
    assert.equal(isLoggedIn(), false, `${failureStage} 失败后不得残留 bearer/session`);
  }
  clearSession();
});

test("Login：GetInfo 返回空档案也拒绝导航；成功路径保留完整会话", async () => {
  const response = { userId: "u_empty", accessToken: "u_empty.access-token", isNewAccount: false };
  clearSession();
  let clears = 0;
  let leaves = 0;
  await assert.rejects(
    runAuthenticatedLoginFlow(response, {
      setSession,
      join: async () => {},
      getInfo: async () => ({ user: null }),
      commitProfile: () => true,
      clearSession: () => { clears++; clearSession(); },
      leave: () => { leaves++; },
    }),
    /角色档案为空/,
  );
  assert.equal(clears, 1);
  assert.equal(leaves, 1);
  assert.equal(isLoggedIn(), false);

  clearSession();
  const profile = { ...response, userId: "u_success" };
  const successUser = { uid: profile.userId };
  clears = 0;
  leaves = 0;
  const result = await runAuthenticatedLoginFlow(profile, {
    setSession,
    join: async () => {},
    getInfo: async () => ({ user: successUser }),
    commitProfile: () => true,
    clearSession: () => { clears++; clearSession(); },
    leave: () => { leaves++; },
  });
  assert.strictEqual(result, successUser);
  assert.equal(clears, 0);
  assert.equal(leaves, 0);
  assert.equal(isLoggedIn(), true, "成功拿到具体角色后会话保持，才允许导航");
  clearSession();
});

test("Login：角色 uid 不匹配或快照提交过期时回滚完整登录事务", async () => {
  const response = { userId: "u_profile_owner", accessToken: "u_profile_owner.token", isNewAccount: false };
  for (const failure of ["uid-mismatch", "stale-commit"] as const) {
    const events: string[] = [];
    clearSession();
    await assert.rejects(
      runAuthenticatedLoginFlow(response, {
        setSession: (next) => { events.push("setSession"); setSession(next); },
        join: async () => { events.push("join"); },
        getInfo: async () => ({
          user: { uid: failure === "uid-mismatch" ? "u_other" : response.userId },
        }),
        commitProfile: () => { events.push("commitProfile"); return false; },
        clearSession: () => { events.push("clearSession"); clearSession(); },
        leave: () => { events.push("leave"); },
      }),
      failure === "uid-mismatch" ? /身份与登录会话不一致/ : /登录事务已失效/,
    );
    assert.deepEqual(events, failure === "uid-mismatch"
      ? ["setSession", "join", "clearSession", "leave"]
      : ["setSession", "join", "commitProfile", "clearSession", "leave"]);
    assert.equal(isLoggedIn(), false);
  }
  clearSession();
});

test("Login：旧页面世代失败不清理或关闭新会话的连接", async () => {
  const response = { userId: "u_old", accessToken: "u_old.access-token", isNewAccount: false };
  const events: string[] = [];
  await assert.rejects(
    runAuthenticatedLoginFlow(response, {
      setSession,
      join: async () => { throw new Error("stale join"); },
      getInfo: async () => ({ user: null }),
      commitProfile: () => false,
      clearSession: () => { events.push("clear"); clearSession(); },
      leave: () => { events.push("leave"); },
      shouldRollback: () => false,
    }),
    /stale join/,
  );
  assert.deepEqual(events, [], "旧世代不得触碰新世代 session/slot");
  clearSession();
});

test("Login：完整 flow 锁覆盖 HTTP 之后的 continuation", async () => {
  let loginCalls = 0;
  let continuationCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const response = { userId: "u_flow", accessToken: "u_flow.token", isNewAccount: false };
  const logic = new LoginLogic({
    login: async () => {
      loginCalls++;
      return response;
    },
  });
  const first = logic.doLoginFlow("dev", async () => {
    continuationCalls++;
    await gate;
  });
  const second = logic.doLoginFlow("dev", async () => {
    continuationCalls++;
  });
  assert.strictEqual(first, second, "重复点击必须复用整段事务 Promise");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(loginCalls, 1);
  assert.equal(continuationCalls, 1, "HTTP 完成后也不能再执行第二套后置流程");
  release();
  assert.equal((await first)?.userId, "u_flow");
});

test("Confirm：单/双按钮 + 只结算一次", () => {
  let yes = 0, closed = 0;
  const two = new ConfirmLogic({ content: "确定吗", onYes: () => yes++ });
  two.onClose = () => closed++;
  assert.equal(two.hasCancel, true);
  assert.equal(two.noText, "取消");
  two.yes(); two.yes(); two.no(); // 只第一次生效
  assert.equal(yes, 1);
  assert.equal(closed, 1);

  const one = new ConfirmLogic({ content: "仅提示", noText: null });
  assert.equal(one.hasCancel, false, "noText=null → 单按钮模式");
});
