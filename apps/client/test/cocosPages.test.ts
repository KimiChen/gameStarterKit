/**
 * 手搓 cocos 页面的「能跑能点」冒烟（PromoHomeView / SettingsView）。
 *
 * 这两个页面没有 FGUI 资源，节点全靠自己堆——所以最基本的判据是：挂载后能把节点树搭
 * 出来、按钮上真的挂了触摸回调、置灰的占位项**没有**回调、面板遮罩会吞掉指针（否则
 * 点在面板空白处会穿到首屏的设置按钮）。这些都是 Logic 单测覆盖不到的那一层。
 *
 * 与 viewLifecycle.test.ts 同法：先装一个最小 cc 适配层再 import 生产 View 模块。
 * node:test 默认每个测试文件独立子进程，模块级 patch 不会外溢。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

type LoaderModule = { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
type Listener = { type: string; callback: (...args: unknown[]) => unknown; target?: unknown };

class FakeNode {
  name: string;
  layer = 0;
  active = true;
  isValid = true;
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  x = 0;
  y = 0;
  position = { x: 0, y: 0, z: 0 };
  scale = { x: 1, y: 1, z: 1 };
  readonly listeners: Listener[] = [];
  private readonly components = new Map<unknown, unknown>();

  static EventType = {
    TOUCH_START: "touch-start",
    TOUCH_MOVE: "touch-move",
    TOUCH_END: "touch-end",
    TOUCH_CANCEL: "touch-cancel",
    SIZE_CHANGED: "size-changed",
  };

  constructor(name = "node") { this.name = name; }

  addChild(child: FakeNode): void {
    child.parent?.removeChild(child);
    this.children.push(child);
    child.parent = this;
  }

  removeChild(child: FakeNode): void {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    if (child.parent === this) child.parent = null;
  }

  removeFromParent(): void { this.parent?.removeChild(this); }
  setSiblingIndex(): void {}
  setPosition(x: number, y: number, z = 0): void {
    this.x = x;
    this.y = y;
    this.position = { x, y, z };
  }
  setScale(x: number, y: number, z = 1): void { this.scale = { x, y, z }; }

  getChildByName(name: string): FakeNode | null {
    return this.children.find((child) => child.name === name) ?? null;
  }

  getComponent(type: unknown): unknown { return this.components.get(type) ?? null; }

  addComponent(type: new () => unknown): unknown {
    const component = new type();
    (component as { node?: FakeNode }).node = this;
    this.components.set(type, component);
    return component;
  }

  on(type: string, callback: (...args: unknown[]) => unknown, target?: unknown): void {
    this.listeners.push({ type, callback, target });
  }

  off(type: string, callback: (...args: unknown[]) => unknown, target?: unknown): void {
    const index = this.listeners.findIndex((listener) =>
      listener.type === type && listener.callback === callback && listener.target === target);
    if (index >= 0) this.listeners.splice(index, 1);
  }

  destroy(): boolean {
    this.removeFromParent();
    this.isValid = false;
    for (const child of [...this.children]) child.destroy();
    this.listeners.length = 0;
    return true;
  }

  /** 深度优先收集自身与所有后代。 */
  flatten(): FakeNode[] {
    return [this as FakeNode, ...this.children.flatMap((child) => child.flatten())];
  }
}

class FakeUITransform { width = 0; height = 0; anchorX = 0.5; anchorY = 0.5; }
class FakeVec2 { constructor(public x = 0, public y = 0) {} }
class FakeMask {
  static Type = { GRAPHICS_RECT: 0 };
  type = FakeMask.Type.GRAPHICS_RECT;
}
class FakeScrollView {
  node!: FakeNode;
  content: FakeNode | null = null;
  horizontal = true;
  vertical = true;
  inertia = true;
  brake = 0.5;
  elastic = true;
  cancelInnerEvents = true;
  private offset = new FakeVec2();

