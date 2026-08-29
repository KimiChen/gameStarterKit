/**
 * 页面组合根（view/ 内部，Creator 侧验证）——把 ViewMgr（fairygui）+ Logic（纯 TS）+
 * net 依赖 + serverSession 状态 + 导航接线组合起来。业务/入口只调这里的 openXxx。
 *
 * 铁律 10：ViewMgr 静态依赖 fairygui，只在 view/ 内部这样静态 import；对外由 Main 走
 * 动态 import 闭包（`const p = await import("./view/pages")`）调用。
 * 
 * 选服链路：openLogin 时拉 WebPlatform GET /v1/areas 存 serverSession + 默认选中服 →
 * Login 显示当前服 → 选服改 currentServer → HTTP 使用 gameHttpUrl、Colyseus 使用 gameWsUrl。
 */
import { ViewMgr, ViewOpenCancelledError, type ViewHandle } from "./ViewMgr";
import { sys } from "cc";
import type { LoginView } from "./LoginView";
import type { AreaListView } from "./AreaListView";
import type { LoginNoticeView } from "./LoginNoticeView";
import type { HomeView } from "./HomeView";
import type { ConfirmView } from "./ConfirmView";
import { reconcileSessionProfile } from "../logic/page/SessionReconcileLogic";
import {
  joinSelectedServerLobby,
  LoginLogic,
  runAuthenticatedLoginFlow,
} from "../logic/page/LoginLogic";
import { AreaListLogic } from "../logic/page/AreaListLogic";
import { LoginNoticeLogic, noticeDateStamp } from "../logic/page/LoginNoticeLogic";
import type { IConfirmOptions } from "../logic/page/ConfirmLogic";
import { ConfirmLogic } from "../logic/page/ConfirmLogic";
import { initHttp } from "../core/http";
import { devLogin } from "../net/http/account";
import { WebSocketClient } from "../net/WebSocketClient";
import {
  clearSession,
  commitSessionProfile,
  getSessionIdentity,
  getSessionGeneration,
  isSessionIdentityCurrent,
  registerReturnToLogin,
  registerSessionReconciler,
  returnToLogin,
  setSession,
  type ReturnToLoginReason,
  type SessionReconcileIdentity,
} from "../net/session";
import {
  ForceLogoutMessage,
  ForceLogoutReason,
  UserRpc,
  joinErrText,
  type IUserView,
} from "../shared/index";
import { isServerEnterable } from "../logic/areaDirectory";
import { fetchAreaList } from "../net/http/area";
import { fetchNotices } from "../net/http/notice";
import {
  chooseServer,
  getCurrentServer,
  setServerList,
  getServerList,
} from "../net/serverSession";
import type { WebPlatformAreaServer } from "../shared/index";

const NOTICE_DONT_REMIND_DATE_KEY = "game.notice.dont-remind-date";

/** 本地开发登录身份（dev-login 的 devKey：同 key 恒同账号，换号 = 换 key）。
 *  微信侧接入后此处换 wx.login 取 code → wxLogin(code)。 */
const DEV_LOGIN_KEY = "dev_local";

/**
 * Observe a page event action that the FairyGUI dispatcher cannot await.
 * Exported so the headless lifecycle probe can exercise the same boundary used
 * by Login/AreaList navigation handlers.
 */
export function observePageAction(action: () => unknown, label: string): void {
  try {
    const result = action();
    if (result && typeof (result as { then?: unknown }).then === "function") {
      Promise.resolve(result).catch((e) => console.error(`[pages] ${label} rejection`, e));
    }
  } catch (e) {
    console.error(`[pages] ${label} exception`, e);
  }
}

function isOpenCancelled(error: unknown): boolean {
  return error instanceof ViewOpenCancelledError;
}

type EnterBattleHandler = () => void | Promise<void>;

/**
 * Ownership token for one Cocos scene's page composition root.  The token is
 * deliberately opaque to callers; a stale Main instance can only dispose its
 * own scope and cannot tear down a newer scene's listener/root.
 */
interface PageSessionOwner {
  readonly id: symbol;
  readonly controller: AbortController;
  generation: number;
  disposed: boolean;
}

