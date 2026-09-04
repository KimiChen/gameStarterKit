/**
 * 页面生命周期管理（机械件，docs/CLIENT.md §4）：ViewMgr.open/close 按 viewRegistry 元数据接管
 * ensurePackages / 动态加载 / 分层挂载 / 单例 / 常驻 / 交互输入。业务层 ⛔ 不手工
 * mountFullScreen / ensurePackages / setInputEnabled，⛔ 不直调 view.dispose()——
 * 关闭一律走 handle.close() 或 ViewMgr.close(name)（交互计数/输入恢复挂在关闭路径上，
 * 直调 dispose 会永久泄漏输入捕获）。
 *
 * 分层：GRoot 下按 VIEW_LAYERS 顺序懒建 base/popup/top 三个全屏容器（顺序即 z 序，
 * 尺寸 relation 跟随 GRoot）；GRoot 随场景重载销毁时容器/缓存整体重建。
 * 渲染栈：`kind:"fgui"` 页面走 ensurePackages → FguiView.create → 挂 GComponent 容器；
 * `kind:"cocos"` 页面（被 feature routes 引用的纯节点页）跳过这两步，直接实例化并挂到
 * 层容器的 `.node` 下。⚠ 两条分支只在「造实例」和「挂哪里」不同，其余事务序
 * （beginLifecycle → runCreate → mount → 登记 → runOpen → setup）与错误/取消回滚逐段一致，
 * 生命周期实现也只有 ViewBase 一套——⛔ 不为任一渲染栈另起一条。
 * 交互输入：任一 interactive 页在开 → 启用 FGUI 输入（同时挡住背后游戏触摸——
 * fairygui 单 InputProcessor 的现实，见 FguiView.ensureRoot 注释），全部关闭 → 恢复。
 * 在途去重：onlyOne/permanent 页面加载期间的重复 open（双击竞态）合流到同一 Promise。
 */
import { GComponent, GRoot, RelationType } from "db://fairygui-cc/fairygui.mjs";
import { FguiView } from "./FguiView";
import type { ViewBase, ViewLifecycleContext } from "./ViewBase";
// 类型面引用（运行时实例由 meta.load() 的动态 import 提供）：本模块 ⛔ 不静态 import cc。
import type { CocosView } from "./CocosView";
import { VIEW_LAYERS, type ViewLayer } from "./layers";
import type { ViewMeta } from "./defineView";
import { VIEW_REGISTRY } from "./viewRegistry";

/** open 的返回句柄：关闭唯一入口（幂等）。 */
export interface ViewHandle {
  /** FGUI 页面是 FguiView 子类，cocos 页面是 CocosView 子类；调用方按已知页面类型断言。 */
  readonly view: ViewBase;
  /** 本次打开的取消信号与世代；可传给 Area/Notice/Guild 等异步 Logic。 */
  readonly signal: AbortSignal;
  readonly generation: number;
  close(): void;
  /** 在打开事务内运行 setup/render；失败会自动关闭并回滚页面。 */
  run<T>(action: (view: ViewBase, context: ViewLifecycleContext) => T | Promise<T>): Promise<T>;
}

interface Entry {
  view: ViewBase;
  mounted: boolean;
  meta: ViewMeta;
  handle: ViewHandle;
  /** The mount lease owns both the parent attachment and interactive count. */
  releaseMount: (() => void) | null;
}

/** 在途 open 记录：双击竞态合流 + 在途期间 close 的取消标记（mount 前拦截，防幽灵页面）。 */
interface PendingOpen {
  name: string;
  promise: Promise<ViewHandle>;
  cancelled: boolean;
  readonly controller: AbortController;
  readonly generation: number;
  readonly rootGeneration: number;
  readonly cacheable: boolean;
}

/**
 * 只读 View catalog（§7.5：ViewMgr 从注入 catalog 查询 ViewMeta，不再自读手写全集）。
 * 默认注入 generated catalog（经 viewRegistry 稳定 façade）；测试可注入替身。
 * ⛔ 不引入运行时注销/热卸载语义——注入是整表替换，不修改生产 catalog。
 */
