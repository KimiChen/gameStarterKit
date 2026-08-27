/**
 * 页面组合根（view/ 内部，Creator 侧验证）——把 ViewMgr（fairygui）+ Logic（纯 TS）+
 * net 依赖 + serverSession 状态 + 导航接线组合起来。业务/入口只调这里的 openXxx。
 *
 * 铁律 10：ViewMgr 静态依赖 fairygui，只在 view/ 内部这样静态 import；对外由 Main 走
 * 动态 import 闭包（`const p = await import("./view/pages")`）调用。
 *
 * 选服链路：openLogin 时拉 WebPlatform GET /v1/areas 存 serverSession + 默认选中服 →
 * Login 显示当前服 → 选服改 currentServer → 游戏连接使用 currentServer.gameHttpUrl。
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
import { initHttp } from "../core/http";
import { devLogin } from "../net/http/account";
import { WebSocketClient } from "../net/WebSocketClient";
import {
  clearSession,
  getSessionGeneration,
  registerReturnToLogin,
  setSession,
  type ReturnToLoginReason,
} from "../net/session";
import { ForceLogoutMessage, ForceLogoutReason, UserRpc, joinErrText, type IUserView } from "../shared/index";
import { isServerEnterable } from "../logic/areaDirectory";
import { fetchAreaList } from "../net/http/area";
import { fetchNotices } from "../net/http/notice";
import {
  chooseServer,
  getCurrentServer,
  pickDefaultServer,
  setServerList,
  getServerList,
} from "../net/serverSession";
import type { WebPlatformAreaServer } from "../shared/index";

const NOTICE_DONT_REMIND_DATE_KEY = "game.notice.dont-remind-date";

/** 本地开发登录身份（dev-login 的 devKey：同 key 恒同账号，换号 = 换 key）。
 *  微信侧接入后此处换 wx.login 取 code → wxLogin(code)。 */
const DEV_LOGIN_KEY = "dev_local";

/** 会话事件接线（踢线/掉线 → 清态回登录页）。整个应用生命周期一次。
 *
 * ⚠ **只接一次是对的**（重复接会让一次事件弹多个框），但**捕获的回调必须可更新**：
 *   `reopenLogin` 闭包里带着 `onEnterBattle`，而后者绑在**某一个 Main 实例**上。此前把它
 *   直接闭进 handler ⇒ 场景重载/换 Main 后，掉线回登录页走的仍是**第一个 Main** 的
 *   `enterBattle`，点「进入游戏」驱动的是早已销毁的渲染层/ECS（且旧 Main 因此永不回收）。
 *   故存进 `currentReopenLogin`，每次 `openLogin` 覆盖，handler 只在**触发时**读它。 */
