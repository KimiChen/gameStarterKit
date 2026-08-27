/**
 * 页面异步生命周期无头回归：底层请求即使忽略 AbortSignal，关闭/重进后的旧结果也不能
 * 触发页面回调。View 层的 FairyGUI 绑定在 Creator 侧验证，这里只钉住 Logic 世代语义。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AreaListLogic } from "../src/logic/page/AreaListLogic";
import { LoginNoticeLogic } from "../src/logic/page/LoginNoticeLogic";
import { GuildLogic } from "../src/logic/page/GuildLogic";
import type { WebPlatformAreaListResponse } from "../src/shared/index";

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const area = (id: number): WebPlatformAreaListResponse => ({
  isOps: false,
  hash: `h${id}`,
  servers: [{
    serverId: id,
    name: `s${id}`,
    status: "smooth",
    tag: "normal",
    openTime: 1,
    gameHttpUrl: "http://game.example",
    gameWsUrl: "ws://game.example",
  }],
  myServerIds: [],
});

test("AreaListLogic：stop 后迟到 HTTP 不触发 tabs/list 回调", async () => {
  const pending = deferred<ReturnType<typeof area>>();
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
  pending.resolve(area(1));
  await started;
  assert.equal(tabs, 0);
  assert.equal(servers, 0);
});

test("AreaListLogic：重进页面时只接受最新世代结果", async () => {
  const first = deferred<ReturnType<typeof area>>();
  const second = deferred<ReturnType<typeof area>>();
  let call = 0;
  const logic = new AreaListLogic({
    fetchAreaList: async () => (call++ === 0 ? first.promise : second.promise),
  });
  const hashes: string[] = [];
  logic.onTabs = () => { hashes.push(logic.serversOfTab("all")[0]?.name ?? ""); };
  const oldStart = logic.start();
  const newStart = logic.start();
  first.resolve(area(1));
  second.resolve(area(2));
  await Promise.all([oldStart, newStart]);
  assert.deepEqual(hashes, ["s2"]);
});

test("AreaListLogic：拉取边界取得独立快照，外部/回调突变不会污染后续选服", async () => {
  const response = area(3);
  const logic = new AreaListLogic({ fetchAreaList: async () => response });
  await logic.start();

  // The dependency may retain and mutate its response after the await.  The
  // logic must own a validated copy before publishing it to the view.
  response.servers[0].name = "外部突变";
  assert.equal(logic.serversOfTab("all")[0]?.name, "s3");

  const exposed = logic.serversOfTab("all");
  exposed[0].name = "视图突变";
  assert.equal(logic.serversOfTab("all")[0]?.name, "s3");

  logic.onChoose = (server) => { server.name = "回调突变"; };
  assert.equal(logic.choose(3), true);
  assert.equal(logic.serversOfTab("all")[0]?.name, "s3");
});

test("AreaListLogic：恶意 response 在发布前拒绝且不触发页面回调", async () => {
  // Promise resolution probes `then`; keep that property benign so the
  // hostile shape reaches the validator instead of failing in native await.
  const hostile = new Proxy(area(4), {
    get(target, key, receiver) {
      if (key === "then") return undefined;
      return Reflect.get(target, key, receiver);
    },
    getPrototypeOf() { throw new Error("hostile prototype"); },
  });
  const logic = new AreaListLogic({
    fetchAreaList: async () => hostile as never,
  });
  let callbacks = 0;
  logic.onTabs = () => { callbacks++; };
  await assert.rejects(logic.start(), /WIRE_KEYS|WIRE_OBJECT/);
  assert.equal(callbacks, 0);
});

test("LoginNoticeLogic：stop 后迟到公告不更新正文", async () => {
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
  pending.resolve({ list: [{ id: 1, category: "notice", title: "x", desc: "", content: "late", at: 1 }] });
  await started;
  assert.equal(tabCalls, 0);
  assert.equal(contentCalls, 0);
});

test("Area/Notice：stop 后主动事件也不再触发旧 View 回调", async () => {
  const areaLogic = new AreaListLogic({
    fetchAreaList: async () => area(1),
  });
  let areaServers = 0;
  let areaChosen = 0;
  areaLogic.onServers = () => { areaServers++; };
  areaLogic.onChoose = () => { areaChosen++; };
  await areaLogic.start();
  areaLogic.stop();
  areaLogic.setTab("recommend");
  areaLogic.choose(1);
  assert.equal(areaServers, 1, "stop 前首拉应有一次列表回调");
  assert.equal(areaChosen, 0, "stop 后 choose 不应触发旧回调");

  const noticeLogic = new LoginNoticeLogic({
    fetchNotices: async () => ({ list: [{ id: 1, category: "notice", title: "x", desc: "", content: "c", at: 1 }] }),
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

test("GuildLogic：stop 后迟到 pull 结果不触发 events/error/gap", async () => {
  const pending = deferred<{ events: never[]; latestSeq: number; guildId: number }>();
  const pushRef: { current: ((data: { seq: number; guildId: number }) => void) | null } = { current: null };
  const logic = new GuildLogic({
    getEvents: async () => pending.promise,
    onPush: (_type, cb) => {
      pushRef.current = cb;
      return () => { pushRef.current = null; };
    },
  });
  let events = 0;
  let errors = 0;
  let gaps = 0;
  logic.onEvents = () => { events++; };
  logic.onPullError = () => { errors++; };
  logic.onGapRefresh = () => { gaps++; };
  const started = logic.start(0, 7);
  pushRef.current?.({ seq: 1, guildId: 7 });
  logic.stop();
  pending.resolve({ events: [], latestSeq: 1, guildId: 7 });
  await started;
  assert.equal(events, 0);
  assert.equal(errors, 0);
  assert.equal(gaps, 0);
});

test("GuildLogic：旧世代 pull 在途时重进页面，新的首拉不被旧 pulling 状态阻塞", async () => {
  const old = deferred<{ events: never[]; latestSeq: number; guildId: number }>();
  let call = 0;
  const logic = new GuildLogic({
    getEvents: async () => {
      if (call++ === 0) return old.promise;
      return { events: [], latestSeq: 0, guildId: 9 };
    },
    onPush: (_type, _cb) => () => {},
  });
  const first = logic.start(0, 7);
  const second = logic.start(0, 9);
  await second;
  assert.equal(call, 2);
  old.resolve({ events: [], latestSeq: 99, guildId: 7 });
  await first;
  assert.equal(logic.seq, 0, "旧世代响应不得覆盖新页面水位");
});