export interface PageSessionScope {
  readonly generation: number;
  isActive(): boolean;
  dispose(): void;
}

/**
 * 登录页及其 authenticated continuation 的一次完整 ownership。Promise 只表示页面打开完成，
 * 不能独自表示 flight 是否仍活动：在 settle 的微任务窗口里，
 * `openLoginInFlight` 可能已经切换到下一代，回登录处理器若只比较 Promise 就会自等或
 * 把旧 Main 的回调带进新页面。这里把身份、失效状态和最新回调绑在同一条记录上。
 */
interface LoginFlight {
  readonly id: number;
  readonly startedSessionGeneration: number;
  readonly owner: PageSessionOwner;
  onEnterBattle: EnterBattleHandler;
  promise: Promise<void>;
  settled: boolean;
  invalidated: boolean;
  reopenTicket: number | null;
  reopenPromise: Promise<void> | null;
}

let sessionWired = false;
let unregisterSessionEvents: (() => void) | null = null;
let wiredSessionOwner: PageSessionOwner | null = null;
// A dynamically imported composition root can outlive its Cocos scene.  Keep
// a local lifecycle generation so an in-flight return-to-login transition from
// the old scene cannot reopen pages or capture callbacks from a new scene.
let pageLifecycleGeneration = 0;
let activePageOwner: PageSessionOwner | null = null;
const scopeOwners = new WeakMap<PageSessionScope, PageSessionOwner>();
let nextLoginFlightId = 0;
let nextTransitionId = 0;
let openLoginInFlight: LoginFlight | null = null;
let latestOnEnterBattle: EnterBattleHandler | null = null;

function isPageOwnerActive(owner: PageSessionOwner, generation = owner.generation): boolean {
  return activePageOwner === owner && !owner.disposed
    && pageLifecycleGeneration === generation && !owner.controller.signal.aborted;
}

/** Lobby 物理连接最终死亡后复用当前 token 重进并刷新权威自档；失败由 session 回退到登录页。 */
async function reconcilePageSession(
  owner: PageSessionOwner,
  wiredPageGeneration: number,
  identity: SessionReconcileIdentity,
): Promise<boolean> {
  if (!isSessionIdentityCurrent(identity)) return true;
  if (!isPageOwnerActive(owner, wiredPageGeneration)) return false;
  const server = getCurrentServer();
  if (!server) return false;

  const result = await reconcileSessionProfile<IUserView>(identity, {
    connect: (captured, control) => {
      WebSocketClient.inst.init(server.gameWsUrl);
      return WebSocketClient.inst.joinOwned(captured.accessToken, { sId: server.serverId }, control);
    },
    getInfo: () => WebSocketClient.inst.rpc(UserRpc.GetInfo, {}),
    isCurrent: (captured) => isPageOwnerActive(owner, wiredPageGeneration)
      && isSessionIdentityCurrent(captured),
    commitProfile: commitSessionProfile,
  }, owner.controller.signal);
  if (!isSessionIdentityCurrent(identity)) return true;
  if (result.status === "stale" || !isPageOwnerActive(owner, wiredPageGeneration)) return false;

  const onEnterBattle = latestOnEnterBattle;
  if (!onEnterBattle) return false;
  const home = await openHome(() => onEnterBattle(), identity.userId, result.user);
  if (!isPageOwnerActive(owner, wiredPageGeneration) || !isSessionIdentityCurrent(identity)) {
    home.close();
    return !isSessionIdentityCurrent(identity);
  }
  return true;
}

/**
 * 在旧登录事务结束后再开新事务。关键约束是：绝不 await `observedFlight.promise` 本身，
 * 而是挂一个一次性的 ticket；其 settle 回调执行时旧 flight 已被清出 active 槽，才可创建
 * 下一代。若期间已有后来 flight，则直接等待后来者，避免重复加载 Login。
 */
