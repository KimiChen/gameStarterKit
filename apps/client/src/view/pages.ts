/**
 * 页面组合根（view/ 内部，Creator 侧验证）——把 ViewMgr（fairygui）+ Logic（纯 TS）+
 * net 依赖 + serverSession 状态 + 导航接线组合起来。业务/入口只调这里的 openXxx。
 *
 * 铁律 10：ViewMgr 静态依赖 fairygui，只在 view/ 内部这样静态 import；对外由 Main 走
 * 动态 import 闭包（`const p = await import("./view/pages")`）调用。
 *
 * 选服链路（对齐原项目）：openLogin 时拉 /area/list 存 serverSession + 默认选中服 →
 * Login 显示当前服 → 选服改 currentServer → 进入游戏 Main 连 currentServer.wsUrl（区服=实例）。
 */
import { ViewMgr } from "./ViewMgr";
import { sys } from "cc";
import type { LoginView } from "./LoginView";
import type { AreaListView } from "./AreaListView";
import type { LoginNoticeView } from "./LoginNoticeView";
import type { HomeView } from "./HomeView";
import type { ConfirmView } from "./ConfirmView";
import { LoginLogic } from "../logic/page/LoginLogic";
import { AreaListLogic } from "../logic/page/AreaListLogic";
import { LoginNoticeLogic } from "../logic/page/LoginNoticeLogic";
import type { IConfirmOptions } from "../logic/page/ConfirmLogic";
import { ConfirmLogic } from "../logic/page/ConfirmLogic";
import { getToken } from "../core/http";
import { login as mockLogin } from "../net/mock/login";
import { fetchAreaList } from "../net/http/area";
import { fetchNotices } from "../net/http/notice";
import { chooseServer, getCurrentServer, pickDefaultServer, setServerList, getServerList } from "../net/serverSession";
import type { IAreaServer } from "../shared/index";

const NOTICE_DONT_REMIND_DATE_KEY = "game.notice.dont-remind-date";

function localDateStamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readDontRemindToday(): boolean {
  try {
    return sys.localStorage.getItem(NOTICE_DONT_REMIND_DATE_KEY) === localDateStamp();
  } catch {
    return false;
  }
}

function writeDontRemindToday(value: boolean): void {
  try {
    if (value) sys.localStorage.setItem(NOTICE_DONT_REMIND_DATE_KEY, localDateStamp());
    else sys.localStorage.removeItem(NOTICE_DONT_REMIND_DATE_KEY);
  } catch { /* 存储不可用时不影响公告浏览 */ }
}

/** 登录页：拉选服列表 + 默认选中 → 显示当前服；按钮通往选服/公告；进入游戏走维护闸 + 登录 → 主界面。 */
export async function openLogin(onEnterBattle: () => void): Promise<void> {
  // 拉一次选服列表（对齐原项目 init 时机），存 session + 默认选中服
  try {
    const list = await fetchAreaList(getToken() || undefined);
    setServerList(list);
    const def = pickDefaultServer(list);
    if (def) chooseServer(def);
  } catch { /* 拉取失败不阻塞登录界面（无栈/离线仍能看到登录页） */ }

  const h = await ViewMgr.open("Login");
  const view = h.view as LoginView;
  const logic = new LoginLogic({ login: (code) => mockLogin(code).then((r) => r.data) });
  logic.onProgress = (ratio, text) => view.setProgress(ratio, text);

  view.onEnter = async () => {
    const cur = getCurrentServer();
    // 维护闸（对齐原项目 waitLogin）：无服 / 维护中（t===9 且非运维模式）不进
    if (!cur) { await openConfirm({ title: "提示", content: "暂无可用区服", noText: null }); return; }
    if (cur.t === 9 && (getServerList()?.isOps ?? 0) <= 0) {
      await openConfirm({ title: "维护中", content: "区服维护中，请稍候再试", noText: null });
      return;
    }
    const token = await logic.doLogin();
    if (token) { h.close(); await openHome(onEnterBattle); }
  };
  view.onNotice = () => { void openNotice(); };
  view.onSelectServer = () => { void openAreaList((s) => view.showCurrentServer(s)); };

  view.setup();
  view.showCurrentServer(getCurrentServer());
}

/** 主界面：展示用户 id，「进入游戏」→ ballMove（onEnterBattle 由 Main 注入，连 currentServer.wsUrl）。 */
export async function openHome(onEnterBattle: () => void): Promise<void> {
  const h = await ViewMgr.open("Home");
  const view = h.view as HomeView;
  view.onEnterBattle = onEnterBattle;
  const cur = getCurrentServer();
  view.setup(cur ? `${cur.name} · 已登录` : "游客");
}

/** 选服列表（HTTP）：选服 → 存 currentServer + 回调刷新登录页 → 关闭。 */
export async function openAreaList(onChosen?: (server: IAreaServer) => void): Promise<void> {
  const h = await ViewMgr.open("AreaList");
  const view = h.view as AreaListView;
  const logic = new AreaListLogic({ fetchAreaList });
  logic.onChoose = (server) => {
    chooseServer(server);       // 区服=实例：记住选中服，进入游戏时连它
    onChosen?.(server);         // 刷新登录页 btn_server
    h.close();
  };
  view.onClose = () => h.close();  // 右上角关闭：不选服直接关面板
  view.setup(logic);
  await logic.start(getToken() || undefined);
}

/** 公告（HTTP）：顶部 CompTab 标签（每条公告一个）+ txt_content 正文，选标签内联切换（对齐源项目最新版）。 */
export async function openNotice(): Promise<void> {
  const h = await ViewMgr.open("LoginNotice");
  const view = h.view as LoginNoticeView;
  const logic = new LoginNoticeLogic({ fetchNotices, readDontRemindToday, writeDontRemindToday });
  view.onClose = () => h.close();
  view.setup(logic);
  await logic.start();
}

/** 关闭全部大厅壳页面（进入 ballMove 前调用，让出 GL 画布给玩法渲染）。 */
export function closeLobby(): void {
  for (const name of ["Login", "AreaList", "LoginNotice", "Home"]) { ViewMgr.close(name); }
}

/** 通用提示框（多实例，句柄自关）。返回 Promise，resolve(true=确定/false=取消)。 */
export async function openConfirm(opts: Omit<IConfirmOptions, "onYes" | "onNo">): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    void (async () => {
      const h = await ViewMgr.open("Confirm");
      const view = h.view as ConfirmView;
      const logic = new ConfirmLogic({
        ...opts,
        onYes: () => resolve(true),
        onNo: () => resolve(false),
      });
      logic.onClose = () => h.close();
      view.setup(logic);
    })();
  });
}