  getScrollOffset(): FakeVec2 { return new FakeVec2(this.offset.x, this.offset.y); }
  getMaxScrollOffset(): FakeVec2 {
    const viewport = this.node.getComponent(FakeUITransform) as FakeUITransform;
    const content = this.content?.getComponent(FakeUITransform) as FakeUITransform | null;
    return new FakeVec2(
      Math.max(0, (content?.width ?? 0) - viewport.width),
      Math.max(0, (content?.height ?? 0) - viewport.height),
    );
  }
  scrollToOffset(offset: FakeVec2): void { this.offset = new FakeVec2(offset.x, offset.y); }
  scrollToTop(): void { this.offset = new FakeVec2(); }
  stopAutoScroll(): void {}
}
class FakeLabel {
  static HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 };
  static VerticalAlign = { TOP: 0, CENTER: 1, BOTTOM: 2 };
  static Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };
  string = ""; fontSize = 0; color: unknown = null; horizontalAlign = 1; verticalAlign = 0;
  lineHeight = 40; overflow = 0; enableWrapText = true; isBold = false;
}
class FakeGraphics {
  fillColor: unknown = null;
  strokeColor: unknown = null;
  lineWidth = 0;
  readonly rects: Array<[number, number, number, number]> = [];
  clear(): void {}
  rect(x: number, y: number, width: number, height: number): void { this.rects.push([x, y, width, height]); }
  fill(): void {}
  stroke(): void {}
}
class FakeColor {
  constructor(readonly r = 0, readonly g = 0, readonly b = 0, readonly a = 255) {}
}

class FakeSpriteFrame {
  texture: unknown = null;
  rect: { width: number; height: number } = { width: 2, height: 2 };
  /** ⚠ 引擎默认 true；⛔ 纯色帧必须置 false，否则动态图集打包时会打崩渲染循环。 */
  packable = true;
  insetTop = 0;
  insetBottom = 0;
  insetLeft = 0;
  insetRight = 0;
}

class FakeRect {
  constructor(readonly x = 0, readonly y = 0, readonly width = 0, readonly height = 0) {}
}

class FakeTexture2D {
  data: Uint8Array | null = null;
  constructor(public width = 2, public height = 2) {}
  reset(info: { width: number; height: number }): void {
    this.width = info.width;
    this.height = info.height;
  }
  uploadData(source: Uint8Array): void { this.data = source; }
}

/**
 * ⚠ 复刻引擎契约：`sizeMode` 为默认的 TRIMMED 时，赋 `spriteFrame` 会用 `frame.rect` 覆写
 * UITransform 尺寸；事后再设 CUSTOM ⛔ 不回滚。S5-05 F7 就是踩了这个顺序——衣柜预览条被
 * 覆写成 420×132、溢出面板并压住文字。假件必须同形，否则同类回归照样全绿。
 */
class FakeSprite {
  static readonly SizeMode = { CUSTOM: 0, TRIMMED: 1, RAW: 2 };
  static readonly Type = { SIMPLE: 0, SLICED: 1, TILED: 2, FILLED: 3 };

  node!: FakeNode;
  color: unknown = null;
  sizeMode: number = FakeSprite.SizeMode.TRIMMED;
  type: number = FakeSprite.Type.SIMPLE;
  private frame: FakeSpriteFrame | null = null;

  get spriteFrame(): FakeSpriteFrame | null { return this.frame; }

  set spriteFrame(value: FakeSpriteFrame | null) {
    this.frame = value;
    if (!value || this.sizeMode !== FakeSprite.SizeMode.TRIMMED) return;
    const transform = this.node?.getComponent(FakeUITransform) as FakeUITransform | null;
    if (transform) {
      transform.width = value.rect.width;
      transform.height = value.rect.height;
    }
  }
}

const sharedWhiteTexture = new FakeTexture2D();

