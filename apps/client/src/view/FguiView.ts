/**
 * FguiView — FairyGUI 视图薄基类（三层模型的"绑定层"）。子类由 `tools/fgui-codegen` 从 `.fui` 生成：
 * `bind()` 里按 AUTO 区块 `getChild<T>` 绑定命名元素；业务 `apply(presenter 输出)` / `onClick` 写 AUTO 外。
 *
 * `apps/client/tsconfig.json` 是 Creator 兼容 legacy 配置；本文件及其他 fairygui 绑定件由本地
 *   `cc-stub.d.ts` 的最小 API 面递归纳入 ES2017 检查。完整 `npm run typecheck:client` 另使用
 *   `client-test-stubs.d.ts` 做 Node strict 编译，Creator 真 cc + 扩展仍负责编辑器侧验证。
 *   行为层（logic/）与结构契约（fgui-codegen）在无头测试里跑（分别是 npm run test:client 与
 *   npm run test:fgui）；
 *   本层只做"取组件 + 搬数据"。见 docs/CLIENT.md §3。
 */
import { Canvas, director, sys, view } from "cc";
import { GComponent, GObject, GRoot, RelationType, UIPackage } from "db://fairygui-cc/fairygui.mjs";
import { ViewBase } from "./ViewBase";
import {
  FguiPackageCancelledError,
  FguiPackageLoader,
  type FguiPackageLoadOptions,
  type FguiPackageLoaderConfig,
} from "./packageLoader";
export {
  DEFAULT_FGUI_PACKAGE_DEADLINE_MS,
  FguiPackageCancelledError,
  FguiPackageLoadError,
  FguiPackageMissingError,
  FguiPackageTimeoutError,
  isFguiPackageLoadError,
} from "./packageLoader";
export type { ViewLifecycleContext } from "./ViewBase";
export type {
  FguiPackageErrorCode,
  FguiPackageLoadOptions,
  FguiPackageLoaderConfig,
  FguiPackageRuntime,
  FguiPackageScheduler,
} from "./packageLoader";

export abstract class FguiView extends ViewBase {
  /**
   * 懒启动 GRoot：**只在第一个 FairyGUI 视图真正挂载时**才建，没用 FairyGUI 时它绝不常驻（避免全屏
   * GRoot/InputProcessor 干扰游戏输入，如战斗拖拽）。等价官方 `GRoot.create()` 但规避其硬编码找场景直接
   * 子节点名 `Canvas`——改为找 Canvas 组件所在节点（本工程的 Canvas 未必是场景直接子）。幂等。
   */
  static ensureRoot(): void {
    const G = GRoot as unknown as { _inst?: GRoot };
    if (G._inst && G._inst.node.isValid) { return; } // isValid：场景重载会销毁旧 GRoot，残留 _inst 须重建
    const canvasNode = director.getScene()?.getComponentInChildren(Canvas)?.node;
    if (!canvasNode) { console.error("[fgui] 场景里找不到 Canvas，GRoot 未启动"); return; }
    const groot = new GRoot();
    canvasNode.addChild(groot.node);
    G._inst = groot; // 注入单例(fgui 未开放此注入,故走类型断言;仅此一处)
    groot.onWinResize();
    // ⚠ 关键:懒启动的 GRoot 默认**不捕获指针**。FairyGUI 的 InputProcessor 在 GRoot 节点上注册
    //   node.on(TOUCH_START/MOUSE_DOWN);而 Cocos 3.4.1+ 把「节点树指针派发器」(优先级 UI=1)排在
    //   「全局 input 派发器」(GLOBAL=0)**之前**,且任一派发器吞掉事件即中断整条派发链(input.ts _emitEvent)。
    //   GRoot 全屏 → hitTest 恒真 → 吞掉每一次点击 → 战斗拖拽的全局 `input.on`(DragDropInput)整条收不到,
    //   表现为「按下去没反应、拖不动」。故默认关掉 InputProcessor,让全局输入活着。
    //   交互式弹窗(有按钮/需模态挡输入)由其自身在 show 时 setInputEnabled(true)、hide 时置回/ dispose GRoot。
    FguiView.setInputEnabled(false);
  }

  /**
   * 开/关 GRoot 全局指针捕获(=其 InputProcessor.enabled)。
   * - **纯展示 HUD**(零输入)与战斗共存时须 `false`——否则全屏 GRoot 吞掉战斗触摸输入。
   * - **交互式/模态弹窗**须 `true`——那时全屏吞输入正是想要的「模态挡住背后战斗」;关闭弹窗时置回 `false`
   *   (或 dispose 掉 GRoot)以恢复游戏触摸输入。见 ensureRoot 注释与 docs/CLIENT.md 输入共存。
   */
  static setInputEnabled(on: boolean): void {
    const G = GRoot as unknown as { _inst?: GRoot };
    const ip = G._inst?.inputProcessor;
    if (ip) { ip.enabled = on; }
  }

  /** FairyGUI 组件根（由 `UIPackage.createObject(...).asCom` 传入）。 */
  protected readonly root: GComponent;