function reopenLoginAfterTransition(
  transitionId: number,
  transitionGen: number,
  observedFlight: LoginFlight | null,
  transitionPageGeneration: number,
  transitionOwner: PageSessionOwner,
): Promise<void> {
  if (activePageOwner !== transitionOwner || transitionOwner.disposed) return Promise.resolve();
  if (pageLifecycleGeneration !== transitionPageGeneration) return Promise.resolve();
  if (getSessionGeneration() !== transitionGen) return Promise.resolve();

  const current = openLoginInFlight;
  if (current && current.owner !== transitionOwner) return Promise.resolve();
  if (current && current === observedFlight && !current.settled) {
    if (current.reopenTicket === transitionId && current.reopenPromise) {
      return current.reopenPromise;
    }
    const continueReopen = (): Promise<void> => {
      // 清掉 ticket 后再递归，防止极端同步 then 实现把同一个 Promise 返回给自己。
      if (current.reopenTicket === transitionId) {
        current.reopenTicket = null;
        current.reopenPromise = null;
      }
      return reopenLoginAfterTransition(
        transitionId,
        transitionGen,
        current,
        transitionPageGeneration,
        transitionOwner,
      );
    };
    const scheduled = current.promise.then(continueReopen, continueReopen);
    current.reopenTicket = transitionId;
    current.reopenPromise = scheduled;
    return scheduled;
  }

  // A newer caller may already have started a flight while the confirmation was open.
  // It is safe to await/reuse it because it is not the observed flight that called us.
  if (current && current !== observedFlight && !current.invalidated) return current.promise;
  if (current && current !== observedFlight && current.invalidated && !current.settled) {
    const continueReopen = (): Promise<void> => reopenLoginAfterTransition(
      transitionId,
      transitionGen,
      observedFlight,
      transitionPageGeneration,
      transitionOwner,
    );
    return current.promise.then(continueReopen, continueReopen);
  }
  if (current?.settled && openLoginInFlight === current) openLoginInFlight = null;

  const callback = latestOnEnterBattle ?? observedFlight?.onEnterBattle;
  if (!callback) return Promise.resolve();
  const next = ensureLoginFlight(callback, transitionOwner);
  // Defensive identity check: a transition must never await the exact flight it observed.
  return next === observedFlight ? Promise.resolve() : next.promise;
}

/** 会话事件接线（踢线/掉线 → 清态回登录页），每个页面生命周期只注册一次。 */
function wireSessionEvents(owner: PageSessionOwner): void {
  if (sessionWired && wiredSessionOwner === owner) return;
  if (sessionWired) {
    unregisterSessionEvents?.();
    unregisterSessionEvents = null;
    sessionWired = false;
    wiredSessionOwner = null;
  }
  sessionWired = true;
  wiredSessionOwner = owner;
  const wiredPageGeneration = pageLifecycleGeneration;
  const unregisterReconciler = registerSessionReconciler((identity) =>
    reconcilePageSession(owner, wiredPageGeneration, identity));
  const unregisterReturn = registerReturnToLogin(async (reason: ReturnToLoginReason) => {
    if (activePageOwner !== owner || owner.disposed || pageLifecycleGeneration !== wiredPageGeneration) return;
    // 捕获并标记触发事件时的具体 flight；它可能仍在 fetch/ViewMgr.open 中，不能被处理器
    // 直接 await，否则 openLogin 与回登录 transition 会互相等待。
    const transitionGen = getSessionGeneration();
    const observedFlight = openLoginInFlight;
    if (observedFlight) observedFlight.invalidated = true;
    const transitionId = ++nextTransitionId;

    // session.returnToLogin 已先 clearSession；这里按统一顺序释放大厅、关闭壳、提示，
    // 最后在旧 flight settle 后调度最新 Main 的登录页。所有 await 都在同一个可观察 Promise 内。
    await WebSocketClient.inst.leave().catch(() => {});
    if (activePageOwner !== owner || owner.disposed
      || pageLifecycleGeneration !== wiredPageGeneration || getSessionGeneration() !== transitionGen) return;
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
    if (activePageOwner !== owner || owner.disposed
      || pageLifecycleGeneration !== wiredPageGeneration || getSessionGeneration() !== transitionGen) return;
    await reopenLoginAfterTransition(
      transitionId,
      transitionGen,
      observedFlight,
      wiredPageGeneration,
      owner,
    );
  });
  unregisterSessionEvents = () => {
    unregisterReconciler();
    unregisterReturn();
  };
}

