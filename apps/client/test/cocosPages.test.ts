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
  isValid = true;
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  x = 0;
  y = 0;
  readonly listeners: Listener[] = [];
  private readonly components = new Map<unknown, unknown>();

  static EventType = {
    TOUCH_START: "touch-start",
    TOUCH_MOVE: "touch-move",
    TOUCH_END: "touch-end",
    TOUCH_CANCEL: "touch-cancel",
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
  setPosition(x: number, y: number): void { this.x = x; this.y = y; }

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

  off(): void {}

  destroy(): boolean {
    this.removeFromParent();
    this.isValid = false;
    return true;
  }

  /** 深度优先收集自身与所有后代。 */
  flatten(): FakeNode[] {
    return [this as FakeNode, ...this.children.flatMap((child) => child.flatten())];
  }
}

class FakeUITransform { width = 0; height = 0; anchorX = 0.5; anchorY = 0.5; }
class FakeLabel {
  static HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 };
  static VerticalAlign = { TOP: 0, CENTER: 1, BOTTOM: 2 };
  static Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };
  string = ""; fontSize = 0; color: unknown = null; horizontalAlign = 1; verticalAlign = 0;
  lineHeight = 40; overflow = 0; enableWrapText = true;
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
}

class FakeRect {
  constructor(readonly x = 0, readonly y = 0, readonly width = 0, readonly height = 0) {}
}

class FakeTexture2D { constructor(readonly width = 2, readonly height = 2) {} }

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

  const tappable = root.flatten().filter((node) => node.listeners.length > 0);
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

test("SettingsView：两个区块都画出来；置灰占位项 ⛔ 没有任何点击回调", async () => {
  const { SettingsView } = await loadViews();
  const view = new SettingsView();
  const root = await openPage(view);
  const { logic } = await makeSettingsLogic();
  view.setup(logic);

  const rendered = labels(root);
  for (const line of ["设置", "关闭", "音乐", "音效", "可用玩法  ·  alpha", "坏掉的玩法  ·  broken", "重试", "进入"]) {
    assert.ok(rendered.includes(line), `设置面板必须渲染出「${line}」`);
  }
  for (const item of logic.placeholders()) {
    assert.ok(rendered.includes(item.label), `占位项 ${item.id} 必须有标题`);
    assert.ok(rendered.includes(item.reason), `占位项 ${item.id} 必须把未实现原因画出来`);
  }

  const placeholderRows = root.flatten().filter((node) => node.name === "row-placeholder");
  assert.equal(placeholderRows.length, logic.placeholders().length);
  for (const row of placeholderRows) {
    assert.equal(row.flatten().some((node) => node.listeners.length > 0), false,
      "置灰占位项 ⛔ 不得挂任何点击回调（点不动 = 没实现，⛔ 不做假实现）");
  }
});

