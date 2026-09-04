/**
 * CocosView —— 纯 Cocos 节点页面的薄基类（`kind:"cocos"` 的 ViewMgr 页面，机械件）。
 *
 * 与 FguiView 并列：生命周期**同一套**（都在 ViewBase），差别只在渲染根——
 * FguiView 的根是 `GComponent`（由 UIPackage 创建），CocosView 的根是实例自建的 `Node`，
 * 挂载时接到 ViewMgr 层容器的 `.node` 下。FGUI 编辑器暂不可用时（或页面本就不需要 FGUI
 * 资源时），页面用本基类手搓节点。
 *
 * 判别信号：一个 `kind:"cocos"` 的 View 是不是「页面」，看它**有没有被某个 feature 的
 * routes 引用**——被引用的进 ViewMgr catalog（本基类的适用范围），没被引用的是玩法表现件
 * （BallMoveView / SnakeWorldView，由 gameplay presentation 自行挂载）。⛔ 不新发明标记字段。
 *
 * 输入：cocos 页面在 sidecar 里声明 `interactive: false`——FGUI 的 InputProcessor 一旦启用就
 * 全屏吞指针（见 FguiView.ensureRoot 注释），自建节点上的 Cocos 事件就再也收不到了。
 * 需要 FGUI 模态的 cocos 页面另行讨论，本基类不提供。
 *
 * 尺寸：`mountToLayer` 按层容器当前尺寸铺满根节点（层容器自身经 FGUI Size relation 跟随
 * GRoot）。⚠ 已挂载期间的实时 resize 不跟随——FGUI relation 驱动不了裸 Node；GRoot 重建/
 * 页面重挂时会按新尺寸重新铺满。子类布局请读 `layerWidth/layerHeight`，⛔ 不写死像素。
 */
import { Node, UITransform } from "cc";
import { ViewBase } from "./ViewBase";

export abstract class CocosView extends ViewBase {
  /** 页面根节点：与实例同寿命，dispose 时销毁；ViewMgr 之外 ⛔ 不要自行 addChild 到别处。 */
  protected readonly root: Node;
  /** 最近一次挂载时的层容器尺寸（设计像素）；子类按它做相对布局。 */
  protected layerWidth = 0;
  protected layerHeight = 0;

  constructor() {
    super();
    // ⚠ 与 FguiView 同一条 useDefineForClassFields 约束：子类字段声明在 super() 之后才定义，
    //   故构造器里只建根节点，⛔ 不在此调用任何子类 build/bind（那些放 onCreate）。
    this.root = new Node(this.constructor.name);
  }

  /**
   * ViewMgr 挂载入口：接到层容器节点下并按层尺寸铺满（非 fullscreen 页面只记录尺寸，
   * 自己在 onCreate/onOpen 里设 UITransform）。挂载失败由 ViewMgr 的 mount lease 回滚。
   */
  mountToLayer(parent: Node, width: number, height: number, fullscreen: boolean): void {
    this.layerWidth = width;
    this.layerHeight = height;
    this.root.layer = parent.layer;
    const transform = this.root.getComponent(UITransform) ?? this.root.addComponent(UITransform);
    if (fullscreen) {
      transform.width = width;
      transform.height = height;
    }
    this.root.setPosition(0, 0);
    parent.addChild(this.root);
  }

  /** 从父节点摘下但**不销毁**（permanent 页面 close 用；再次 open 直接重挂）。 */
  unmount(): void {
    this.root.removeFromParent();
  }

  /** 在当前父节点内置顶（onlyOne 页面重复 open 时复用置顶）。 */
  bringToFront(): void {
    const parent = this.root.parent;
    if (parent) { this.root.setSiblingIndex(parent.children.length - 1); }
  }

  /** 释放渲染根：摘下并销毁节点树（世代关闭由 ViewBase.dispose 负责）。 */
  protected disposeRoot(): void {
    try { this.root.removeFromParent(); } catch (e) {
      console.error("[CocosView] removeFromParent 异常", e);
    }
    try { this.root.destroy(); } catch (e) {
      console.error("[CocosView] root destroy 异常", e);
    }
  }
}
