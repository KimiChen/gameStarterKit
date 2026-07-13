/**
 * FguiView — FairyGUI 视图薄基类（三层模型的"绑定层"）。子类由 `tools/fgui-codegen` 从 `.fui` 生成：
 * `bind()` 里按 AUTO 区块 `getChild<T>` 绑定命名元素；业务 `apply(presenter 输出)` / `onClick` 写 AUTO 外。
 *
 * ⚠ 本目录（`ui/fgui/**`）依赖 fairygui-cc（其 d.ts 引真 cc），由 Cocos Creator 自带 tsconfig
 *   （真 cc + 扩展）在编辑器里 typecheck。**Creator 侧验证**。
 *   行为层（纯 presenter）与结构契约（fgui-codegen）在无头测试里跑（npm run test:fgui）；
 *   本层只做"取组件 + 搬数据"。见 docs/research/fairgui.md §5。
 */
import { Canvas, director, sys, view } from "cc";
import { GComponent, GObject, GRoot, RelationType, UIPackage } from "db://fairygui-cc/fairygui.mjs";

export abstract class FguiView {
  /**
   * 懒启动 GRoot：**只在第一个 FairyGUI 视图真正挂载时**才建，没用 FairyGUI 时它绝不常驻（避免全屏
   * GRoot/InputProcessor 干扰游戏输入，如战斗拖拽）。等价官方 `GRoot.create()` 但规避其硬编码找场景直接
   * 子节点名 `Canvas`——改为找 Canvas 组件所在节点（本工程的 Canvas 未必是场景直接子）。幂等。
   */
  private static ensureRoot(): void {
    const G = GRoot as unknown as { _inst?: GRoot };
    if (G._inst) { return; }
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
   *   (或 dispose 掉 GRoot)以恢复游戏触摸输入。见 ensureRoot 注释与 docs/research/fairgui.md 输入共存。
   */
  static setInputEnabled(on: boolean): void {
    const G = GRoot as unknown as { _inst?: GRoot };
    const ip = G._inst?.inputProcessor;
    if (ip) { ip.enabled = on; }
  }

  /** FairyGUI 组件根（由 `UIPackage.createObject(...).asCom` 传入）。 */
  protected readonly root: GComponent;

  constructor(root: GComponent) {
    this.root = root;
    // ⚠ 不在此调 bind()：`useDefineForClassFields`(Cocos 3.8 默认)下，子类字段声明会在 super() 之后
    //   被编译成 `this.xxx = undefined`，把 super 里 bind() 绑好的值清掉。故 bind 必须在**构造完成后**调
    //   （见 `create`/`fromComponent`）。
  }

  /** 子类实现（codegen 生成）：按 AUTO BIND 用 `getChild` 绑定字段。构造完成后由工厂调一次。 */
  protected abstract bind(): void;

  /** 用已建好的 FairyGUI 组件根构造并绑定（构造后调 bind，避开字段声明覆盖）。 */
  static fromComponent<V extends FguiView>(viewCtor: new (root: GComponent) => V, root: GComponent): V {
    const v = new viewCtor(root);
    v.bind();
    return v;
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
  protected onClick(obj: GObject, cb: () => void): void {
    obj.onClick(cb, this);
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

  /** 销毁：从父移除 + dispose FairyGUI 对象树。 */
  dispose(): void {
    this.root.removeFromParent();
    this.root.dispose();
  }

  /**
   * 预加载**跨包依赖**（共享库包）。跨包组件在 createObject 时惰性解析,fairygui **不会**自动从依赖表加载,
   * 缺失则静默降级成空占位。故引用了公司标准库（`Original` 包）组件的视图,须在 create 前先 ensurePackages 把
   * 那些包加载好（且发布成各自的 .bin 到 resources/ui）。缺失只 warn 不阻塞——面板照开,跨包件为空占位。
   * 共享库包加载后别 removePackage（其他视图也用),整个 app 生命周期常驻。
   */
  static ensurePackages(paths: string[]): Promise<void> {
    return Promise.all(paths.map((p) => new Promise<void>((resolve) => {
      const name = p.substring(p.lastIndexOf("/") + 1); // "ui/Original" → "Original"
      if (UIPackage.getByName(name)) { resolve(); return; }      // 已加载:复用(loadPackage 无幂等保护)
      UIPackage.loadPackage(p, (err: unknown) => {
        if (err) { console.warn(`[fgui] 共享库包 ${p} 未加载（发布 ${name}.bin 到 resources/ui 了吗？）:`, err); }
        resolve(); // 不 reject:缺失则跨包组件降级空占位,面板仍开
      });
    }))).then(() => undefined);
  }

  /**
   * 便捷工厂：加载包 → 创建组件 → new View（构造里 bind）。
   * `pkgPath` 是**发布到 `assets/resources/` 下**的包路径（如 `ui/Versus` ← `resources/ui/Versus.bin`）：
   * `UIPackage.loadPackage(path)` 无 bundle 参数时固定走 resources bundle（fairygui.mjs `bundle = bundle || resources`），
   * FGUI 编辑器发布路径须配 `.../assets/resources/ui`。已加载过的包直接复用（loadPackage 无幂等保护，
   * 重复调用会重下资源并覆盖注册表、泄漏旧包纹理——评审实证）。
   */
  static create<V extends FguiView>(
    viewCtor: new (root: GComponent) => V, pkgPath: string, pkg: string, comp: string,
  ): Promise<V> {
    const build = (resolve: (v: V) => void, reject: (e: Error) => void): void => {
      try {
        const obj = UIPackage.createObject(pkg, comp);
        if (!obj) { reject(new Error(`FairyGUI 组件不存在: ui://${pkg}/${comp}`)); return; }
        resolve(FguiView.fromComponent(viewCtor, obj.asCom)); // 构造后 bind——getChild 缺元素会抛,try/catch 兜住转 reject
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    return new Promise<V>((resolve, reject) => {
      if (UIPackage.getByName(pkg)) { build(resolve, reject); return; } // 已加载:直接建,防重载/泄漏
      UIPackage.loadPackage(pkgPath, (err: unknown) => {
        if (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
        build(resolve, reject);
      });
    });
  }
}