let activeCatalog: Readonly<Record<string, ViewMeta>> = VIEW_REGISTRY;

/** 测试 seam：注入替身 catalog；传 null 复位为默认 generated catalog。 */
export function setViewCatalog(catalog: Readonly<Record<string, ViewMeta>> | null): void {
  activeCatalog = catalog ?? VIEW_REGISTRY;
}

const layerRoots = new Map<ViewLayer, GComponent>();
const cache = new Map<string, Entry>();                 // onlyOne/permanent 单例缓存
const pending = new Map<string, PendingOpen>();          // onlyOne/permanent 在途去重
const pendingAll = new Set<PendingOpen>();               // 所有在途加载（含多实例页，可取消）
// Multi-instance views (currently Confirm) are intentionally absent from the
// name cache. Keep their live handles here so a scene/root teardown can still
// abort their lifecycle and release the global interactive lease.
const activeUncached = new Set<ViewHandle>();
let interactiveCount = 0;
let rootGeneration = 0;
let nextGeneration = 0;
let tearingDownRoot = false;

/** 打开在途期间被关闭或场景重载时的可判别错误。 */
export class ViewOpenCancelledError extends Error {
  readonly code = "VIEW_OPEN_CANCELLED" as const;
  constructor(name: string) {
    super(`[ViewMgr] 页面打开已取消: ${name}`);
    this.name = "ViewOpenCancelledError";
  }
}

type ViewSetup = (view: ViewBase, context: ViewLifecycleContext) => unknown | Promise<unknown>;

/**
 * Invalidate the current FGUI root and every page owned by it. This is used
 * both by lazy stale-root detection and by the scene composition root during
 * destruction. Registries are cleared before user hooks run so a re-entrant
 * stale handle cannot close or mutate a replacement entry.
 */
function teardownRoot(): void {
  if (tearingDownRoot) return;
  tearingDownRoot = true;
  try {
    rootGeneration++;

    const pendingRecords = [...pendingAll];
    pendingAll.clear();
    pending.clear();
    for (const rec of pendingRecords) {
      rec.cancelled = true;
      try { rec.controller.abort(); } catch (e) {
        console.error("[ViewMgr] 取消在途页面失败", e);
      }
    }

    const cachedEntries = [...cache.values()];
    cache.clear();
    for (const entry of cachedEntries) {
      entry.mounted = false;
      const release = entry.releaseMount;
      entry.releaseMount = null;
      try { release?.(); } catch (e) {
        console.error("[ViewMgr] 场景重载释放页面挂载异常", e);
      }
      try { entry.view.dispose(); } catch (e) {
        console.error("[ViewMgr] 场景重载 dispose 异常", e);
      }
    }

    const uncachedHandles = [...activeUncached];
    activeUncached.clear();
    for (const handle of uncachedHandles) {
      try { handle.close(); } catch (e) {
        // A close hook must not prevent the remaining views/root from being
        // released. The handle itself observes async hook failures.
        console.error("[ViewMgr] 场景重载关闭多实例页面异常", e);
      }
    }

    const roots = [...layerRoots.values()];
    layerRoots.clear();
    for (const root of roots) {
      try { root.removeFromParent(); root.dispose(); } catch (e) {
        console.error("[ViewMgr] 旧层容器释放异常", e);
      }
    }
    interactiveCount = 0;
    try { FguiView.setInputEnabled(false); } catch (e) {
      // Root teardown must finish even if a disposed InputProcessor rejects the
      // final disable call (some Creator versions do this during scene changes).
      console.error("[ViewMgr] 场景重载恢复输入失败", e);
    }
  } finally {
    tearingDownRoot = false;
  }
}