/**
 * Release the page composition root when its Cocos scene is destroyed.
 *
 * The session module intentionally has no View dependency, so pages owns the
 * corresponding unregister handle.  Invalidating the active flight prevents
 * deferred area loads, confirms, and login continuations from touching the
 * next scene; clearing the active pointer lets a later scene create a fresh
 * flight instead of reusing an invalidated one.  The operation is idempotent.
 */
export function disposePageSessionEvents(owner?: PageSessionOwner): void {
  if (owner && activePageOwner !== owner) return;
  const disposedOwner = activePageOwner;
  if (disposedOwner) {
    disposedOwner.disposed = true;
    disposedOwner.controller.abort();
  }
  activePageOwner = null;
  pageLifecycleGeneration++;
  const flight = openLoginInFlight;
  if (flight) {
    flight.invalidated = true;
    flight.reopenTicket = null;
    flight.reopenPromise = null;
  }
  openLoginInFlight = null;
  latestOnEnterBattle = null;
  unregisterSessionEvents?.();
  unregisterSessionEvents = null;
  wiredSessionOwner = null;
  sessionWired = false;
  // ViewMgr owns the actual FGUI leases, including uncached Confirm handles;
  // release them together with this composition root so no promise survives a
  // scene transition.
  try {
    ViewMgr.disposeViewRoot();
  } catch (e) {
    // A host-specific FairyGUI teardown failure must not leave the session
    // owner/listener installed or let an old Main throw from onDestroy.
    console.error("[pages] 页面根释放异常", e);
  }
}

/**
 * Claim page/session ownership for a new Cocos scene. Claiming supersedes the
 * previous scope and invalidates its async transitions before returning.
 */
export function createPageSessionScope(): PageSessionScope {
  disposePageSessionEvents();
  const owner: PageSessionOwner = {
    id: Symbol("page-session"),
    controller: new AbortController(),
    generation: pageLifecycleGeneration,
    disposed: false,
  };
  activePageOwner = owner;
  const scope: PageSessionScope = {
    generation: owner.generation,
    isActive: () => activePageOwner === owner && !owner.disposed
      && pageLifecycleGeneration === owner.generation,
    dispose: () => disposePageSessionEvents(owner),
  };
  scopeOwners.set(scope, owner);
  return scope;
}

function readDontRemindToday(): boolean {
  try {
    return sys.localStorage.getItem(NOTICE_DONT_REMIND_DATE_KEY) === noticeDateStamp(Date.now());
  } catch {
    return false;
  }
}

function writeDontRemindToday(value: boolean): void {
  try {
    if (value) sys.localStorage.setItem(NOTICE_DONT_REMIND_DATE_KEY, noticeDateStamp(Date.now()));
    else sys.localStorage.removeItem(NOTICE_DONT_REMIND_DATE_KEY);
  } catch { /* 存储不可用时不影响公告浏览 */ }
}

function ensurePageOwner(): PageSessionOwner {
  if (activePageOwner && !activePageOwner.disposed) return activePageOwner;
  // Keep the standalone pages API usable in tests/tools that call openLogin
  // without a Cocos Main scope. A later Main scope will supersede this owner.
  const owner: PageSessionOwner = {
    id: Symbol("page-session-implicit"),
    controller: new AbortController(),
    generation: ++pageLifecycleGeneration,
    disposed: false,
  };
  activePageOwner = owner;
  return owner;
}

function isFlightActive(flight: LoginFlight): boolean {
  return !flight.invalidated
    && !flight.owner.disposed
    && activePageOwner === flight.owner
    && pageLifecycleGeneration === flight.owner.generation;
}