const cc = {
  Node: FakeNode,
  UITransform: FakeUITransform,
  Vec2: FakeVec2,
  Mask: FakeMask,
  ScrollView: FakeScrollView,
  Label: FakeLabel,
  Graphics: FakeGraphics,
  Sprite: FakeSprite,
  SpriteFrame: FakeSpriteFrame,
  Rect: FakeRect,
  Texture2D: FakeTexture2D,
  Color: FakeColor,
  builtinResMgr: { get: (_name: string) => sharedWhiteTexture },
};

let loaded: {
  PromoHomeView: any;
  SettingsView: any;
} | null = null;

async function loadViews() {
  if (loaded) return loaded;
  const require = createRequire(import.meta.url);
  const moduleApi = require("node:module") as LoaderModule;
  const originalLoad = moduleApi._load;
  moduleApi._load = function patchedLoad(request, parent, isMain): unknown {
    if (request === "cc") return cc;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const [{ PromoHomeView }, { SettingsView }] = await Promise.all([
      import("../src/view/PromoHomeView"),
      import("../src/view/SettingsView"),
    ]);
    loaded = { PromoHomeView, SettingsView };
    return loaded;
  } finally {
    moduleApi._load = originalLoad;
  }
}

/** 走完 ViewMgr 的事务序：runCreate → mountToLayer → runOpen。 */
async function openPage(view: any, width = 750, height = 1624): Promise<FakeNode> {
  const context = view.beginLifecycle(1);
  await view.runCreate(context);
  view.mountToLayer(new FakeNode("layer_base"), width, height, true);
  await view.runOpen(context);
  return (view as { root: FakeNode }).root;
}

function labels(root: FakeNode): string[] {
  return root.flatten()
    .map((node) => node.getComponent(FakeLabel) as FakeLabel | null)
    .filter((label): label is FakeLabel => label !== null)
    .map((label) => label.string);
}

function named(root: FakeNode, name: string): FakeNode {
  const result = root.flatten().find((node) => node.name === name);
  assert.ok(result, `页面缺少节点 ${name}`);
  return result;
}

function spritesOf(root: FakeNode): FakeSprite[] {
  return root.flatten()
    .map((node) => node.getComponent(FakeSprite))
    .filter((sprite): sprite is FakeSprite => sprite instanceof FakeSprite);
}

function tapAll(nodes: readonly FakeNode[]): void {
  for (const node of nodes) {
    for (const listener of node.listeners) {
      if (listener.type === FakeNode.EventType.TOUCH_END) listener.callback.call(listener.target);
    }
  }
}

test("PromoHomeView：挂载后节点树可用，首屏唯一可点节点是设置按钮", async () => {
  const { PromoHomeView } = await loadViews();
  const { PromoHomeLogic } = await import("../src/logic/page/PromoHomeLogic");
  const view = new PromoHomeView();
  const root = await openPage(view);

  const logic = new PromoHomeLogic();
  logic.setSession({ serverName: "区9", userId: "u-1", profile: { stamina: 100, wins: 2, losses: 0 } });
  let opened = 0;
  logic.onOpenSettings = () => { opened++; };
  view.setup(logic);

  const rendered = labels(root);
  const model = logic.model();
  for (const line of [model.title, model.subtitle, model.runtimeLine, model.sessionLine, model.settingsLabel]) {
    assert.ok(rendered.includes(line), `首屏必须渲染出「${line}」`);
  }

  const tappable = root.flatten().filter((node) =>
    node.listeners.some((listener) => listener.type === FakeNode.EventType.TOUCH_END));
  assert.equal(tappable.length, 1, "宣传首屏只应有设置按钮一个可点节点（⛔ 不摆玩法入口）");
  assert.equal(tappable[0].name, "btn-settings");
  tapAll(tappable);
  assert.equal(opened, 1, "点设置按钮必须走 PromoHomeLogic.openSettings");

  view.dispose();
  assert.equal(root.isValid, false, "关闭必须销毁自建节点树");
});