function ensureLayers(): void {
  if (tearingDownRoot) throw new ViewOpenCancelledError("__root__");
  // GRoot 可能随场景重载销毁：容器失效则整体重建（缓存视图同批死亡，计数一并归零）
  const stale = layerRoots.size > 0
    && (layerRoots.size !== VIEW_LAYERS.length
      || [...layerRoots.values()].some((root) => root.node && root.node.isValid === false));
  if (stale) {
    teardownRoot();
  }
  if (layerRoots.size === VIEW_LAYERS.length) { return; }
  FguiView.ensureRoot();
  const built: GComponent[] = [];
  try {
    for (const l of VIEW_LAYERS) {
      const c = new GComponent();
      // Track the component before any attach/size/relation call: each of those can
      // throw in a partially initialized Creator scene and must be cleaned up below.
      built.push(c);
      c.node.name = `layer_${l}`;
      GRoot.inst.addChild(c);
      c.setSize(GRoot.inst.width, GRoot.inst.height);
      c.addRelation(GRoot.inst, RelationType.Size);
      layerRoots.set(l, c);
    }
  } catch (e) {
    for (const c of built) {
      try { c.removeFromParent(); c.dispose(); } catch (disposeError) {
        console.error("[ViewMgr] 层容器回滚异常", disposeError);
      }
    }
    layerRoots.clear();
    throw e;
  }
}

/**
 * 把 view 接到层容器上。这是 fgui / cocos 两条分支在挂载段的**唯一**差异：
 * FGUI 页面挂 GComponent 容器（全屏页由 Size relation 跟随），cocos 页面挂容器的 `.node`
 * 并按容器当前尺寸铺满。租约回滚（unmount）与销毁对两者同形，故留在 mount 里共用。
 */
function attach(view: ViewBase, meta: ViewMeta, parent: GComponent): void {
  if (meta.kind === "cocos") {
    (view as CocosView).mountToLayer(parent.node, parent.width, parent.height, meta.fullscreen);
    return;
  }
  const fgui = view as FguiView;
  if (meta.fullscreen) { fgui.mountFullScreenTo(parent); } else { fgui.mountTo(parent); }
}

/** 挂载并返回可回滚的 lease；任何中途异常都会摘下组件且归还 interactive 租约。 */
function mount(view: ViewBase, meta: ViewMeta): () => void {
  ensureLayers();
  FguiView.healRoot(); // 尺寸/置顶自愈：老路径 mountFullScreen 每次挂载都做，这里保持等价
  // A non-cacheable handle may outlive a scene/root reload.  Its release must
  // never decrement the interactive lease belonging to the replacement root.
  const leaseRootGeneration = rootGeneration;
  const parent = layerRoots.get(meta.layer);
  if (!parent) { throw new Error(`[ViewMgr] 未知层级: ${meta.layer}`); }
  let mounted = false;
  let leased = false;
  try {
    attach(view, meta, parent);
    mounted = true;
    if (meta.interactive) {
      interactiveCount++;
      leased = true;
      FguiView.setInputEnabled(true);
    }
    return () => {
      if (leased) {
        leased = false;
        if (leaseRootGeneration === rootGeneration) closeEffects(meta);
      }
      if (mounted) {
        mounted = false;
        try { view.unmount(); } catch (e) { console.error("[ViewMgr] mount lease 回滚异常", e); }
      }
    };
  } catch (e) {
    if (leased) closeEffects(meta);
    try { view.unmount(); } catch (unmountError) {
      console.error("[ViewMgr] mount 失败后的摘除异常", unmountError);
    }
    throw e;
  }
}

function closeEffects(meta: ViewMeta): void {
  if (meta.interactive) {
    interactiveCount = Math.max(0, interactiveCount - 1);
    if (interactiveCount === 0) {
      try { FguiView.setInputEnabled(false); } catch (e) {
        // Input cleanup is best-effort; the mount lease still has to detach
        // its component and release the logical count.
        console.error("[ViewMgr] 关闭页面后恢复输入失败", e);
      }
    }
  }
}

