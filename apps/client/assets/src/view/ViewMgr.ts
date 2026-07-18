/**
 * 页面生命周期管理（机械件，docs/CLIENT.md 方案 1）：ViewMgr.open/close 按 viewRegistry 元数据接管
 * ensurePackages / 动态加载 / 分层挂载 / 单例 / 常驻 / 交互输入。业务层 ⛔ 不手工
 * mountFullScreen / ensurePackages / setInputEnabled，⛔ 不直调 view.dispose()——
 * 关闭一律走 handle.close() 或 ViewMgr.close(name)（交互计数/输入恢复挂在关闭路径上，
 * 直调 dispose 会永久泄漏输入捕获）。
 *
 * 分层：GRoot 下按 VIEW_LAYERS 顺序懒建 base/popup/top 三个全屏容器（顺序即 z 序，
 * 尺寸 relation 跟随 GRoot）；GRoot 随场景重载销毁时容器/缓存整体重建。
 * 交互输入：任一 interactive 页在开 → 启用 FGUI 输入（同时挡住背后游戏触摸——
 * fairygui 单 InputProcessor 的现实，见 FguiView.ensureRoot 注释），全部关闭 → 恢复。
 * 在途去重：onlyOne/permanent 页面加载期间的重复 open（双击竞态）合流到同一 Promise。
 */
import { GComponent, GRoot, RelationType } from "db://fairygui-cc/fairygui.mjs";
import { FguiView } from "./FguiView";
import { VIEW_LAYERS, type ViewLayer } from "./layers";
import type { ViewMeta } from "./defineView";
import { VIEW_REGISTRY } from "./viewRegistry";

/** open 的返回句柄：关闭唯一入口（幂等）。 */
export interface ViewHandle {
  readonly view: FguiView;
  close(): void;
}

interface Entry { view: FguiView; mounted: boolean; meta: ViewMeta; handle: ViewHandle }

/** 在途 open 记录：双击竞态合流 + 在途期间 close 的取消标记（mount 前拦截，防幽灵页面）。 */
interface PendingOpen { promise: Promise<ViewHandle>; cancelled: boolean }

const layerRoots = new Map<ViewLayer, GComponent>();
const cache = new Map<string, Entry>();                 // onlyOne/permanent 单例缓存
const pending = new Map<string, PendingOpen>();         // 在途去重/取消
let interactiveCount = 0;

function ensureLayers(): void {
  // GRoot 可能随场景重载销毁：容器失效则整体重建（缓存视图同批死亡，计数一并归零）
  const probe = layerRoots.get(VIEW_LAYERS[0]);
  if (probe && !probe.node.isValid) {
    layerRoots.clear();
    cache.clear();
    interactiveCount = 0;
  }
  if (layerRoots.size > 0) { return; }
  FguiView.ensureRoot();
  for (const l of VIEW_LAYERS) {
    const c = new GComponent();
    c.node.name = `layer_${l}`;
    GRoot.inst.addChild(c);
    c.setSize(GRoot.inst.width, GRoot.inst.height);
    c.addRelation(GRoot.inst, RelationType.Size);
    layerRoots.set(l, c);
  }
}

function mount(view: FguiView, meta: ViewMeta): void {
  ensureLayers();
  FguiView.healRoot(); // 尺寸/置顶自愈：老路径 mountFullScreen 每次挂载都做，这里保持等价
  const parent = layerRoots.get(meta.layer);
  if (!parent) { throw new Error(`[ViewMgr] 未知层级: ${meta.layer}`); }
  if (meta.fullscreen) { view.mountFullScreenTo(parent); } else { view.mountTo(parent); }
  if (meta.interactive) {
    interactiveCount++;
    FguiView.setInputEnabled(true);
  }
}

function closeEffects(meta: ViewMeta): void {
  if (meta.interactive) {
    interactiveCount = Math.max(0, interactiveCount - 1);
    if (interactiveCount === 0) { FguiView.setInputEnabled(false); }
  }
}

/** 非缓存页（多实例）：句柄自带幂等 close。 */
function uncachedHandle(view: FguiView, meta: ViewMeta): ViewHandle {
  let closed = false;
  return {
    view,
    close(): void {
      if (closed) { return; }
      closed = true;
      closeEffects(meta);
      view.dispose();
    },
  };
}

async function open(name: string): Promise<ViewHandle> {
  const meta = VIEW_REGISTRY[name];
  if (!meta) { throw new Error(`[ViewMgr] 未注册页面: ${name}（view/viewRegistry.ts 加一条）`); }

  ensureLayers(); // 先做失效检测：场景重载后 cache 里是死视图，不能走复用分支
  const entry = cache.get(name);
  if (entry) {
    if (entry.mounted) {
      entry.view.bringToFront();
      return entry.handle;
    }
    mount(entry.view, meta); // permanent 重挂秒开
    entry.mounted = true;
    return entry.handle;
  }

  const cacheable = meta.onlyOne || meta.permanent;
  if (cacheable) {
    const inflight = pending.get(name);
    if (inflight) {
      inflight.cancelled = false; // 在途期间先 close 又 open：后到达者赢，取消作废
      return inflight.promise;    // 双击竞态：加载期间的重复 open 合流
    }
  }

  const rec: PendingOpen = { promise: null as unknown as Promise<ViewHandle>, cancelled: false };
  const p = (async (): Promise<ViewHandle> => {
    try {
      if (meta.sharedPkgs && meta.sharedPkgs.length > 0) {
        await FguiView.ensurePackages([...meta.sharedPkgs]);
      }
      // load 闭包 = 铁律 10 的动态 import 边界，也是将来分包的加载点；构造器真实类型在此收敛
      const ctor = (await meta.load()) as new (root: GComponent) => FguiView;
      const view = await FguiView.create(ctor, `ui/${meta.contract.pkg}`, meta.contract.pkg, meta.contract.comp);
      if (rec.cancelled) {
        // 在途期间被 close(name)：不挂载（微信真机载包窗口百 ms~秒级，取消/切场景防幽灵弹出），
        // 建好的视图直接销毁；交互计数从未加过，无需恢复
        view.dispose();
        throw new Error(`[ViewMgr] 页面在加载期间被关闭: ${name}`);
      }
      mount(view, meta);
      if (cacheable) {
        const handle: ViewHandle = {
          view,
          close: () => {
            // 防陈旧句柄：页面销毁重开后，旧句柄不得关掉新实例（句柄幂等，跨实例失效）
            if (cache.get(name)?.handle === handle) { close(name); }
          },
        };
        cache.set(name, { view, mounted: true, meta, handle });
        return handle;
      }
      return uncachedHandle(view, meta);
    } finally {
      pending.delete(name);
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
  if (inflight) { inflight.cancelled = true; return; }
  const entry = cache.get(name);
  if (!entry || !entry.mounted) { return; }
  entry.mounted = false;
  closeEffects(entry.meta);
  if (entry.meta.permanent) {
    entry.view.unmount(); // 摘下不销毁，下次 open 秒开
  } else {
    entry.view.dispose();
    cache.delete(name);
  }
}

/** 页面是否处于打开状态（onlyOne/permanent 缓存范围内）。 */
function isOpen(name: string): boolean {
  return cache.get(name)?.mounted === true;
}

export const ViewMgr = { open, close, isOpen } as const;
