/**
 * CocosView —— 纯 Cocos 节点页面的薄基类（`kind:"cocos"` 的 ViewMgr 页面，机械件）。
 *
 * 与 FguiView 并列：生命周期**同一套**（都在 ViewBase），差别只在渲染根——
 * FguiView 的根是 `GComponent`（由 UIPackage 创建），CocosView 的根是实例自建的 `Node`，
 * 挂载时接到 ViewMgr 层容器的 `.node` 下。FGUI 编辑器暂不可用时（或页面本就不需要 FGUI
 * 资源时），页面用本基类手搓节点。
 *
 * 判别信号：一个 `kind:"cocos"` 的 View 是不是「页面」，看它**有没有被某个 plugin 的
 * routes 引用**——被引用的进 ViewMgr catalog（本基类的适用范围），没被引用的是玩法表现件
 * （BallMoveView / SnakeWorldView，由 gameplay presentation 自行挂载）。⛔ 不新发明标记字段。
 *
 * 输入：interactive:true 表示模态交互页，须用 BlockInputEvents 等全屏屏障阻止点击穿透。
 * ViewMgr 按层级暂停被遮挡节点的系统事件，并切换全局 FGUI InputProcessor。
 * 非模态展示/玩法页保留 interactive:false。
 *
 * 尺寸：`mountToLayer` 按层容器当前尺寸铺满根节点（层容器自身经 FGUI Size relation 跟随
 * GRoot）。⚠ 已挂载期间的实时 resize 不跟随——FGUI relation 驱动不了裸 Node；GRoot 重建/
 * 页面重挂时会按新尺寸重新铺满。子类布局请读 `layerWidth/layerHeight`，⛔ 不写死像素。
 */
import { Button, Node, UITransform } from "cc";
import { ViewBase } from "./ViewBase";

export abstract class CocosView extends ViewBase {
  /** 页面根节点：与实例同寿命，dispose 时销毁；ViewMgr 之外 ⛔ 不要自行 addChild 到别处。 */
  protected readonly root: Node;
  /** 最近一次挂载时的层容器尺寸（设计像素）；子类按它做相对布局。 */
  protected layerWidth = 0;
  protected layerHeight = 0;
  private inputEnabled = true;
  private readonly disabledButtons = new Map<Button, boolean>();
  private readonly watchedNodes = new Set<Node>();
  private readonly watchedAncestors = new Set<Node>();
  private readonly refreshBlockedInput = (): void => {
    if (!this.inputEnabled) this.setInputEnabled(false);
  };
  private readonly trackInputNode = (node: Node): void => {
    if (this.watchedNodes.has(node)) return;
    this.watchedNodes.add(node);
    node.on("child-added", this.trackInputNode, this);
    node.on("child-removed", this.untrackInputNode, this);
    node.on("active-in-hierarchy-changed", this.refreshBlockedInput, this);
    if (!this.inputEnabled) this.applyNodeInput(node, false);
    for (const child of node.children) this.trackInputNode(child);
  };
  private readonly untrackInputNode = (node: Node): void => {
    node.off("child-added", this.trackInputNode, this);
    node.off("child-removed", this.untrackInputNode, this);
    node.off("active-in-hierarchy-changed", this.refreshBlockedInput, this);
    this.watchedNodes.delete(node);
    const button = node.getComponent(Button);
    if (button && this.disabledButtons.has(button)) {
      button.enabled = this.disabledButtons.get(button)!;
      this.disabledButtons.delete(button);
    }
    if (!this.inputEnabled) node.resumeSystemEvents();
    for (const child of node.children) this.untrackInputNode(child);
  };

  constructor() {
    super();
    // ⚠ 与 FguiView 同一条 useDefineForClassFields 约束：子类字段声明在 super() 之后才定义，
    //   故构造器里只建根节点，⛔ 不在此调用任何子类 build/bind（那些放 onCreate）。
    this.root = new Node(this.constructor.name);
    this.trackInputNode(this.root);
  }

