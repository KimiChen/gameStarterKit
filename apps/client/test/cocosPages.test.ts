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

class FakeUITransform { width = 0; height = 0; }
class FakeLabel { string = ""; fontSize = 0; color: unknown = null; }
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

const cc = {
  Node: FakeNode,
  UITransform: FakeUITransform,
  Label: FakeLabel,
  Graphics: FakeGraphics,
  Color: FakeColor,
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
    availabilityOf: (featureId) => (featureId === "broken" ? "failed" : "available"),
  });
  logic.setProfile({ musicOn: true, sfxOn: true });
  logic.setEntries([
    { entryId: "ok", featureId: "alpha", label: "可用玩法", launch: () => { launched.push("ok"); } },
    { entryId: "bad", featureId: "broken", label: "坏掉的玩法", launch: () => { launched.push("bad"); } },
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