interface SettingsFixture {
  logic: any;
  patches: Array<Record<string, boolean>>;
  launched: string[];
}

async function makeSettingsLogic(): Promise<SettingsFixture> {
  const { SettingsLogic } = await import("../src/logic/page/SettingsLogic");
  const patches: Array<Record<string, boolean>> = [];
  const launched: string[] = [];
  const logic = new SettingsLogic({
    updateProfile: async (patch) => { patches.push(patch as Record<string, boolean>); },
    availabilityOf: (pluginId) => (pluginId === "broken" ? "failed" : "available"),
  });
  logic.setProfile({ musicOn: true, sfxOn: true });
  logic.setEntries([
    { entryId: "ok", pluginId: "alpha", label: "可用玩法", launch: () => { launched.push("ok"); } },
    { entryId: "bad", pluginId: "broken", label: "坏掉的玩法", launch: () => { launched.push("bad"); } },
  ]);
  return { logic, patches, launched };
}

test("SettingsView：系统设置和玩法入口分区双列；置灰占位卡片没有点击回调", async () => {
  const { SettingsView } = await loadViews();
  const view = new SettingsView();
  const root = await openPage(view);
  const { logic } = await makeSettingsLogic();
  view.setup(logic);

  const rendered = labels(root);
  for (const line of ["设置", "系统设置", "玩法入口", "通用设置", "可用玩法", "坏掉的玩法", "重试"]) {
    assert.ok(rendered.includes(line), `设置面板必须渲染出「${line}」`);
  }
  assert.ok(!rendered.includes("关闭"), "关闭入口应使用 X 图标");
  assert.ok(!rendered.some((line) => line.includes("alpha") || line.includes("broken")),
    "入口标题面向玩家展示，不拼接内部 pluginId");
  assert.ok(!rendered.includes("音乐"), "音频开关由通用设置子页承载");
  for (const item of logic.placeholders()) {
    assert.ok(rendered.includes(item.label), `占位项 ${item.id} 必须有标题`);
    assert.ok(!rendered.includes(item.reason), `占位项 ${item.id} 不直接展示技术实现说明`);
  }

  const placeholderRows = root.flatten().filter((node) => node.name === "row-placeholder");
  assert.equal(placeholderRows.length, logic.placeholders().length);
  for (const row of placeholderRows) {
    assert.equal(row.flatten().some((node) => node.listeners.length > 0), false,
      "置灰占位项不得挂任何点击回调");
    assert.ok(labels(row).length >= 2, "未开放卡片需要标题与简洁状态说明");
  }

  const general = named(root, "btn-general");
  assert.ok(placeholderRows.some((node) => node.y === general.y && node.x > general.x),
    "系统卡片应按双列排列");
  const enabled = named(root, "card-ok");
  const failed = named(root, "card-bad");
  const cardSize = enabled.getComponent(FakeUITransform) as FakeUITransform;
  assert.ok(cardSize.width > 200 && cardSize.height > 80,
    "卡片必须保留布局尺寸，不能被 96×96 的纹理帧覆写");
  assert.equal(enabled.y, failed.y, "相邻玩法入口应在同一行");
  assert.ok(enabled.x < failed.x, "玩法入口应按稳定顺序从左至右排列");
  assert.ok(enabled.y < Math.min(general.y, ...placeholderRows.map((node) => node.y)),
    "玩法入口必须在系统设置区域下方");
  view.dispose();
});