/** 创建或复用登录 flight；页面已打开但 Enter continuation 尚活动时也必须复用。 */
function ensureLoginFlight(onEnterBattle: EnterBattleHandler, owner = ensurePageOwner()): LoginFlight {
  latestOnEnterBattle = onEnterBattle;
  const current = openLoginInFlight;
  if (current && !current.invalidated && current.owner === owner) {
    current.onEnterBattle = onEnterBattle;
    return current;
  }
  if (current && current.owner !== owner) {
    // A new scene owner must never reuse an old scene's Login callback/flight.
    current.invalidated = true;
    current.reopenTicket = null;
    current.reopenPromise = null;
    if (openLoginInFlight === current) openLoginInFlight = null;
  }
  if (current?.invalidated && current.settled && openLoginInFlight === current) openLoginInFlight = null;

  const flight: LoginFlight = {
    id: ++nextLoginFlightId,
    startedSessionGeneration: getSessionGeneration(),
    owner,
    onEnterBattle,
    promise: Promise.resolve(),
    settled: false,
    invalidated: false,
    reopenTicket: null,
    reopenPromise: null,
  };
  openLoginInFlight = flight;
  // Register before starting the first await so a transport event cannot race the initial load.
  wireSessionEvents(owner);
  flight.promise = openLoginImpl(flight);
  flight.promise.then(
    () => settleLoginOpen(flight, false),
    () => settleLoginOpen(flight, true),
  );
  return flight;
}

function settleLoginOpen(flight: LoginFlight, failed: boolean): void {
  flight.settled = true;
  if (failed) flight.invalidated = true;
  if (flight.invalidated && openLoginInFlight === flight) openLoginInFlight = null;
}

/** 登录页整段加载只保留一个在途事务；重复调用只更新最新 Main 的战斗回调。 */
export function openLogin(onEnterBattle: EnterBattleHandler, scope?: PageSessionScope): Promise<void> {
  if (scope && !scope.isActive()) return Promise.resolve();
  const owner = scope ? scopeOwners.get(scope) : ensurePageOwner();
  if (!owner || owner.disposed || activePageOwner !== owner) return Promise.resolve();
  return ensureLoginFlight(onEnterBattle, owner).promise;
}