  /**
   * ViewMgr 挂载入口：接到层容器节点下并按层尺寸铺满（非 fullscreen 页面只记录尺寸，
   * 自己在 onCreate/onOpen 里设 UITransform）。挂载失败由 ViewMgr 的 mount lease 回滚。
   */
  mountToLayer(parent: Node, width: number, height: number, fullscreen: boolean): void {
    this.unwatchAncestors();
    for (let ancestor: Node | null = parent; ancestor; ancestor = ancestor.parent) {
      ancestor.on("active-in-hierarchy-changed", this.refreshBlockedInput, this);
      this.watchedAncestors.add(ancestor);
    }
    this.layerWidth = width;
    this.layerHeight = height;
    this.root.layer = parent.layer;
    const transform = this.root.getComponent(UITransform) ?? this.root.addComponent(UITransform);
    if (fullscreen) {
      transform.width = width;
      transform.height = height;
    }
    // 层容器是 FGUI GComponent 的节点：锚点 (0,1)、原点在左上角（y 向下为负）。本页根节点锚点 (0.5,0.5)，
    // 直接放 (0,0) 会把页面中心钉在容器左上角、只露出右下四分之一（2026-09-05 Creator 预览实测）。
    // 按父节点锚点把根节点居中：父锚 (ax,ay) → 位置 ((0.5-ax)·W, (0.5-ay)·H)；无 UITransform 时按中心锚处理。
    const parentTransform = parent.getComponent(UITransform);
    const anchorX = parentTransform?.anchorX ?? 0.5;
    const anchorY = parentTransform?.anchorY ?? 0.5;
    this.root.setPosition((0.5 - anchorX) * width, (0.5 - anchorY) * height);
    parent.addChild(this.root);
  }

  /** 从父节点摘下但**不销毁**（permanent 页面 close 用；再次 open 直接重挂）。 */
  unmount(): void {
    this.unwatchAncestors();
    this.root.removeFromParent();
  }

  /** 在当前父节点内置顶（onlyOne 页面重复 open 时复用置顶）。 */
  bringToFront(): void {
    const parent = this.root.parent;
    if (parent) { this.root.setSiblingIndex(parent.children.length - 1); }
  }

  /** ViewMgr 在混合模态页面之间切换输入；不改变渲染可见性。 */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    for (const node of this.watchedNodes) this.applyNodeInput(node, enabled);
  }

  private applyNodeInput(node: Node, enabled: boolean): void {
    const button = node.getComponent(Button);
    if (button) {
      if (!enabled) {
        if (!this.disabledButtons.has(button)) {
          this.disabledButtons.set(button, button.enabled);
        }
        // Button.onDisable resets an in-flight press, preventing a delayed click after restoration.
        button.enabled = false;
      } else if (enabled && this.disabledButtons.has(button)) {
        button.enabled = this.disabledButtons.get(button)!;
        this.disabledButtons.delete(button);
      }
    }
    // Engine activation resets event processors; recursive pause can short-circuit at a paused root.
    if (enabled) node.resumeSystemEvents(false);
    else node.pauseSystemEvents(false);
  }

  private unwatchAncestors(): void {
    for (const node of this.watchedAncestors)
      node.off("active-in-hierarchy-changed", this.refreshBlockedInput, this);
    this.watchedAncestors.clear();
  }

  protected get acceptsInput(): boolean { return this.inputEnabled; }

  /** 释放渲染根：摘下并销毁节点树（世代关闭由 ViewBase.dispose 负责）。 */
  protected disposeRoot(): void {
    this.unwatchAncestors();
    this.untrackInputNode(this.root);
    try { this.root.removeFromParent(); } catch (e) {
      console.error("[CocosView] removeFromParent 异常", e);
    }
    try { this.root.destroy(); } catch (e) {
      console.error("[CocosView] root destroy 异常", e);
    }
  }
}