function makeHandle(
  name: string,
  view: ViewBase,
  context: ViewLifecycleContext,
  cacheable: boolean,
  releaseMount: (() => void) | null,
  onClosed?: () => void,
): {
  handle: ViewHandle;
  runDuringOpen<T>(action: (view: ViewBase, context: ViewLifecycleContext) => T | Promise<T>): Promise<T>;
} {
  const state = { context, closed: false, releaseMount };
  let handle!: ViewHandle;
  const runAction = async <T>(
    action: (view: ViewBase, context: ViewLifecycleContext) => T | Promise<T>,
    closeOnFailure: boolean,
  ): Promise<T> => {
    const activeContext = state.context;
    if (state.closed || !activeContext.isActive()) {
      throw new ViewOpenCancelledError(name);
    }
    try {
      const result = await action(view, activeContext);
      if (state.context !== activeContext || !activeContext.isActive()) throw new ViewOpenCancelledError(name);
      return result;
    } catch (e) {
      // A public run owns its rollback. During open/remount the surrounding
      // transaction must roll back without marking its own pending record as a
      // user cancellation, so the caller still receives the original error.
      if (closeOnFailure && state.context === activeContext && !state.closed) handle.close();
      throw e;
    }
  };
  handle = {
    view,
    get signal() { return state.context.signal; },
    get generation() { return state.context.generation; },
    close(): void {
      // Every handle belongs to one lifecycle generation. A permanent view is
      // remounted with a fresh handle, so an old handle must stay inert too.
      if (state.closed) return;
      if (cacheable) {
        const entry = cache.get(name);
        // A permanent view gets a fresh handle for every remount.  An old
        // caller may still invoke close() after a newer generation is active;
        // it must not close that newer generation by name.
        if (entry?.handle !== handle) { state.closed = true; return; }
        close(name);
        state.closed = true;
      } else {
        state.closed = true;
        const release = state.releaseMount;
        state.releaseMount = null;
        try { release?.(); } catch (e) {
          console.error("[ViewMgr] 关闭页面挂载释放异常", e);
        }
        try { onClosed?.(); } catch (e) {
          console.error("[ViewMgr] 关闭页面登记清理异常", e);
        }
        void view.closeLifecycle().catch((e) => console.error("[ViewMgr] onClose 回调异常", e));
        try { view.dispose(); } catch (e) {
          console.error("[ViewMgr] 关闭页面 dispose 异常", e);
        }
      }
    },
    async run<T>(action: (v: ViewBase, c: ViewLifecycleContext) => T | Promise<T>): Promise<T> {
      return runAction(action, true);
    },
  };
  return {
    handle,
    runDuringOpen: (action) => runAction(action, false),
  };
}

function rollbackEntry(name: string, entry: Entry): void {
  if (cache.get(name) !== entry) return;
  if (entry.mounted) {
    entry.mounted = false;
  }
  const release = entry.releaseMount;
  entry.releaseMount = null;
  try { release?.(); } catch (e) {
    console.error("[ViewMgr] 回滚页面挂载释放异常", e);
  }
  void entry.view.closeLifecycle().catch((e) => console.error("[ViewMgr] rollback onClose 异常", e));
  if (entry.meta.permanent) {
    // releaseMount already detaches the root; permanent instances remain
    // cached for the next generation.
  } else {
    try { entry.view.dispose(); } catch (e) {
      console.error("[ViewMgr] 回滚页面 dispose 异常", e);
    }
    cache.delete(name);
  }
}

function ensurePendingActive(rec: PendingOpen): void {
  if (rec.cancelled || rec.controller.signal.aborted || rec.rootGeneration !== rootGeneration) {
    throw new ViewOpenCancelledError(rec.name);
  }
}

