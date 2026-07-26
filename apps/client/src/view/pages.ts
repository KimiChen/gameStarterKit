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
import { getBaseUrl, getToken } from "../core/http";
import { devLogin } from "../net/http/account";
import { WebSocketClient } from "../net/WebSocketClient";
import { clearSession, onAuthInvalid, onBattleLost, onConnLost, setSession } from "../net/session";
import { ForceLogoutMessage, ForceLogoutReason, UserRpc, isServerEnterable, joinErrText, type IUserView } from "../shared/index";
import { fetchAreaList } from "../net/http/area";
import { fetchNotices } from "../net/http/notice";
import { chooseServer, getCurrentServer, pickDefaultServer, setServerList, getServerList } from "../net/serverSession";
import type { IAreaServer } from "../shared/index";

const NOTICE_DONT_REMIND_DATE_KEY = "game.notice.dont-remind-date";

/** 本地开发登录身份（dev-login 的 devKey：同 key 恒同账号，换号 = 换 key）。
 *  微信侧接入后此处换 wx.login 取 code → wxLogin(code)。 */
const DEV_LOGIN_KEY = "dev_local";

/** 会话事件接线（踢线/掉线 → 清态回登录页）。整个应用生命周期一次。 */
let sessionWired = false;
function wireSessionEvents(reopenLogin: () => void): void {
  if (sessionWired) return;
  sessionWired = true;
  onAuthInvalid((reason) => {
    void (async () => {
      await WebSocketClient.inst.leave().catch(() => {});
      closeLobby();
      // 强制下线（服务端主动踢）文案走 shared 单源 ForceLogoutMessage；其余为 token 失效类
      const text = reason === "FORCE_BANNED" ? ForceLogoutMessage[ForceLogoutReason.Banned]
        : reason === "FORCE_REPLACED" ? ForceLogoutMessage[ForceLogoutReason.Replaced]
        : reason === "FORCE_REVOKED" ? ForceLogoutMessage[ForceLogoutReason.Revoked]
        : reason === "ACCOUNT_BANNED" ? ForceLogoutMessage[ForceLogoutReason.Banned]
        : "登录已过期，请重新登录";
      await openConfirm({ title: "提示", content: text, noText: null });
      reopenLogin();
    })();
  });
  // 战斗连接最终死亡：战斗态已由 Main 回滚（订阅序在前），此处只管提示 + 导航。
  // ⚠ **必须先退大厅房**：战斗房死掉不影响大厅房，而 `closeLobby()` 只关 FGUI 面板、从不 leave；
  // 若不退，回登录页后重登会拿到**新 token** → `WebSocketClient.join` 撞上"已用其他 token 在线"
  // 而抛错（换号必须先 leave），玩家再也进不去。authInvalid 那条早就这么做了，此处对齐。
  onBattleLost(() => {
    void (async () => {
      await WebSocketClient.inst.leave().catch(() => {});
      closeLobby();
      await openConfirm({ title: "战斗已结束", content: "与对局的连接已断开", noText: null });
      reopenLogin();
    })();
  });
  onConnLost(() => {
    void (async () => {
      // 登录态未失效（非鉴权死亡）：提示后回登录页，用户可原路重进。
      // ⚠ 战斗态的回滚由 Main 的 onConnLost 负责（订阅序在前），此处只管提示 + 导航。
      // ⚠ 这句 leave() **在今天是空操作**，⛔ 别把它当成"和另两条一样必要"：`notifyConnLost` 的
      //   唯一产地是 WebSocketClient 的 `room.onLeave`，而那里在通知之前**已经**把 `this.room`
      //   与 `joinedToken` 清干净了（WebSocketClient.ts:188-190）⇒ `leave()` 撞 `if (!room) return`
      //   直接返回。authInvalid/battleLost 两条不同：那两条触发时大厅连接**确实还活着**，必须退。
      //   保留它纯属防御——万一将来 connLost 多出一个"房还活着就通知"的产地，这里不至于漏。
      //   ⚠ 收敛成单一出口见 todo.md「D6」；重构时请按这里的事实判断，⛔ 别照抄成"四条都必须 leave"。
      await WebSocketClient.inst.leave().catch(() => {});
      closeLobby();
      await openConfirm({ title: "连接断开", content: "与服务器的连接已断开，请重新进入", noText: null });
      reopenLogin();
    })();
  });
}

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

  wireSessionEvents(() => { void openLogin(onEnterBattle); });

  const h = await ViewMgr.open("Login");
  const view = h.view as LoginView;
  const logic = new LoginLogic({ login: (key) => devLogin(key) });
  logic.onProgress = (ratio, text) => view.setProgress(ratio, text);

  view.onEnter = async () => {
    const cur = getCurrentServer();
    // 进服闸（判定单源 isServerEnterable，对齐原项目 waitLogin）：无服 / 不可进（维护 or 未开服）
    // 且非运维模式不进。isOps 是部署环境级开关（服务端 AREA_IS_OPS），豁免覆盖两种不可进态——
    // 维护服重开前与新服开服前的验证是同一运维形态。⛔ 此闸只是 UX，真闸在服务端准入层。
    if (!cur) { await openConfirm({ title: "提示", content: "暂无可用区服", noText: null }); return; }
    if (!isServerEnterable(cur) && (getServerList()?.isOps ?? 0) <= 0) {
      const unopened = cur.openTime === 0 && cur.t !== 9;
      await openConfirm({
        title: unopened ? "未开服" : "维护中",
        content: unopened ? "该区服尚未开放，敬请期待" : "区服维护中，请稍候再试",
        noText: null,
      });
      return;
    }
    // 真实链路：dev-login（本地身份）→ 会话入 session → join 大厅房 → 拉真实档案
    const r = await logic.doLogin(DEV_LOGIN_KEY);
    if (!r) return; // 进度条已显示失败文案，可重点
    setSession(r);
    let user: IUserView | null = null;
    try {
      logic.onProgress(0.6, "正在进入大厅…");
      WebSocketClient.inst.init(getBaseUrl());
      // 区服形态：透传所选区 sId，令大厅 RPC/建角与战斗房落同一区（否则大厅落 s0、战斗落所选区，档案串区）。
      await WebSocketClient.inst.join(r.token, { sId: cur.sId });
      logic.onProgress(0.85, "正在加载角色…");
      user = (await WebSocketClient.inst.rpc(UserRpc.GetInfo, {})).user;
    } catch (e) {
      // 大厅/档案失败即整体失败（严谨：不带半截会话进主界面）；清态可重试
      // 业务码走 message（服务端 joinRefused）：用 shared 单源解码器取文案，⛔ 别把 "3004" 甩给玩家
      console.error("[pages] 进入大厅失败：", e);
      const why = joinErrText((e as Error)?.message, "进入大厅失败，请重试");
      clearSession();
      await WebSocketClient.inst.leave().catch(() => {});
      logic.onProgress(0, why);
      return;
    }
    logic.onProgress(1, "登录成功");
    h.close();
    await openHome(onEnterBattle, r.userId, user);
  };
  view.onNotice = () => { void openNotice(); };
  view.onSelectServer = () => { void openAreaList((s) => view.showCurrentServer(s)); };

  view.setup();
  view.showCurrentServer(getCurrentServer());
}

/** 主界面：展示真实账号/档案摘要，「进入游戏」→ ballMove（onEnterBattle 由 Main 注入，连 currentServer.wsUrl）。 */
export async function openHome(onEnterBattle: () => void, userId = "", user: IUserView | null = null): Promise<void> {
  const h = await ViewMgr.open("Home");
  const view = h.view as HomeView;
  view.onEnterBattle = onEnterBattle;
  const cur = getCurrentServer();
  const who = userId || "未登录";
  const summary = user ? ` · 体力 ${user.stamina} · ${user.wins}胜${user.losses}负` : "";
  view.setup(`${cur ? `${cur.name} · ` : ""}${who}${summary}`);
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
