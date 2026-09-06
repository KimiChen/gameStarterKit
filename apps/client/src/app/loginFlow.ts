/**
 * 登录/大厅页面流的组合根（Non-intrusive §7.2 阶段 5b）——原 view/pages.ts 的全部
 * 模块级状态机（LoginFlight / PageSessionOwner / reopenLoginAfterTransition /
 * openLoginImpl / reconcilePageSession）**逐字迁入**本模块，只改归属与接线：
 *  - 页面打开经 NavigationService（route ownership handle），⛔ 不再静态 import
 *    ViewMgr/fairygui（铁律 10 的动态 import 边界在 NavigationService 内部）；
 *  - page lifecycle generation 由 app generation（app/appGeneration）取代，语义
 *    逐字继承（与 session generation 分开校验，二者不可互推）；
 *  - return-to-login transition 的固定次序与文案映射归 SessionCoordinator
 *    （attachSessionNavigator 是 registerReturnToLogin/registerSessionReconciler 的
 *    唯一注册方，§7.2 (a)）；transition 尾部 reopen 算法仍在本模块（逐字保留）；
 *  - 登录恢复不再固定打开 Home：reconcilePageSession 走
 *    appNavigation.restoreAuthenticatedBase()（当前恢复 base 栈顶，行为等价）；
 *  - Lobby 最终断线对账的 GetInfo 与回前台的 profile 刷新经 RefreshCoordinator
 *    合流（flight key = app gen + base route 槽位 + session gen + connection epoch）。
 *
 * view/pages.ts 保留为零状态纯转发 façade（既有 import 面不断）。
 *
 * cc 值导入允许清单：本文件与 Main.ts / CocosLifecycleBridge.ts 同列（仅
 * `sys.localStorage`，公告「今日不再提醒」的存取；⛔ 不得扩散到其它 app/ 模块）。
 *
 * 选服链路：openLogin 时拉 WebPlatform GET /v1/areas 存 serverSession + 默认选中服 →
 * Login 显示当前服 → 选服改 currentServer → HTTP 使用 gameHttpUrl、Colyseus 使用 gameWsUrl。
 */