test("设置表面和图标使用缓存 SpriteFrame，纯色底板不逐块分配 Graphics", async () => {
  // Creator 3.8.8 每个 Graphics 组件都有独占的显存缓冲和 draw call。程序绘制纹理后复用
  // SpriteFrame；允许 panel/card/icon 各有自己的帧，限制的是同款卡片逐次 new 帧的回归。
  const { SettingsView, PromoHomeView } = await loadViews();
  for (const Page of [SettingsView, PromoHomeView]) {
    const view = new Page();
    const root = await openPage(view);
    const fixture = await makeSettingsLogic();
    if (Page === SettingsView) view.setup(fixture.logic);

    const graphics = root.flatten().filter((node) => node.getComponent(FakeGraphics));
    assert.equal(graphics.length, 0,
      `${Page.name}：面板和卡片底板不得逐块使用 Graphics`);

    const sprites = spritesOf(root);
    assert.ok(sprites.length > 0, `${Page.name}：底板必须建出 Sprite`);
    if (Page === PromoHomeView) {
      assert.equal(new Set(sprites.map((sprite) => sprite.spriteFrame)).size, 1,
        "PromoHomeView 的纯色底板应共用内置白图帧");
    } else {
      const firstFrames = new Set(sprites.map((sprite) => sprite.spriteFrame));
      fixture.logic.onChanged();
      for (const sprite of spritesOf(root)) {
        assert.ok(firstFrames.has(sprite.spriteFrame), "同一数据重绘应复用已缓存的表面与图标帧");
      }
      const placeholderSprites = root.flatten()
        .filter((node) => node.name === "row-placeholder")
        .map((row) => spritesOf(row)[0]);
      assert.ok(placeholderSprites.length > 1);
      assert.equal(new Set(placeholderSprites.map((sprite) => sprite.spriteFrame)).size, 1,
        "同款占位卡片必须共用同一个底板 SpriteFrame");
    }
    for (const sprite of sprites) {
      const frame = sprite.spriteFrame;
      assert.equal(frame?.packable, false,
        `${Page.name}：程序生成帧必须 packable=false，避免动态图集处理原始像素失败`);
      assert.ok(frame?.texture, `${Page.name}：SpriteFrame 必须绑定真实纹理`);
      const texture = frame?.texture as FakeTexture2D;
      if (texture !== sharedWhiteTexture) {
        assert.equal(texture.data?.length, texture.width * texture.height * 4,
          "程序纹理必须上传完整 RGBA 数据");
        assert.ok(texture.data?.some((value, index) => index % 4 === 3 && value > 0),
          "程序纹理必须包含可见像素，不能只创建一个空纹理");
      }
      const transform = sprite.node.getComponent(FakeUITransform) as FakeUITransform;
      assert.equal(sprite.sizeMode, FakeSprite.SizeMode.CUSTOM,
        `${Page.name}：Sprite 必须保留布局尺寸`);
      assert.ok(transform.width > 2 && transform.height > 2,
        `${Page.name}：底板尺寸不能被内置白图覆写成 2×2`);
    }
    view.dispose();
  }
});

test("SettingsView：遮罩参与命中测试，⛔ 不让指针穿到底下的首屏", async () => {
  const { SettingsView } = await loadViews();
  const view = new SettingsView();
  const root = await openPage(view, 750, 1624);
  view.setup((await makeSettingsLogic()).logic);

  const scrim = root.flatten().find((node) => node.name === "scrim");
  assert.ok(scrim, "面板必须有一层全屏遮罩");
  const transform = scrim.getComponent(FakeUITransform) as FakeUITransform | null;
  assert.deepEqual([transform?.width, transform?.height], [750, 1624], "遮罩必须铺满整层");
  assert.equal(scrim.listeners.filter((item) => item.type === FakeNode.EventType.TOUCH_END).length, 1,
    "遮罩必须注册触摸回调才会进入命中候选——没有监听的色块挡不住任何东西");
  // 空回调：吞掉就完了，⛔ 不得顺手做别的事（比如偷偷关闭面板）。
  let closes = 0;
  view.onClose = () => { closes++; };
  tapAll([scrim]);
  assert.equal(closes, 0, "遮罩的吞噬回调必须是纯空操作");
});