async function open(name: string, setup?: ViewSetup): Promise<ViewHandle> {
  const meta = activeCatalog[name];
  if (!meta) { throw new Error(`[ViewMgr] 未注册页面: ${name}（写 <Name>View.view.json 并登记进 features/<id>/feature.json 后重跑 codegen:features）`); }

  ensureLayers(); // 先做失效检测：场景重载后 cache 里是死视图，不能走复用分支
  const entry = cache.get(name);
  if (entry) {
    if (entry.mounted) {
      entry.view.bringToFront();
      if (setup) await entry.handle.run(setup);
      return entry.handle;
    }
    const context = entry.view.beginLifecycle(++nextGeneration);
    try {
      const releaseMount = mount(entry.view, meta); // permanent 重挂秒开
      entry.releaseMount = releaseMount;
      entry.mounted = true;
      // Every remount receives a fresh handle.  Reusing the original object
      // would let a stale caller close or run setup against this generation.
      const made = makeHandle(name, entry.view, context, true, releaseMount);
      entry.handle = made.handle;
      await entry.view.runOpen(context);
      ensureContextActive(context, name);
      if (setup) await made.runDuringOpen(setup);
      return made.handle;
    } catch (e) {
      // The same permanent Entry can be reopened while an async onOpen/setup is pending;
      // do not roll back the newer lifecycle that replaced this context.
      const ownsLifecycle = entry.view.lifecycleContext === context;
      const wasActive = context.isActive();
      if (ownsLifecycle) rollbackEntry(name, entry);
      if (!ownsLifecycle || !wasActive) throw new ViewOpenCancelledError(name);
      throw e;
    }
  }

  const cacheable = meta.onlyOne || meta.permanent;
  if (cacheable) {
    const inflight = pending.get(name);
    if (inflight && !inflight.cancelled) {
      return inflight.promise;    // 双击竞态：加载期间的重复 open 合流
    }
  }

  const rec: PendingOpen = {
    name,
    promise: null as unknown as Promise<ViewHandle>,
    cancelled: false,
    controller: new AbortController(),
    generation: ++nextGeneration,
    rootGeneration,
    cacheable,
  };
  pendingAll.add(rec);
  const p = (async (): Promise<ViewHandle> => {
    let view: ViewBase | null = null;
    let lease: (() => void) | null = null;
    let entry: Entry | null = null;
    let uncachedHandle: ViewHandle | null = null;
    let context: ViewLifecycleContext | null = null;
    let cancelLifecycle: (() => void) | null = null;
    try {
      if (meta.kind === "fgui" && meta.sharedPkgs && meta.sharedPkgs.length > 0) {
        // Pass the pending open's signal through the package boundary. FairyGUI
        // cannot abort its underlying request, but this releases this waiter
        // immediately when close() or a root/scene generation change occurs.
        ensurePendingActive(rec);
        await FguiView.ensurePackages([...meta.sharedPkgs], { signal: rec.controller.signal });
      }
      ensurePendingActive(rec);
      // load 闭包 = 铁律 10 的动态 import 边界，也是将来分包的加载点；构造器真实类型在此收敛
      const ctor = await meta.load();
      ensurePendingActive(rec);
      // cocos 页面没有 FGUI 段：跳过 ensurePackages 与组件创建，直接实例化（根节点由
      // CocosView 自建，挂载在下面的 mount 段完成）。后续每一段与 fgui 分支完全共用。
      view = meta.kind === "cocos"
        ? new (ctor as new () => CocosView)()
        : await FguiView.create(
          ctor as new (root: GComponent) => FguiView,
          `ui/${meta.contract.pkg}`,
          meta.contract.pkg,
          meta.contract.comp,
          { signal: rec.controller.signal },
        );
      ensurePendingActive(rec);
      context = view.beginLifecycle(rec.generation);
      // close(name)/root 重载可能发生在 setup 或 onOpen 等后续 await 期间；把 pending
      // cancellation 直接桥接到 View context，让迟到逻辑立刻看到 aborted。
      cancelLifecycle = () => {
        void view!.closeLifecycle().catch((e) => console.error("[ViewMgr] 取消打开 onClose 异常", e));
      };
      rec.controller.signal.addEventListener("abort", cancelLifecycle, { once: true });
      await view.runCreate(context);
      ensurePendingActive(rec);
      lease = mount(view, meta);
      const made = makeHandle(
        name,
        view,
        context,
        cacheable,
        lease,
        cacheable ? undefined : () => {
          if (uncachedHandle) activeUncached.delete(uncachedHandle);
        },
      );
      if (cacheable) {
        entry = { view, mounted: true, meta, handle: made.handle, releaseMount: lease };
        cache.set(name, entry);
        // The cache entry now owns the mount lease.  A failed/superseded open
        // will release it through rollbackEntry exactly once.
        lease = null;
      } else {
        // Register before onOpen/setup so an explicit scene disposer can close
        // a multi-instance page even while its opening transaction is awaiting.
        uncachedHandle = made.handle;
        activeUncached.add(made.handle);
      }
      await view.runOpen(context);
      ensureContextActive(context, name);
      ensurePendingActive(rec);
      if (setup) await made.runDuringOpen(setup);
      ensurePendingActive(rec);
      return made.handle;
    } catch (e) {
      if (uncachedHandle) {
        activeUncached.delete(uncachedHandle);
        uncachedHandle = null;
      }
      // permanent 实例可能在本次 await 期间被 close 后重开；只有仍属于本次
      // context 的实例才允许回滚，避免迟到的旧 open 拆掉新世代页面。
      const ownsLifecycle = !context || view?.lifecycleContext === context;
      if (entry && ownsLifecycle) rollbackEntry(name, entry);
      else if (view && !view.isDisposed && ownsLifecycle) {
        lease?.();
        void view.closeLifecycle().catch((closeError) => console.error("[ViewMgr] open 失败 onClose 异常", closeError));
        view.dispose();
      }
      if (rec.cancelled || rec.controller.signal.aborted || rec.rootGeneration !== rootGeneration) {
        throw new ViewOpenCancelledError(name);
      }
      throw e;
    } finally {
      if (cancelLifecycle) {
        rec.controller.signal.removeEventListener("abort", cancelLifecycle);
        cancelLifecycle = null;
      }
      pendingAll.delete(rec);
      if (pending.get(name) === rec) pending.delete(name);
    }
  })();
  rec.promise = p;
  if (cacheable) { pending.set(name, rec); }
  return p;
}