let sessionWired = false;
let currentReopenLogin: () => Promise<void> | void = () => {};
function wireSessionEvents(reopenLogin: () => Promise<void> | void): void {
  currentReopenLogin = reopenLogin; // ⚠ 每次都刷新（⛔ 不放在 sessionWired 早退之后）
  if (sessionWired) return;
  sessionWired = true;
  registerReturnToLogin(async (reason: ReturnToLoginReason) => {
    // session.returnToLogin 已先 clearSession；这里按统一顺序释放大厅、关闭壳、提示，
    // 最后读取最新 Main 的 reopen 回调。所有 await 都在同一个可观察 Promise 内。
    const transitionGen = getSessionGeneration();
    await WebSocketClient.inst.leave().catch(() => {});
    if (getSessionGeneration() !== transitionGen) return;
    closeLobby();
    let title = "提示";
    let content = "登录已过期，请重新登录";
    if (reason.kind === "AUTH_INVALID") {
      const auth = reason.reason;
      content = auth === "FORCE_BANNED" ? ForceLogoutMessage[ForceLogoutReason.Banned]
        : auth === "FORCE_REPLACED" ? ForceLogoutMessage[ForceLogoutReason.Replaced]
        : auth === "FORCE_REVOKED" ? ForceLogoutMessage[ForceLogoutReason.Revoked]
        : auth === "ACCOUNT_BANNED" ? ForceLogoutMessage[ForceLogoutReason.Banned]
        : "登录已过期，请重新登录";
    } else if (reason.kind === "BATTLE_LOST") {
      title = "战斗已结束";
      content = "与对局的连接已断开";
    } else if (reason.kind === "CONN_LOST") {
      title = "连接断开";
      content = "与服务器的连接已断开，请重新进入";
    } else if (reason.kind === "BATTLE_JOIN_FAILED") {
      title = "进入失败";
      content = "进入对局失败，请重试";
    }
    await openConfirm({ title, content, noText: null });
    if (getSessionGeneration() !== transitionGen) return;
    const reopen = currentReopenLogin();
    // 失效事件可能正好发生在当前 openLogin 事务内；等待自身会形成死锁，当前事务
    // 已经持有 Login 句柄时直接复用即可。
    if (reopen && reopen !== openLoginInFlight) await reopen;
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
let openLoginInFlight: Promise<void> | null = null;

/** 登录页整段加载只保留一个在途事务；失效事件再次触发时会复用同一 Promise。 */
export function openLogin(onEnterBattle: () => void): Promise<void> {
  if (openLoginInFlight) return openLoginInFlight;
  const p = openLoginImpl(onEnterBattle);
  openLoginInFlight = p;
  p.then(
    () => { if (openLoginInFlight === p) openLoginInFlight = null; },
    () => { if (openLoginInFlight === p) openLoginInFlight = null; },
  );
  return p;
}

async function openLoginImpl(onEnterBattle: () => void): Promise<void> {
  // 每次回登录页都从独立 Portal 重拉；setServerList 只在成功后原子替换快照，
  // 这样刷新失败时仍可使用上一份已知目录（并保留当前选服）重试。
  let areaLoadFailed = false;
  try {
    const list = await fetchAreaList();
    setServerList(list);
    const def = pickDefaultServer(list);
    if (def) {
      chooseServer(def);
      initHttp(def.gameHttpUrl);
    }
  } catch (e) {
    areaLoadFailed = true;
    console.error("[pages] WebPlatform 区服目录加载失败：", e);
  }

  wireSessionEvents(() => openLogin(onEnterBattle));

  const h = await ViewMgr.open("Login");
  const view = h.view as LoginView;
  // ⚠ 登录必须带**所选区**（M12e）：token 只对该区有效。`chooseServer` 已在本函数上方执行过，
  // 故这里 `getCurrentServer()` 拿得到；⛔ 别图省事传 0——那会签出一个进不了所选区的 token。
  const logic = new LoginLogic({ login: (key) => devLogin(key, getCurrentServer()?.serverId ?? 0) });
  logic.onProgress = (ratio, text) => view.setProgress(ratio, text);

  let enterInFlight: Promise<void> | null = null;
  view.onEnter = () => {
    if (enterInFlight) return enterInFlight;
    const p = (async () => {
    // Portal 首次不可达时，用户点「进入游戏」即显式重试目录；仍失败则给出可重试提示。
    if (areaLoadFailed) {
      try {
        const list = await fetchAreaList();
        setServerList(list);
        const def = pickDefaultServer(list);
        if (def) {
          chooseServer(def);
          initHttp(def.gameHttpUrl);
          view.showCurrentServer(def);
        }
        areaLoadFailed = false;
      } catch (e) {
        console.error("[pages] WebPlatform 区服目录重试失败：", e);
        await openConfirm({ title: "连接失败", content: "账号服务暂不可用，请稍后重试", noText: null });
        return;
      }
    }
    const cur = getCurrentServer();
    // 进服闸（判定单源 isServerEnterable，对齐原项目 waitLogin）：无服 / 不可进（维护 or 未开服）
    // 且非运维模式不进。isOps 是部署环境级开关（服务端 AREA_IS_OPS），豁免覆盖两种不可进态——
    // 维护服重开前与新服开服前的验证是同一运维形态。⛔ 此闸只是 UX，真闸在服务端准入层。
    if (!cur) { await openConfirm({ title: "提示", content: "暂无可用区服", noText: null }); return; }
    if (!isServerEnterable(cur) && !(getServerList()?.isOps ?? false)) {
      const unopened = cur.openTime === 0 && cur.status !== "maintenance";
      await openConfirm({
        title: unopened ? "未开服" : "维护中",
        content: unopened ? "该区服尚未开放，敬请期待" : "区服维护中，请稍候再试",
        noText: null,
      });
      return;
    }
    // 真实链路：dev-login（本地身份）→ 会话入 session → join 大厅房 → 拉真实档案。
    // continuation 由 LoginLogic 的整段 flow 锁保护，重复点击不会在 HTTP 完成后再开一套 Lobby。
    let user: IUserView | null = null;
    let flowFailed = false;
    let flowSessionGen = -1;
    const r = await logic.doLoginFlow(DEV_LOGIN_KEY, async (response) => {
      setSession(response);
      flowSessionGen = getSessionGeneration();
      try {
        logic.onProgress(0.6, "正在进入大厅…");
        // 区服 = 独立实例：直接使用目录明确给出的 gameHttpUrl，不再从 WS URL 猜 HTTP 地址。
        WebSocketClient.inst.init(cur.gameHttpUrl);
        // WebPlatform 契约叫 serverId；游戏服现有 Colyseus join option 仍叫 sId，在边界显式转换。
        await WebSocketClient.inst.join(response.accessToken, { sId: cur.serverId });
        if (getSessionGeneration() !== flowSessionGen) { flowFailed = true; return; }
        logic.onProgress(0.85, "正在加载角色…");
        user = (await WebSocketClient.inst.rpc(UserRpc.GetInfo, {})).user;
        if (getSessionGeneration() !== flowSessionGen) { flowFailed = true; return; }
      } catch (e) {
        // 大厅/档案失败即整体失败（严谨：不带半截会话进主界面）；清态可重试
        // 业务码走 message（服务端 joinRefused）：用 shared 单源解码器取文案，⛔ 别把 "3004" 甩给玩家
        console.error("[pages] 进入大厅失败：", e);
        const why = joinErrText((e as Error)?.message, "进入大厅失败，请重试");
        clearSession();
        await WebSocketClient.inst.leave().catch(() => {});
        logic.onProgress(0, why);
        flowFailed = true;
      }
    });
    if (!r || flowFailed || getSessionGeneration() !== flowSessionGen) return; // 进度条已显示失败文案，可重点
    logic.onProgress(1, "登录成功");
    h.close();
    await openHome(onEnterBattle, r.userId, user);
    // Home 的动态加载也有 await；期间若收到失效事件，handler 会关闭大厅并重开
    // Login。这里再核对一次，避免迟到的 Home 把新登录页覆盖回来。
    if (getSessionGeneration() !== flowSessionGen) ViewMgr.close("Home");
    })();
    enterInFlight = p;
    p.then(
      () => { if (enterInFlight === p) enterInFlight = null; },
      () => { if (enterInFlight === p) enterInFlight = null; },
    );
    return p;
  };
  view.onNotice = () => { void openNotice(); };
  view.onSelectServer = () => { void openAreaList((s) => view.showCurrentServer(s)); };

  view.setup();
  view.showCurrentServer(getCurrentServer());
}

/** 主界面：展示真实账号/档案摘要，「进入游戏」→ ballMove（使用 currentServer.gameHttpUrl）。 */
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
export async function openAreaList(onChosen?: (server: WebPlatformAreaServer) => void): Promise<void> {
  const h = await ViewMgr.open("AreaList");
  const view = h.view as AreaListView;
  // 选服页与登录页共用同一份目录快照：只有 HTTP 成功才写入，失败不抹掉旧拓扑。
  const logic = new AreaListLogic({
    fetchAreaList: async () => {
      const list = await fetchAreaList();
      setServerList(list);
      return list;
    },
  });
  logic.onChoose = (server) => {
    chooseServer(server);       // 区服=实例：记住选中服，进入游戏时连它
    initHttp(server.gameHttpUrl);
    onChosen?.(server);         // 刷新登录页 btn_server
    h.close();
  };
  view.onClose = () => h.close();  // 右上角关闭：不选服直接关面板
  view.setup(logic);
  try {
    await logic.start();
  } catch (e) {
    console.error("[pages] WebPlatform 区服目录加载失败：", e);
    h.close();
    await openConfirm({ title: "连接失败", content: "区服列表加载失败，请稍后重试", noText: null });
  }
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
    })().catch((e: unknown) => {
      // ⚠ **必须兜住并 resolve**：这个 async IIFE 是 detached 的，`ViewMgr.open("Confirm")` 会抛
      //   （FGUI 包未加载/扩展没挂）。⛔ 不兜的话 resolve **永远不会被调用** ⇒ 调用方 `await
      //   openConfirm(...)` **永久悬挂**：本文件里它的调用点全在「掉线/被踢 → 提示后回登录页」
      //   的链路上 ⇒ 弹不出框就连登录页也回不去，玩家卡死在黑屏，且只有一条 unhandled rejection。
      //   resolve(false) = 按「取消」处理：⛔ 宁可当用户没确认，也不能把整条导航链挂死。
      console.error("[pages] 提示框打开失败，按取消处理", e);
      resolve(false);
    });
  });
}