  constructor(root: GComponent) {
    super();
    this.root = root;
    // ⚠ 不在此调 bind()：`useDefineForClassFields`(Cocos 3.8 默认)下，子类字段声明会在 super() 之后
    //   被编译成 `this.xxx = undefined`，把 super 里 bind() 绑好的值清掉。故 bind 必须在**构造完成后**调
    //   （见 `create`/`fromComponent`）。
  }

  /** 子类实现（codegen 生成）：按 AUTO BIND 用 `getChild` 绑定字段。构造完成后由工厂调一次。 */
  protected abstract bind(): void;

  /** 用已建好的 FairyGUI 组件根构造并绑定（构造后调 bind，避开字段声明覆盖）。 */
  static fromComponent<V extends FguiView>(viewCtor: new (root: GComponent) => V, root: GComponent): V {
    try {
      const v = new viewCtor(root);
      v.bind();
      return v;
    } catch (e) {
      // bind/constructor 失败时对象还未交给 ViewMgr，必须在这里释放组件树，避免资源泄漏。
      try { root.dispose(); } catch (disposeError) {
        console.error("[FguiView] 构造失败后的 root dispose 异常", disposeError);
      }
      throw e;
    }
  }

  /** 按名取子组件（codegen 生成的 bind 用）。缺失即抛清晰错误（列出实际有哪些子元素），
   *  避免下游拿 undefined 崩在别处——契约不符时一眼定位。 */
  protected getChild<T extends GObject>(name: string): T {
    const child = this.root.getChild(name);
    if (!child) {
      const have: string[] = [];
      for (let i = 0; i < this.root.numChildren; i++) { have.push(this.root.getChildAt(i).name); }
      throw new Error(`FGUI 组件 ${this.root.name} 缺少子元素 "${name}"（实际子元素: [${have.join(", ")}]）`);
    }
    return child as unknown as T;
  }

  /** 点击绑定（写在子类 registerEvent 里）。 */
  protected onClick(obj: GObject, cb: () => unknown): void {
    obj.onClick(() => this.observeAsync(cb, "click"), this);
  }

  /** 挂到 GRoot（或指定父容器）。GRoot 懒启动：此时才建（若还没建）。 */
  mountTo(parent?: GComponent): this {
    if (!parent) { FguiView.ensureRoot(); FguiView.syncGRootSize(); }
    (parent ?? GRoot.inst).addChild(this.root);
    if (!parent) { FguiView.bringGRootToFront(); }
    return this;
  }

  /**
   * 全屏页挂载（FIXED_WIDTH 配套，回流自 Arthur P1）：挂 GRoot 并把根拉到 GRoot 当前尺寸 +
   * Size relation 跟随。FIXED_WIDTH 下 GRoot 宽恒 750、高随机型浮动（约 1334~1730）：设计稿全屏
   * 组件不拉伸会在长屏下方露底/短屏底部出屏；根拉伸后，组件内部靠 XML relation 重排
   * （bg 拉伸/底部件贴底，无 relation 的子元素保持左上原位）。非全屏覆盖件（HUD/条）勿用。
   */
  mountFullScreen(): this {
    this.mountTo();
    this.root.setSize(GRoot.inst.width, GRoot.inst.height);
    this.root.addRelation(GRoot.inst, RelationType.Size);
    return this;
  }

  /** 全屏挂载到指定容器（ViewMgr 分层容器用；语义同 mountFullScreen，尺寸跟随该容器）。 */
  mountFullScreenTo(parent: GComponent): this {
    this.mountTo(parent);
    this.root.setSize(parent.width, parent.height);
    this.root.addRelation(parent, RelationType.Size);
    return this;
  }

  /** 从父容器摘下但**不销毁**（permanent 页面 close 用；再次 open 直接重挂，秒开）。 */
  unmount(): void {
    this.root.removeFromParent();
  }

  /** 在当前父容器内置顶（onlyOne 页面重复 open 时复用置顶）。 */
  bringToFront(): void {
    const p = this.root.parent;
    if (p) { p.setChildIndex(this.root, p.numChildren - 1); }
  }

  /** GRoot 自愈组合拳（尺寸重算 + 节点置顶，见二者注释的事故记录）。幂等且便宜——
   *  ViewMgr 每次挂载前补一发；直挂 GRoot 的老路径（mountTo 无参分支）自带。 */
  static healRoot(): void {
    FguiView.syncGRootSize();
    FguiView.bringGRootToFront();
  }

  /**
   * 顶部安全区高度（设计像素；刘海/挖孔）。FIXED_WIDTH 铺满全屏后，贴 y=0 的 HUD 在真机会顶进
   * 刘海——摆放时加此偏移。视口/安全区同为 UI 坐标系，差值即顶部不可用高；取不到（旧引擎/编辑器）回 0。
   */
  static safeTopInset(): number {
    try {
      const r = sys.getSafeAreaRect();
      const vs = view.getVisibleSize();
      return Math.max(0, vs.height - (r.y + r.height));
    } catch {
      return 0;
    }
  }

