/**
 * 迁移页面的逻辑层无头单测（logic/page/ 纯 TS，依赖注入 net）。
 * 覆盖：选服拉取/分页/维护不可进、公告拉取/选中、登录进度/幂等、Confirm 单双按钮/只结算一次。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AreaListLogic } from "../assets/src/logic/page/AreaListLogic";
import { LoginNoticeLogic } from "../assets/src/logic/page/LoginNoticeLogic";
import { LoginLogic } from "../assets/src/logic/page/LoginLogic";
import { ConfirmLogic } from "../assets/src/logic/page/ConfirmLogic";
import { chooseServer, getCurrentServer, pickDefaultServer, setServerList, getListHash } from "../assets/src/net/serverSession";
import type { IAreaListRes, IAreaServer } from "../assets/src/shared/index";

const srv = (sId: number, t = 0): IAreaServer =>
  ({ sId, name: `区${sId}`, t, status: 1, openTime: t === 9 ? 0 : 1_700_000_000, wsUrl: "ws://localhost:2568" });
const areaRes = (al: IAreaServer[], ul: number[] = [], isOps = 0): IAreaListRes =>
  ({ isOps, al, ul, h: "hh" });

test("AreaList：拉取 + 推荐/我的角色/全部区服页签 + 维护不可进", async () => {
  const al = [srv(1, 1), srv(2), srv(3, 9), ...Array.from({ length: 9 }, (_, i) => srv(11 + i))];
  const logic = new AreaListLogic({ fetchAreaList: async () => areaRes(al, [2], 1) });
  const rendered: number[][] = [];
  let tabKeys: string[] = [];
  logic.onServers = (s) => rendered.push(s.map((x) => x.sId));
  logic.onTabs = (t) => { tabKeys = t.map((x) => x.key); };
  await logic.start();
  assert.equal(logic.isOps, true);
  assert.deepEqual(tabKeys, ["recommend", "my", "all"], "固定展示推荐/我的角色/全部区服");
  assert.deepEqual(logic.serversOfTab("recommend").map((s) => s.sId), [1], "推荐 = t===1");
  assert.deepEqual(logic.serversOfTab("my").map((s) => s.sId), [2], "我的 = ul ∩ al");
  assert.equal(logic.serversOfTab("all").length, 12, "全部");

  let chosen = -1;
  logic.onChoose = (s) => { chosen = s.sId; };
  assert.equal(logic.choose(1), true);
  assert.equal(chosen, 1);
  assert.equal(logic.choose(3), false, "维护服（t=9）不可进");
  assert.equal(logic.choose(999), false, "不存在的服不可进");
});

test("serverSession：存列表 + 默认选中（ul 优先，否则首个非维护）+ 选服", () => {
  const list = areaRes([srv(1, 9), srv(2), srv(3)], [3]);
  setServerList(list);
  assert.equal(getListHash(), "hh");
  assert.equal(pickDefaultServer(list)?.sId, 3, "ul[0]=3 优先");
  assert.equal(pickDefaultServer(areaRes([srv(1, 9), srv(2)]))?.sId, 2, "无 ul → 首个非维护(跳过 t=9)");
  chooseServer(srv(2));
  assert.equal(getCurrentServer()?.sId, 2);
  assert.equal(getCurrentServer()?.wsUrl, "ws://localhost:2568", "选中服带连接地址");
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
    login: async (code) => { calls++; return { openId: "u", token: `tk-${code}`, isNew: true }; },
  });
  const prog: number[] = [];
  logic.onProgress = (r) => prog.push(r);
  const [a, b] = await Promise.all([logic.doLogin("c"), logic.doLogin("c")]);
  assert.equal(a, "tk-c");
  assert.equal(calls, 1, "并发重复点只请求一次");
  assert.equal(logic.token, "tk-c");
  assert.ok(prog.includes(1), "成功进度到 1");

  const failLogic = new LoginLogic({ login: async () => null });
  assert.equal(await failLogic.doLogin(), null, "登录失败 resolve null");
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