async function openLoginImpl(flight: LoginFlight): Promise<void> {
  // 每次回登录页都从独立 Portal 重拉；setServerList 只在成功后原子替换快照，
  // 这样刷新失败时仍可使用上一份已知目录（并保留当前选服）重试。
  let areaLoadFailed = false;
  try {
    const list = await fetchAreaList();
    if (!isFlightActive(flight)) return;
    setServerList(list);
    const current = getCurrentServer();
    if (current) {
      initHttp(current.gameHttpUrl);
    }
  } catch (e) {
    areaLoadFailed = true;
    console.error("[pages] WebPlatform 区服目录加载失败：", e);
  }

  if (!isFlightActive(flight)) return;

  const h = await ViewMgr.open("Login");
  if (!isFlightActive(flight)) { h.close(); return; }
  const view = h.view as LoginView;
  // ⚠ 登录必须带**所选区**（M12e）：token 只对该区有效。setServerList 已在成功拉取后
  // 原子建立当前选区，后续用户选服也会更新它；⛔ 别图省事传 0。
  const logic = new LoginLogic({ login: (key) => devLogin(key, getCurrentServer()?.serverId ?? 0) });
  let enterInFlight: Promise<void> | null = null;
  await h.run((_openedView, context) => {
    if (!isFlightActive(flight)) { h.close(); return; }
    logic.onProgress = (ratio, text) => {
      if (context.isActive()) view.setProgress(ratio, text);
    };

    view.onEnter = () => {
      if (!isFlightActive(flight) || !context.isActive()) return;
      if (enterInFlight) return enterInFlight;
      const p = (async () => {
        if (!isFlightActive(flight) || !context.isActive()) return;
        // Portal 首次不可达时，用户点「进入游戏」即显式重试目录；仍失败则给出可重试提示。
        if (areaLoadFailed) {
          try {
            const list = await fetchAreaList();
            if (!isFlightActive(flight) || !context.isActive()) return;
            setServerList(list);
            const current = getCurrentServer();
            if (current) {
              initHttp(current.gameHttpUrl);
              view.showCurrentServer(current);
            }
            areaLoadFailed = false;
          } catch (e) {
            if (!isFlightActive(flight) || !context.isActive()) return;
            console.error("[pages] WebPlatform 区服目录重试失败：", e);
            await openConfirm({ title: "连接失败", content: "账号服务暂不可用，请稍后重试", noText: null });
            return;
          }
        }
        if (!isFlightActive(flight) || !context.isActive()) return;
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
        if (!isFlightActive(flight) || !context.isActive()) return;
        // 真实链路：dev-login（本地身份）→ 会话入 session → join 大厅房 → 拉真实档案。
        // continuation 由 LoginLogic 的整段 flow 锁保护，重复点击不会在 HTTP 完成后再开一套 Lobby。
        let user: IUserView | null = null;
        let flowFailed = false;
        let flowSessionGen = -1;
        const r = await logic.doLoginFlow(DEV_LOGIN_KEY, async (response) => {
          if (!isFlightActive(flight) || !context.isActive()) { flowFailed = true; return; }
          try {
            user = await runAuthenticatedLoginFlow(response, {
              setSession: (next) => {
                setSession(next);
                flowSessionGen = getSessionGeneration();
              },
              join: async (accessToken, signal) => {
                logic.onProgress(0.6, "正在进入大厅…");
                // 同一份目录快照同时提供 endpoint 与 sId，不能跨 await 混入后续选服结果。
                await joinSelectedServerLobby(cur, accessToken, {
                  init: (endpoint) => WebSocketClient.inst.init(endpoint),
                  // WebPlatform 的 serverId 在 Colyseus join 边界显式转换为 sId。
                  join: (token, options, joinSignal) =>
                    WebSocketClient.inst.join(token, options, joinSignal),
                }, signal);
                if (!isFlightActive(flight) || !context.isActive()
                  || getSessionGeneration() !== flowSessionGen) {
                  throw new Error("登录事务已失效");
                }
              },
              getInfo: async () => {
                logic.onProgress(0.85, "正在加载角色…");
                const info = await WebSocketClient.inst.rpc(UserRpc.GetInfo, {});
                if (!isFlightActive(flight) || !context.isActive()
                  || getSessionGeneration() !== flowSessionGen) {
                  throw new Error("登录事务已失效");
                }
                return info;
              },
              commitProfile: (next) => {
                const identity = getSessionIdentity();
                return identity !== null && identity.generation === flowSessionGen
                  && commitSessionProfile(identity, next);
              },
              clearSession,
              leave: () => WebSocketClient.inst.leave(),
              shouldRollback: () => isFlightActive(flight) && context.isActive()
                && (flowSessionGen < 0 || getSessionGeneration() === flowSessionGen),
            }, context.signal);
          } catch (e) {
            if (!isFlightActive(flight) || !context.isActive()) { flowFailed = true; return; }
            // 大厅/档案失败即整体失败（严谨：不带半截会话进主界面）；清态可重试
            // 业务码走 message（服务端 joinRefused）：用 shared 单源解码器取文案，⛔ 别把 "3004" 甩给玩家
            console.error("[pages] 进入大厅失败：", e);
            const why = joinErrText((e as Error)?.message, "进入大厅失败，请重试");
            if (!isFlightActive(flight) || !context.isActive()) { flowFailed = true; return; }
            logic.onProgress(0, why);
            flowFailed = true;
          }
        });
        if (!isFlightActive(flight) || !context.isActive() || !r || flowFailed || getSessionGeneration() !== flowSessionGen) return;
        logic.onProgress(1, "登录成功");
        h.close();
        // Closing Login synchronously invalidates its lifecycle context.  From
        // this point the page flight and session generation own the navigation;
        // consulting the closed context would make Home unreachable.
        if (!isFlightActive(flight) || getSessionGeneration() !== flowSessionGen) return;
        let homeHandle: ViewHandle;
        try {
          homeHandle = await openHome(() => flight.onEnterBattle(), r.userId, user);
        } catch (e) {
          if (!isFlightActive(flight) || getSessionGeneration() !== flowSessionGen) return;
          console.error("[pages] Home 打开失败，回滚登录事务：", e);
          await returnToLogin({ kind: "BATTLE_JOIN_FAILED" });
          return;
        }
        // Home 的动态加载也有 await；期间若收到失效事件，handler 会关闭大厅并重开
        // Login。这里再核对一次，避免迟到的 Home 把新登录页覆盖回来。
        if (!isFlightActive(flight) || getSessionGeneration() !== flowSessionGen) homeHandle.close();
      })();
      enterInFlight = p;
      p.then(
        () => { if (enterInFlight === p) enterInFlight = null; },
        () => { if (enterInFlight === p) enterInFlight = null; },
      );
      return p;
    };
    view.onNotice = () => { observePageAction(() => openNotice(), "openNotice"); };
    view.onSelectServer = () => {
      observePageAction(() => openAreaList((s) => view.showCurrentServer(s)), "openAreaList");
    };

    view.setup();
    view.showCurrentServer(getCurrentServer());
    });
  if (!isFlightActive(flight)) h.close();
}