  /**
   * GRoot 尺寸/位置自愈（回流自 Arthur）：官方在构造器挂了 View 'canvas-resize' 监听，但 Creator
   * 预览里开关/拖动 devtools 改视口时该事件不一定触发（表现为面板整体偏移、露出旧视口外的世界）。
   * onWinResize 按当前视口重算，幂等且便宜——每次挂载前补一发，过期即自愈。
   */
  private static syncGRootSize(): void {
    (GRoot as unknown as { _inst?: GRoot })._inst?.onWinResize();
  }

  /** GRoot 节点置顶（回流自 Arthur）：防后建的全屏游戏背景节点把 FGUI 层盖死。 */
  private static bringGRootToFront(): void {
    const node = (GRoot as unknown as { _inst?: GRoot })._inst?.node;
    const parent = node?.parent;
    if (node && parent) { node.setSiblingIndex(parent.children.length - 1); }
  }

  /** 释放渲染根：从父移除 + dispose FairyGUI 对象树（世代关闭由 ViewBase.dispose 负责）。 */
  protected disposeRoot(): void {
    try { this.root.removeFromParent(); } catch (e) {
      console.error("[FguiView] removeFromParent 异常", e);
    }
    try { this.root.dispose(); } catch (e) {
      console.error("[FguiView] root dispose 异常", e);
    }
  }

  /**
   * 包加载器只持有 FairyGUI 运行时适配，不持有页面引用：成功包按进程常驻，
   * 页面关闭时只释放组件树。这样共享包不会因某个页面关闭被 removePackage，
   * 而缺包/超时仍可由下一次 open 重试。
   */
  private static readonly packageLoader = new FguiPackageLoader({
    getByName: (name) => UIPackage.getByName(name),
    loadPackage: (path, callback) => UIPackage.loadPackage(path, callback),
  });

  /** 默认包 deadline，供开发诊断和测试配置读取。 */
  static get packageLoadDeadlineMs(): number {
    return FguiView.packageLoader.defaultDeadlineMs;
  }

  /**
   * 配置统一包加载 deadline/测试时钟。生产代码通常只设置 deadlineMs；无头测试
   * 可注入 scheduler，避免依赖真实时间。调用不会清理已完成或在途的共享包。
   */
  static configurePackageLoading(config: FguiPackageLoaderConfig): void {
    FguiView.packageLoader.configure(config);
  }

  /** 固定默认值，便于宿主在热重载/测试 teardown 后恢复开发期配置。 */
  static resetPackageLoading(): void {
    FguiView.packageLoader.reset();
  }

  /**
   * 预加载**跨包依赖**（共享库包）。跨包组件在 createObject 时惰性解析，fairygui **不会**自动从依赖表加载，
   * 故引用了标准库组件的视图须在 create 前先 ensurePackages 把那些包加载好（并发布成各自的 .bin）。
   * 缺失或超时会抛 `FguiPackageLoadError`（`retryable=true`），阻止页面创建；共享包成功后不 remove，
   * 按进程常驻以供其他视图复用。调用方应把本次 View 的 AbortSignal 传入，关闭/场景重载时立即取消等待。
   */
  static ensurePackages(paths: readonly string[], options?: FguiPackageLoadOptions): Promise<void> {
    return FguiView.packageLoader.ensure(paths, options);
  }

  /**
   * 便捷工厂：加载包 → 创建组件 → new View（构造里 bind）。
   * `pkgPath` 是**发布到 `assets/resources/` 下**的包路径（如 `ui/Versus` ← `resources/ui/Versus.bin`）：
   * `UIPackage.loadPackage(path)` 无 bundle 参数时固定走 resources bundle（fairygui.mjs `bundle = bundle || resources`），
   * FGUI 编辑器发布路径须配 `.../assets/resources/ui`。包加载经过统一 loader：已加载包直接复用，
   * 在途请求按路径合流，并受 deadline/AbortSignal 约束；失败会抛可判别的 `FguiPackageLoadError`。
   */
  static create<V extends FguiView>(
    viewCtor: new (root: GComponent) => V, pkgPath: string, pkg: string, comp: string,
    options?: FguiPackageLoadOptions,
  ): Promise<V> {
    const build = (): V => {
      if (options?.signal?.aborted) {
        const reason = (options.signal as AbortSignal & { reason?: unknown }).reason;
        throw new FguiPackageCancelledError(pkgPath, reason);
      }
      const obj = UIPackage.createObject(pkg, comp);
      if (!obj) throw new Error(`FairyGUI 组件不存在: ui://${pkg}/${comp}`);
      // 构造后 bind——getChild 缺元素会抛，fromComponent 会释放组件树。
      return FguiView.fromComponent(viewCtor, obj.asCom);
    };
    return (async (): Promise<V> => {
      if (options?.signal?.aborted) {
        const reason = (options.signal as AbortSignal & { reason?: unknown }).reason;
        throw new FguiPackageCancelledError(pkgPath, reason);
      }
      if (!UIPackage.getByName(pkg)) {
        await FguiView.packageLoader.load(pkgPath, options);
      }
      return build();
    })();
  }
}