test("纯色底板必须走可合批的 Sprite，⛔ 不再每块一个 Graphics", async () => {
  // ⚠ 判据来自真机实测（Creator 3.8.8，CDP 读引擎 profiler）：**每个 Graphics 组件固定占用
  // 约 2.25MB 显存缓冲**，与画多少内容无关，且各自一个 draw call。三点完全线性：
  // 首屏 3 个 → 6.8MB / 9 draw call；设置 25 个 → 56.3MB / 59；衣柜 50 个 → 112.6MB / 116。
  // ⛔ 别把这条弱化成「底板存在」——那正是问题潜伏了这么久的原因。
  const { SettingsView, PromoHomeView } = await loadViews();
  for (const Page of [SettingsView, PromoHomeView]) {
    const view = new Page();
    const root = await openPage(view);
    if (Page === SettingsView) view.setup((await makeSettingsLogic()).logic);

    const nodes = root.flatten();
    const graphics = nodes.filter((node) => node.getComponent(FakeGraphics));
    assert.equal(graphics.length, 0,
      `${Page.name}：纯色矩形 ⛔ 不得再用 Graphics（每个约 2.25MB 显存 + 独占 draw call）`);

    const sprites = nodes
      .map((node) => node.getComponent(FakeSprite) as FakeSprite | null)
      .filter((sprite): sprite is FakeSprite => sprite !== null);
    assert.ok(sprites.length > 0, `${Page.name}：底板必须真的建出 Sprite，否则上面那条恒真`);
    // 共用同一张 SpriteFrame 才可能合批。⚠ 坦白：这条**无法用变异证伪**——引擎的
    // builtinResMgr.get 本身就返回同一个缓存资源，忠实的假件也如此，所以 uiPlate 里那层
    // 模块级缓存去掉后本条仍为真。它守的是另一种改法：有人改成每块底板 new SpriteFrame()。
    // ⛔ 不要为了让它可变异而把假件改成每次返回新对象——假件失真正是这一串缺陷的病根。
    const frames = new Set(sprites.map((sprite) => sprite.spriteFrame));
    assert.equal(frames.size, 1, `${Page.name}：所有底板必须共用同一张内置白图才能合批`);
    // ⛔ 底板帧必须关掉动态图集打包。⚠ 这条守的是一个**会让整个渲染循环当场死掉**的缺陷：
    // 引擎内置帧的 packable 为 true，而它的 ImageAsset.data 是 Uint8Array 不是 HTMLImageElement，
    // 动态图集调 texSubImage2D 会抛 TypeError，画面定格、帧数不再推进。真机正向对照已实测。
    // Node 侧测不出崩溃本身，只能钉住这个字段——⛔ 别因为「看起来无关」就删掉。
    for (const sprite of sprites) {
      const frame = sprite.spriteFrame as FakeSpriteFrame | null;
      assert.equal(frame?.packable, false,
        `${Page.name}：底板帧必须 packable=false，否则动态图集打包会打崩渲染循环`);
      assert.ok(frame?.texture, `${Page.name}：底板帧必须绑上白图纹理，⛔ 空纹理什么都画不出来`);
    }
    // 尺寸不得被 2×2 的白图覆写——这是 createSolidPlate 里「先 CUSTOM 再赋帧」那条顺序的闸。
    for (const sprite of sprites) {
      const transform = sprite.node.getComponent(FakeUITransform) as FakeUITransform;
      assert.ok(transform.width > 2 && transform.height > 2,
        `${Page.name}：底板尺寸被白图 rect 覆写成 ${transform.width}×${transform.height}——`
        + "sizeMode 必须在赋 spriteFrame 之前设成 CUSTOM");
    }
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

test("SettingsView：按钮真的接上 Logic（关闭 / 音频开关 / 不可用条目重试）", async () => {
  const { SettingsView } = await loadViews();
  const view = new SettingsView();
  const root = await openPage(view);
  const fixture = await makeSettingsLogic();
  view.setup(fixture.logic);

  let closes = 0;
  view.onClose = () => { closes++; };
  const buttonNamed = (name: string): FakeNode[] =>
    root.flatten().filter((node) => node.name === name && node.listeners.length > 0);

  tapAll(buttonNamed("btn-关闭"));
  assert.equal(closes, 1, "关闭按钮必须回到 opener 注入的 onClose");

  // 音频开关：两行各一个「开」按钮，点第一个即写 musicOn。
  const audioButtons = root.flatten()
    .filter((node) => node.parent?.name === "row-audio" && node.listeners.length > 0);
  assert.equal(audioButtons.length, 2, "音乐/音效各一个开关按钮");
  tapAll([audioButtons[0]]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(fixture.patches, [{ musicOn: false }], "点音乐开关必须发出对应的幂等写");

  tapAll(buttonNamed("btn-重试"));
  await Promise.resolve();
  assert.deepEqual(fixture.launched, ["bad"], "不可用条目的重试必须走 launch 通道");
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