/** 主界面：展示真实账号/档案摘要，「进入游戏」→ ballMove。 */
export async function openHome(
  onEnterBattle: () => void | Promise<void>, userId = "", user: IUserView | null = null,
): Promise<ViewHandle> {
  const h = await ViewMgr.open("Home");
  const view = h.view as HomeView;
  await h.run((_openedView, context) => {
    view.onEnterBattle = () => {
      if (!context.isActive()) return;
      return onEnterBattle();
    };
    const cur = getCurrentServer();
    const who = userId || "未登录";
    const summary = user ? ` · 体力 ${user.stamina} · ${user.wins}胜${user.losses}负` : "";
    view.setup(`${cur ? `${cur.name} · ` : ""}${who}${summary}`);
  });
  return h;
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
  try {
    await h.run(async (_openedView, context) => {
      logic.onChoose = (server) => {
        if (!context.isActive()) return;
        chooseServer(server);       // 区服=实例：记住选中服，进入游戏时连它
        initHttp(server.gameHttpUrl);
        try { onChosen?.(server); }  // 刷新登录页 btn_server
        finally { h.close(); }
      };
      view.onClose = () => h.close();  // 右上角关闭：不选服直接关面板
      view.setup(logic);
      await logic.start(context.signal);
    });
  } catch (e) {
    if (isOpenCancelled(e)) return;
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
  try {
    await h.run(async (_openedView, context) => {
      view.onClose = () => h.close();
      view.setup(logic);
      await logic.start(context.signal);
    });
  } catch (e) {
    if (isOpenCancelled(e)) return;
    console.error("[pages] 公告加载失败：", e);
    h.close();
    await openConfirm({ title: "连接失败", content: "公告加载失败，请稍后重试", noText: null });
  }
}

/** 关闭全部大厅壳页面（进入 ballMove 前调用，让出 GL 画布给玩法渲染）。 */
export function closeLobby(): void {
  for (const name of ["Login", "AreaList", "LoginNotice", "Home"]) { ViewMgr.close(name); }
}

/** 通用提示框（多实例，句柄自关）。返回 Promise，resolve(true=确定/false=取消)。 */
export async function openConfirm(opts: Omit<IConfirmOptions, "onYes" | "onNo">): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let handle: ViewHandle | null = null;
    let settled = false;
    let removeAbortListener: (() => void) | null = null;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      removeAbortListener?.();
      removeAbortListener = null;
      resolve(value);
    };
    const task = (async () => {
      handle = await ViewMgr.open("Confirm");
      const h = handle;
      // An abort can come from a scene/root teardown before the caller sees the
      // handle.  Always close through the handle so the interactive lease is
      // returned even when no button callback ran.
      const onAbort = () => { h.close(); finish(false); };
      if (h.signal.aborted) { h.close(); finish(false); return; }
      h.signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => h.signal.removeEventListener("abort", onAbort);
      const view = h.view as ConfirmView;
      await h.run((_openedView, _context) => {
        const logic = new ConfirmLogic({
          ...opts,
          onYes: () => finish(true),
          onNo: () => finish(false),
        });
        logic.onClose = () => h.close();
        view.setup(logic);
      });
    })();
    void task.catch((e: unknown) => {
      // ⚠ **必须兜住并 resolve**：这个 detached task 可能因 FGUI 包/组件/ setup 失败而 reject。
      //   句柄一旦已创建，先走统一 close 回滚 interactive 租约，再按取消处理，避免调用方永久悬挂。
      handle?.close();
      console.error("[pages] 提示框打开失败，按取消处理", e);
      finish(false);
    });
  });
}