test("SettingsView：整卡进入、不可用入口重试以及关闭按钮接入真实回调", async () => {
  const { SettingsView } = await loadViews();
  const view = new SettingsView();
  const root = await openPage(view);
  const fixture = await makeSettingsLogic();
  view.setup(fixture.logic);

  let closes = 0;
  view.onClose = () => { closes++; };
  tapAll([named(root, "btn-关闭")]);
  assert.equal(closes, 1, "关闭按钮必须调用 opener 注入的 onClose");

  tapAll([named(root, "card-ok")]);
  await Promise.resolve();
  assert.deepEqual(fixture.launched, ["ok"], "点击卡片任何可命中区域都应进入玩法");
  const failed = named(root, "card-bad");
  assert.equal(failed.listeners.length, 0, "不可用卡片只允许显式重试");
  tapAll([named(root, "btn-重试")]);
  await Promise.resolve();
  assert.deepEqual(fixture.launched, ["ok", "bad"], "不可用条目的重试必须走 launch 通道");
  view.dispose();
});

test("SettingsView：通用设置子页保存音频偏好，返回后再次打开保留状态", async () => {
  const { SettingsView } = await loadViews();
  const view = new SettingsView();
  const root = await openPage(view);
  const fixture = await makeSettingsLogic();
  view.setup(fixture.logic);

  tapAll([named(root, "btn-general")]);
  const rendered = labels(root);
  for (const line of ["通用设置", "音乐", "音效"]) assert.ok(rendered.includes(line));
  assert.equal(root.flatten().filter((node) => node.name === "row-audio").length, 2);
  assert.ok(!rendered.includes("可用玩法"), "详情页只呈现通用设置内容");
  tapAll([named(root, "btn-musicOn")]);
  await Promise.resolve();
  await Promise.resolve();
  tapAll([named(root, "btn-sfxOn")]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(fixture.patches, [{ musicOn: false }, { sfxOn: false }],
    "两个开关必须保存各自的 profile 偏好");
  assert.deepEqual(fixture.logic.audioToggles().map((item: { on: boolean }) => item.on), [false, false]);

  tapAll([named(root, "btn-back")]);
  assert.ok(labels(root).includes("玩法入口"), "返回后重新展示主菜单");
  tapAll([named(root, "btn-general")]);
  assert.deepEqual(fixture.logic.audioToggles().map((item: { on: boolean }) => item.on), [false, false],
    "重开通用设置不能重置已保存偏好");
  view.dispose();
});

test("SettingsView：长列表保持卡片高度、启用原生纵向裁剪滚动，重绘保留位置", async () => {
  const { SettingsView } = await loadViews();
  const view = new SettingsView();
  const root = await openPage(view, 750, 1000);
  const fixture = await makeSettingsLogic();
  view.setup(fixture.logic);
  const originalCardHeight = (named(root, "card-ok").getComponent(FakeUITransform) as FakeUITransform).height;

  fixture.logic.setEntries(Array.from({ length: 30 }, (_, index) => ({
    entryId: `entry-${index}`, pluginId: `plugin-${String(index).padStart(2, "0")}`,
    label: `玩法 ${index + 1}`, launch: () => {},
  })));
  fixture.logic.onChanged();
  const scroll = root.flatten().map((node) => node.getComponent(FakeScrollView))
    .find((component): component is FakeScrollView => component instanceof FakeScrollView);
  assert.ok(scroll, "长列表必须使用 Cocos ScrollView");
  assert.equal(scroll.horizontal, false);
  assert.equal(scroll.vertical, true);
  assert.equal(scroll.cancelInnerEvents, true, "拖动滚动内容不能误触玩法卡片");
  assert.ok(root.flatten().some((node) => node.getComponent(FakeMask)), "滚动视口必须裁剪越界内容");
  assert.ok(scroll.content);
  const contentTransform = scroll.content.getComponent(FakeUITransform) as FakeUITransform;
  assert.equal(contentTransform.anchorY, 1, "滚动内容以顶边定位，首次打开不能落在列表中间");
  assert.ok(scroll.getMaxScrollOffset().y > 0, "超高内容必须产生实际可滚动空间");
  for (let index = 0; index < 30; index++) {
    const transform = named(root, `card-entry-${index}`).getComponent(FakeUITransform) as FakeUITransform;
    assert.equal(transform.height, originalCardHeight, "增加入口只能增加内容高度，不压缩卡片");
  }

  scroll.scrollToOffset(new FakeVec2(0, 240));
  fixture.logic.onChanged();
  assert.equal(scroll.getScrollOffset().y, 240, "运行时状态更新不应把列表跳回顶端");
  tapAll([named(root, "btn-general")]);
  assert.equal(scroll.getScrollOffset().y, 0, "打开详情应从顶部开始");
  tapAll([named(root, "btn-back")]);
  assert.equal(scroll.getScrollOffset().y, 240, "返回主菜单应恢复进入详情前的位置");
  view.dispose();
});

test("SettingsView：更换 Logic 与关闭后解除重绘订阅", async () => {
  const { SettingsView } = await loadViews();
  const view = new SettingsView();
  const root = await openPage(view);
  const previous = await makeSettingsLogic();
  const current = await makeSettingsLogic();
  view.setup(previous.logic);
  view.setup(current.logic);
  const parent = root.parent!;
  assert.equal(parent.listeners.filter((item) => item.type === FakeNode.EventType.SIZE_CHANGED).length, 1,
    "打开期间需要监听宿主尺寸变化");
  const unchangedCard = named(root, "card-ok");
  previous.logic.onChanged();
  assert.equal(named(root, "card-ok"), unchangedCard, "换绑后旧 Logic 不应继续触发重绘");
  await view.closeLifecycle();
  assert.equal(parent.listeners.filter((item) => item.type === FakeNode.EventType.SIZE_CHANGED).length, 0,
    "退出后必须解绑宿主尺寸监听");
  current.logic.onChanged();
  assert.equal(named(root, "card-ok"), unchangedCard, "页面退出后重绘钩子应解绑");
  view.dispose();
  assert.doesNotThrow(() => current.logic.onChanged(), "异步写入结束不应重建已销毁节点");
});

test("CocosView：挂到 FGUI 层容器（锚点 (0,1)、原点左上）时根节点按父锚居中，⛔ 不再钉在左上角", async () => {
  // 2026-09-05 Creator 预览实测：层容器是 FGUI GComponent 节点（anchor (0,1)），页面根节点 (0.5,0.5) 放 (0,0)
  // 只露出右下四分之一。父锚 (ax,ay) → 根位置 ((0.5-ax)·W, (0.5-ay)·H)。
  const { PromoHomeView } = await loadViews();
  const fguiLayer = new FakeNode("layer_base");
  const transform = fguiLayer.addComponent(FakeUITransform) as FakeUITransform;
  transform.anchorX = 0;
  transform.anchorY = 1;
  const view = new PromoHomeView();
  const context = view.beginLifecycle(1);
  await view.runCreate(context);
  view.mountToLayer(fguiLayer, 750, 1624, true);
  const root = (view as unknown as { root: FakeNode }).root;
  assert.equal(root.parent, fguiLayer);
  assert.deepEqual([root.x, root.y], [375, -812], "父锚 (0,1)：根节点中心须落在容器中心 (W/2, -H/2)");

  // 中心锚 / 无 UITransform 的父节点：保持 (0,0)（既有无头用例的口径）。
  const centered = new FakeNode("layer_center");
  const other = new PromoHomeView();
  await other.runCreate(other.beginLifecycle(1));
  other.mountToLayer(centered, 750, 1624, true);
  const otherRoot = (other as unknown as { root: FakeNode }).root;
  assert.deepEqual([otherRoot.x, otherRoot.y], [0, 0]);
});