import { sys } from "cc";
import type { LoginView } from "../view/LoginView";
import type { AreaListView } from "../view/AreaListView";
import type { LoginNoticeView } from "../view/LoginNoticeView";
import type { HomeView } from "../view/HomeView";
import type { PromoHomeView } from "../view/PromoHomeView";
import type { EntryGroupView } from "../view/EntryGroupView";
import type { SettingsView } from "../view/SettingsView";
import type { ConfirmView } from "../view/ConfirmView";
import { PromoHomeLogic } from "../logic/page/PromoHomeLogic";
import {
  EntryGroupLogic,
  clearGroupReturn,
  rememberGroupReturn,
  takeGroupReturn,
} from "../logic/page/EntryGroupLogic";
import { SettingsLogic, type SettingsProfilePatch } from "../logic/page/SettingsLogic";
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
  attachSessionNavigator,
  clearSession,
  commitSessionProfile,
  getSessionIdentity,
  getSessionGeneration,
  getSessionProfile,
  isSessionIdentityCurrent,
  returnToLogin,
  setSession,
  type SessionReconcileIdentity,
} from "./SessionCoordinator";
import {
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
import { currentAppGeneration, nextAppGeneration } from "./appGeneration";
import { APP_PLUGINS, type PluginLaunchTarget } from "./builtinPlugin";
import { PluginRegistry } from "./PluginRegistry";
import type { HomeMenuEntryModel } from "../logic/page/HomeLogic";
import { NavigationService, type NavRouteHandle } from "./NavigationService";
import { RefreshCoordinator, type RefreshFlightKey } from "./RefreshCoordinator";

const NOTICE_DONT_REMIND_DATE_KEY = "game.notice.dont-remind-date";

/** 本地开发登录身份（dev-login 的 devKey：同 key 恒同账号，换号 = 换 key）。
 *  微信侧接入后此处换 wx.login 取 code → wxLogin(code)。 */
const DEV_LOGIN_KEY = "dev_local";

/** 应用级不可变 plugin/route 目录（codegen:plugins 生成的 descriptor 单源）。 */
export const appPluginRegistry = new PluginRegistry(APP_PLUGINS);

/** 应用级导航单例：唯一业务 route stack 所有者（AppRuntime 与本模块共用）。 */
export const appNavigation = new NavigationService(appPluginRegistry);

/**
 * §7.4：Home 菜单的运行时接线面。AppRuntime 注册（launch 走 LaunchPort、可用性查
 * PluginHost）；无宿主（无头 pages 测试/工具路径）时入口回退 flight 的
 * onEnterBattle 回调且恒可用。
 */
export interface HomeMenuRuntime {
  launch(target: PluginLaunchTarget): Promise<void>;
  /** PluginHost 运行时可用性（catalog 之外的可变叠加层；built-in 恒 available）。 */
  availabilityOf(pluginId: string): "available" | "failed" | "disabled";
}

let homeMenuRuntime: HomeMenuRuntime | null = null;

/** 注册当前宿主的菜单接线；返回身份守卫的注销器（旧宿主注销不影响新宿主）。 */
export function setHomeMenuRuntime(runtime: HomeMenuRuntime): () => void {
  homeMenuRuntime = runtime;
  return () => {
    if (homeMenuRuntime === runtime) homeMenuRuntime = null;
  };
}

/**
 * 设置面板的**写路径**接线面：宿主接 `ports.lobbyRpc.sendIdempotent(user.updateProfile)`
 * ——幂等 clientReqId 与 PendingOperationJournal 的 write-ahead 都在那条通道里（§7.2
 * 约束 1），⛔ 本模块不自己拼 rpcIdem。无宿主（无头 pages 测试/工具路径）时写路径不可用，
 * 由 SettingsLogic 走它的失败回滚分支。
 */
export interface ProfileWriteRuntime {
  updateProfile(patch: SettingsProfilePatch): Promise<void>;
}

let profileWriteRuntime: ProfileWriteRuntime | null = null;

/** 注册当前宿主的档案写接线；返回身份守卫的注销器（与菜单接线同形）。 */
export function setProfileWriteRuntime(runtime: ProfileWriteRuntime): () => void {
  profileWriteRuntime = runtime;
  return () => {
    if (profileWriteRuntime === runtime) profileWriteRuntime = null;
  };
}

/**
 * 设置面板的音频偏好写：幂等写成功后，把**刚被服务端接受的那两个字段**回写进会话快照，
 * 这样重开面板不会显示回旧值。⛔ 不猜测其它字段（`ver` 由下一次 GetInfo 权威刷新）；
 * 世代已换时 commitSessionProfile 自己会拒绝。
 */
async function writeProfilePreferences(patch: SettingsProfilePatch): Promise<void> {
  const runtime = profileWriteRuntime;
  if (!runtime) throw new Error("[pages] 档案写路径未接线（无宿主）");
  const identity = getSessionIdentity();
  await runtime.updateProfile(patch);
  const profile = getSessionProfile();
  if (identity && profile) commitSessionProfile(identity, { ...profile, ...patch });
}

/** authenticated base 的刷新合流器（对账 GetInfo 与回前台刷新共用同一 key 空间）。 */
const sessionRefresh = new RefreshCoordinator();

/** authenticated base 在刷新 key 空间的 route 槽位（单 base，固定 0；
 *  plugin route 各自用 NavRouteHandle.generation）。 */
const AUTHENTICATED_BASE_ROUTE_SLOT = 0;

function authenticatedBaseRefreshKey(identity: SessionReconcileIdentity): RefreshFlightKey {
  return {
    appGeneration: currentAppGeneration(),
    routeGeneration: AUTHENTICATED_BASE_ROUTE_SLOT,
    sessionGeneration: identity.generation,
    connectionEpoch: WebSocketClient.inst.getConnectionState().connGeneration,
  };
}

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

/** ViewMgr 打开取消错误的判别（按 code 判别，⛔ 不引入对 ViewMgr 的值依赖）。 */
function isOpenCancelled(error: unknown): boolean {
  return !!error && typeof error === "object"
    && (error as { code?: unknown }).code === "VIEW_OPEN_CANCELLED";
}

type EnterBattleHandler = () => void | Promise<void>;

/**
 * Ownership token for one Cocos scene's page composition root.  The token is
 * deliberately opaque to callers; a stale scene owner can only dispose its
 * own scope and cannot tear down a newer scene's listener/root.
 */
export interface PageSessionOwner {
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
 * 把旧宿主的回调带进新页面。这里把身份、失效状态和最新回调绑在同一条记录上。
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
let activePageOwner: PageSessionOwner | null = null;
const scopeOwners = new WeakMap<PageSessionScope, PageSessionOwner>();
let nextLoginFlightId = 0;
let nextTransitionId = 0;
let openLoginInFlight: LoginFlight | null = null;
let latestOnEnterBattle: EnterBattleHandler | null = null;

function isPageOwnerActive(owner: PageSessionOwner, generation = owner.generation): boolean {
  return activePageOwner === owner && !owner.disposed
    && currentAppGeneration() === generation && !owner.controller.signal.aborted;
}

/** Lobby 物理连接最终死亡后复用当前 token 重进并刷新权威自档；失败由 session 回退到登录页。 */
async function reconcilePageSession(
  owner: PageSessionOwner,
  wiredAppGeneration: number,
  identity: SessionReconcileIdentity,
): Promise<boolean> {
  if (!isSessionIdentityCurrent(identity)) return true;
  if (!isPageOwnerActive(owner, wiredAppGeneration)) return false;
  const server = getCurrentServer();
  if (!server) return false;

  const result = await reconcileSessionProfile<IUserView>(identity, {
    connect: (captured, control) => {
      WebSocketClient.inst.init(server.gameWsUrl);
      return WebSocketClient.inst.joinOwned(captured.accessToken, { sId: server.serverId }, control);
    },
    // GetInfo 对账经 RefreshCoordinator 合流（§7.2：同 key 并发只合流当前 flight）。
    getInfo: () => sessionRefresh.request(
      authenticatedBaseRefreshKey(identity),
      () => WebSocketClient.inst.rpc(UserRpc.GetInfo, {}),
    ),
    isCurrent: (captured) => isPageOwnerActive(owner, wiredAppGeneration)
      && isSessionIdentityCurrent(captured),
    commitProfile: commitSessionProfile,
  }, owner.controller.signal);
  if (!isSessionIdentityCurrent(identity)) return true;
  if (result.status === "stale" || !isPageOwnerActive(owner, wiredAppGeneration)) return false;

  // 恢复 authenticated base 栈顶（⛔ 不再硬编码打开 Home）；从未登记 base（未完成过
  // 登录导航）时交回 CONN_LOST 回登录。
  const home = await appNavigation.restoreAuthenticatedBase({
    userId: identity.userId,
    user: result.user,
  });
  if (!home) return false;
  if (!isPageOwnerActive(owner, wiredAppGeneration) || !isSessionIdentityCurrent(identity)) {
    home.close();
    return !isSessionIdentityCurrent(identity);
  }
  return true;
}

/**
 * 回前台/重连后的 authenticated base profile 刷新（§7.3：EVENT_SHOW 与 reconnected
 * 恢复后只刷新当前 authenticated base）。dirty/背压语义由 RefreshCoordinator 保证；
 * 未登录 / 无 base / owner 失效时不发任何请求（非活跃不得后台请求快照）。
 */
export function refreshAuthenticatedBaseProfile(): Promise<void> {
  const owner = activePageOwner;
  if (!owner || owner.disposed) return Promise.resolve();
  const identity = getSessionIdentity();
  if (!identity) return Promise.resolve();
  if (!appNavigation.hasAuthenticatedBase()) return Promise.resolve();
  const key = authenticatedBaseRefreshKey(identity);
  const task = async (): Promise<boolean> => {
    const info = await WebSocketClient.inst.rpc(UserRpc.GetInfo, {});
    if (!isSessionIdentityCurrent(identity)) return false;
    return commitSessionProfile(identity, info.user);
  };
  sessionRefresh.markDirty(key, task);
  const flight = sessionRefresh.trigger(key);
  if (!flight) return Promise.resolve();
  return flight.then(() => undefined, () => undefined);
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
  transitionAppGeneration: number,
  transitionOwner: PageSessionOwner,
): Promise<void> {
  if (activePageOwner !== transitionOwner || transitionOwner.disposed) return Promise.resolve();
  if (currentAppGeneration() !== transitionAppGeneration) return Promise.resolve();
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
        transitionAppGeneration,
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
      transitionAppGeneration,
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

/**
 * 会话事件接线（踢线/掉线 → 清态回登录页），每个页面生命周期只注册一次。
 * SessionCoordinator.attachSessionNavigator 是 returnToLogin/reconciler 的唯一注册方
 * （§7.2 (a)）：transition 固定次序与文案在 SessionCoordinator；这里只提供 flight
 * 所有权侧的最小操作面（活性判定、flight 捕获、reopen、reconcile）。
 */
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
  const wiredAppGeneration = currentAppGeneration();
  unregisterSessionEvents = attachSessionNavigator({
    isCurrent: () => activePageOwner === owner && !owner.disposed
      && currentAppGeneration() === wiredAppGeneration,
    beginTransition: () => {
      // 捕获并标记触发事件时的具体 flight；它可能仍在 fetch/页面打开中，不能被处理器
      // 直接 await，否则 openLogin 与回登录 transition 会互相等待。
      const observedFlight = openLoginInFlight;
      if (observedFlight) observedFlight.invalidated = true;
      return { transitionId: ++nextTransitionId, observedFlight };
    },
    leave: () => WebSocketClient.inst.leave().catch(() => {}),
    closeLobby: () => closeLobby(),
    prompt: (title, content) => openConfirm({ title, content, noText: null }).then(() => undefined),
    reopenLogin: (transitionId, transitionGen, observedFlight) => reopenLoginAfterTransition(
      transitionId,
      transitionGen,
      observedFlight as LoginFlight | null,
      wiredAppGeneration,
      owner,
    ),
    reconcile: (identity) => reconcilePageSession(owner, wiredAppGeneration, identity),
  });
}

/**
 * Release the page composition root when its Cocos scene is destroyed.
 *
 * The session module intentionally has no View dependency, so this module owns
 * the corresponding unregister handle.  Invalidating the active flight prevents
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
  nextAppGeneration();
  const flight = openLoginInFlight;
  if (flight) {
    flight.invalidated = true;
    flight.reopenTicket = null;
    flight.reopenPromise = null;
  }
  openLoginInFlight = null;
  latestOnEnterBattle = null;
  appNavigation.clearAuthenticatedBase();
  unregisterSessionEvents?.();
  unregisterSessionEvents = null;
  wiredSessionOwner = null;
  sessionWired = false;
  // ViewMgr owns the actual FGUI leases, including uncached Confirm handles;
  // release them together with this composition root so no promise survives a
  // scene transition.
  try {
    appNavigation.disposeViewRoot();
  } catch (e) {
    // A host-specific FairyGUI teardown failure must not leave the session
    // owner/listener installed or let an old scene owner throw from onDestroy.
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
    generation: currentAppGeneration(),
    disposed: false,
  };
  activePageOwner = owner;
  const scope: PageSessionScope = {
    generation: owner.generation,
    isActive: () => activePageOwner === owner && !owner.disposed
      && currentAppGeneration() === owner.generation,
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
  // without a Cocos scene scope. A later scene scope will supersede this owner.
  const owner: PageSessionOwner = {
    id: Symbol("page-session-implicit"),
    controller: new AbortController(),
    generation: nextAppGeneration(),
    disposed: false,
  };
  activePageOwner = owner;
  return owner;
}

function isFlightActive(flight: LoginFlight): boolean {
  return !flight.invalidated
    && !flight.owner.disposed
    && activePageOwner === flight.owner
    && currentAppGeneration() === flight.owner.generation;
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

/** 登录页整段加载只保留一个在途事务；重复调用只更新最新宿主的战斗回调。 */
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

  const h = await appNavigation.open("login");
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
        // consulting the closed context would make the base page unreachable.
        if (!isFlightActive(flight) || getSessionGeneration() !== flowSessionGen) return;
        let baseHandle: NavRouteHandle;
        try {
          // authenticated base = 宣传首屏（PLUGIN.md §6）；旧 FGUI Home 仍是可达 route。
          baseHandle = await openPromoHome(r.userId, user);
        } catch (e) {
          if (!isFlightActive(flight) || getSessionGeneration() !== flowSessionGen) return;
          console.error("[pages] 首屏打开失败，回滚登录事务：", e);
          await returnToLogin({ kind: "BATTLE_JOIN_FAILED" });
          return;
        }
        // 首屏的动态加载也有 await；期间若收到失效事件，handler 会关闭大厅并重开
        // Login。这里再核对一次，避免迟到的首屏把新登录页覆盖回来。
        if (!isFlightActive(flight) || getSessionGeneration() !== flowSessionGen) baseHandle.close();
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

/**
 * 宣传首屏（框架默认形态的 authenticated base，docs/PLUGIN.md §6）：
 * ⛔ 不摆玩法入口——玩法/插件入口全在设置面板，本页只有宣传内容 + 右上角设置按钮。
 *
 * ⚠ 它同时是最终断线对账后的恢复目标：base 登记先于打开，恢复经
 * restoreAuthenticatedBase 走同一入口并带回刷新后的角色快照（会话摘要行消费它）。
 */
export async function openPromoHome(
  userId = "", user: IUserView | null = null,
): Promise<NavRouteHandle> {
  appNavigation.setAuthenticatedBase("promoHome", async (restoreContext) => {
    const restore = (restoreContext ?? {}) as {
      readonly userId?: string;
      readonly user?: IUserView | null;
    };
    const handle = await openPromoHome(restore.userId ?? "", restore.user ?? null);
    // 从分组页进的战斗：把玩家送回他出发的那一页，⛔ 不是大厅。连设置面板一起还原——
    // 这样关掉分组页露出的仍是设置面板，与 route 形态成员（关掉直接露出分组页）走同一条回路。
    const groupId = takeGroupReturn();
    if (groupId !== null) {
      try {
        await openSettings();
        await openEntryGroup(groupId);
      } catch (error) {
        // 还原失败不影响已经回到的首屏：玩家仍在一个可用页面上。
        console.error(`[pages] 玩法结束后恢复分组页 ${groupId} 失败：`, error);
      }
    }
    return handle;
  });
  const h = await appNavigation.open("promoHome");
  const view = h.view as PromoHomeView;
  await h.run((_openedView, context) => {
    const logic = new PromoHomeLogic();
    const cur = getCurrentServer();
    logic.setSession({ serverName: cur?.name ?? "", userId, profile: user });
    logic.onOpenSettings = async () => {
      if (!context.isActive()) return;
      await openSettings();
    };
    view.setup(logic);
  });
  return h;
}

/**
 * 入口分组页（docs/PLUGIN.md §6.1）：宿主 placement 声明的一个分组，成员按声明序列出。
 *
 * 设置面板里整组只占**一行**，点它打到这里。⛔ 本页不认识任何具体插件——组名与成员
 * 全部来自 GENERATED_HOST.groups，launch 仍走 Home/设置那条同一个 HomeMenuRuntime 接线。
 */
export async function openEntryGroup(groupId: string): Promise<NavRouteHandle | null> {
  const resolved = appPluginRegistry.entryGroups().find((item) => item.group.id === groupId);
  if (!resolved) {
    console.error(`[loginFlow] 未登记的入口分组 ${groupId}，忽略`);
    return null;
  }
  const h = await appNavigation.open("entryGroup");
  const view = h.view as EntryGroupView;
  await h.run((_openedView, context) => {
    const logic = new EntryGroupLogic({
      availabilityOf: (pluginId) =>
        (homeMenuRuntime ? homeMenuRuntime.availabilityOf(pluginId) : "available"),
    }, resolved.group.label);
    logic.setItems(resolved.members.map((item) => ({
      entryId: item.entryId,
      pluginId: item.pluginId,
      label: item.label,
      launch: () => {
        if (!context.isActive()) return;
        // gameplay 形态会关掉整层大厅壳（含本页）：记下返回位，战斗结束后回到这一组。
        rememberGroupReturn(item.launch.kind === "gameplay" ? resolved.group.id : null);
        return homeMenuRuntime ? homeMenuRuntime.launch(item.launch) : undefined;
      },
    })));
    view.onClose = () => h.close();
    view.setup(logic);
  });
  return h;
}

/**
 * 设置面板（docs/PLUGIN.md §6.1）：宿主固定区块 + 插件入口列表。
 *
 * 插件入口的数据源仍是 generated menu contribution（⛔ 无第二真源）：全量、pluginId 字母序
 * ——插件只声明入口身份；宿主决定的首屏位置是 Home 那一份（homeContributions），这里不看。
 * 可用性叠加与 launch 都复用 Home 那条 HomeMenuRuntime 接线（同一个 PluginHost 闸）。
 *
 * ⚠ 宿主 placement 的**分组**在这一层落地：属于某组的入口 ⛔ 不在列表里单独出现，整组
 * 折成一行，点它 openEntryGroup 打开二级页（一个产品级入口 = 一行）。
 */
export async function openSettings(): Promise<NavRouteHandle> {
  const h = await appNavigation.open("settings");
  const view = h.view as SettingsView;
  await h.run((_openedView, context) => {
    const logic = new SettingsLogic({
      updateProfile: (patch) => writeProfilePreferences(patch),
      availabilityOf: (pluginId) =>
        (homeMenuRuntime ? homeMenuRuntime.availabilityOf(pluginId) : "available"),
    });
    logic.setProfile(getSessionProfile());
    logic.setGroups(appPluginRegistry.entryGroups().map(({ group, members }) => ({
      groupId: group.id,
      label: group.label,
      pluginIds: [...new Set(members.map((item) => item.pluginId))],
      launch: () => {
        if (!context.isActive()) return;
        clearGroupReturn();
        return openEntryGroup(group.id).then(() => undefined);
      },
    })));
    logic.setEntries(appPluginRegistry.menuContributions().map((item) => ({
      entryId: item.entryId,
      pluginId: item.pluginId,
      label: item.label,
      groupId: appPluginRegistry.groupIdOf(item.pluginId, item.entryId),
      // 无宿主（无头 pages 测试/工具路径）时是 no-op：设置面板没有 Home 那条
      // onEnterBattle 回退通道，⛔ 也不该编一个。
      launch: () => {
        if (!context.isActive()) return;
        clearGroupReturn();
        return homeMenuRuntime ? homeMenuRuntime.launch(item.launch) : undefined;
      },
    })));
    view.onClose = () => h.close();
    view.setup(logic);
  });
  return h;
}

/**
 * 旧 FGUI 主界面：展示真实账号/档案摘要，「进入游戏」→ 已登记玩法。
 *
 * ⚠ 登录后的 authenticated base 已改为 `openPromoHome`（PLUGIN.md §6 的框架默认形态）。
 * 本入口**保留**为可达 route：它是 ballMove 的现成入口，也是 §6.2 (1) 说的开发调试
 * 快捷入口。⛔ 不删（大量测试以它钉住 Home 视觉与菜单叠加语义）。
 */
export async function openHome(
  onEnterBattle: () => void | Promise<void>, userId = "", user: IUserView | null = null,
): Promise<NavRouteHandle> {
  // authenticated base 登记先于打开：最终断线恢复经 restoreAuthenticatedBase 走同一
  // 入口（reopen 读取恢复时刻的 latestOnEnterBattle，旧回调不跨场景）。
  appNavigation.setAuthenticatedBase("home", (restoreContext) => {
    const restore = (restoreContext ?? {}) as {
      readonly userId?: string;
      readonly user?: IUserView | null;
    };
    const enter = latestOnEnterBattle;
    if (!enter) return Promise.resolve(null);
    return openHome(() => enter(), restore.userId ?? "", restore.user ?? null);
  });
  const h = await appNavigation.open("home");
  const view = h.view as HomeView;
  await h.run((_openedView, context) => {
    view.onEnterBattle = () => {
      if (!context.isActive()) return;
      return onEnterBattle();
    };
    // §7.4 数据驱动入口：菜单唯一数据源是 generated contributions，**首屏顺序归宿主**
    // （apps/plugins/host.json → PluginRegistry.homeContributions()，docs/PLUGIN.md §6）；点击统一走
    // LaunchPort.launch(target)（经 HomeMenuRuntime 接线），无宿主回退旧回调。
    // disabled/failed 是 PluginHost 的运行时叠加层，不回写不可变 catalog。
    const entries: HomeMenuEntryModel[] = appPluginRegistry.homeContributions().map((item) => ({
      entryId: item.entryId,
      pluginId: item.pluginId,
      label: item.label,
      enabled: homeMenuRuntime ? homeMenuRuntime.availabilityOf(item.pluginId) === "available" : true,
      launch: () => {
        if (!context.isActive()) return;
        clearGroupReturn();
        return homeMenuRuntime ? homeMenuRuntime.launch(item.launch) : onEnterBattle();
      },
    }));
    const cur = getCurrentServer();
    const who = userId || "未登录";
    const summary = user ? ` · 体力 ${user.stamina} · ${user.wins}胜${user.losses}负` : "";
    view.setup(`${cur ? `${cur.name} · ` : ""}${who}${summary}`, entries);
  });
  return h;
}

/** 选服列表（HTTP）：选服 → 存 currentServer + 回调刷新登录页 → 关闭。 */
export async function openAreaList(onChosen?: (server: WebPlatformAreaServer) => void): Promise<void> {
  const h = await appNavigation.open("areaList");
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
  const h = await appNavigation.open("loginNotice");
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

/** 关闭全部大厅壳页面（进入玩法前调用，让出 GL 画布给玩法渲染）。
 *  原硬编码页面名数组已迁为 builtinPlugin 的 group 声明（成员与顺序不变）。 */
export function closeLobby(): void {
  appNavigation.closeGroup("authenticated");
}

/** 通用提示框（多实例，句柄自关）。返回 Promise，resolve(true=确定/false=取消)。 */
export async function openConfirm(opts: Omit<IConfirmOptions, "onYes" | "onNo">): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let handle: NavRouteHandle | null = null;
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
      handle = await appNavigation.open("confirm");
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