/** 关闭页面（onlyOne/permanent 按名；多实例页用 open 返回的 handle.close()）。幂等；
 *  在途中的 open 则标记取消（mount 前拦截）。 */
function close(name: string): void {
  const inflight = pending.get(name);
  if (inflight) {
    inflight.cancelled = true;
    try { inflight.controller.abort(); } catch (e) {
      console.error("[ViewMgr] 取消页面打开失败", e);
    }
  }
  for (const rec of pendingAll) {
    if (rec.name === name) {
      rec.cancelled = true;
      try { rec.controller.abort(); } catch (e) {
        console.error("[ViewMgr] 取消页面打开失败", e);
      }
    }
  }
  const entry = cache.get(name);
  if (!entry || !entry.mounted) { return; }
  entry.mounted = false;
  const release = entry.releaseMount;
  entry.releaseMount = null;
  try { release?.(); } catch (e) {
    console.error("[ViewMgr] 关闭页面挂载释放异常", e);
  }
  void entry.view.closeLifecycle().catch((e) => console.error("[ViewMgr] onClose 回调异常", e));
  if (entry.meta.permanent) {
    // releaseMount detaches the permanent view without destroying it.
  } else {
    try { entry.view.dispose(); } catch (e) {
      console.error("[ViewMgr] 关闭页面 dispose 异常", e);
    }
    cache.delete(name);
  }
}

/**
 * Explicitly release the current scene's FGUI ownership. Cocos destroys the
 * node tree during a scene transition, but that does not notify detached
 * multi-instance handles (for example Confirm); callers owning the page
 * composition root should invoke this from their disposer.
 */
function disposeViewRoot(): void {
  teardownRoot();
}

/** 页面是否处于打开状态（onlyOne/permanent 缓存范围内）。 */
function isOpen(name: string): boolean {
  return cache.get(name)?.mounted === true;
}

function ensureContextActive(context: ViewLifecycleContext, name: string): void {
  if (!context.isActive()) throw new ViewOpenCancelledError(name);
}

export { disposeViewRoot };

export const ViewMgr = { open, close, isOpen, disposeViewRoot } as const;
