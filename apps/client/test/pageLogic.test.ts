/**
 * 迁移页面的逻辑层无头单测（logic/page/ 纯 TS，依赖注入 net）。
 * 覆盖：选服拉取/分页/维护与未开服不可进（isServerEnterable 判定单源）/运维豁免/默认选中过滤、
 * 公告拉取/选中、登录进度/幂等、Confirm 单双按钮/只结算一次。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AreaListLogic } from "../src/logic/page/AreaListLogic";
import { LoginNoticeLogic } from "../src/logic/page/LoginNoticeLogic";
import { LoginLogic } from "../src/logic/page/LoginLogic";
import { ConfirmLogic } from "../src/logic/page/ConfirmLogic";
import { chooseServer, getCurrentServer, pickDefaultServer, setServerList, getListHash } from "../src/net/serverSession";
import { isServerEnterable } from "../src/logic/areaDirectory";
import { areaStatusIconUrl } from "../src/view/areaPresentation";
import type { WebPlatformAreaListResponse, WebPlatformAreaServer } from "../src/shared/index";

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

test("Area：isServerEnterable 判定单源（维护/未开服双条件）", () => {
  assert.equal(isServerEnterable({ status: "smooth", openTime: 1_700_000_000 }), true);
  assert.equal(isServerEnterable({ status: "maintenance", openTime: 1_700_000_000 }), false, "维护不可进");
  assert.equal(isServerEnterable({ status: "smooth", openTime: 0 }), false, "未开服不可进——新服角标也一样");
  assert.equal(isServerEnterable({ status: "maintenance", openTime: 0 }), false);
});

test("serverSession：存列表 + 默认选中（myServerIds 优先，否则首个可进入服）+ 选服", () => {
  const list = areaRes([srv(1, "maintenance"), srv(2), srv(3)], [3]);
  setServerList(list);
  assert.equal(getListHash(), "hh");
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
