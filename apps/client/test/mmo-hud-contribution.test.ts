import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { resolveHudContribution } from "../src/kits/mmo/api/content/hud";
import type { IMmoHudContext, MmoWorldViewModel } from "../src/kits/mmo/api/content/index";

test("HUD贡献：按pack选择、缺席回退、跨插件包/重复/非法入口拒绝", () => {
    const module = { packId: "pack-a", load: async () => ({ create: () => ({ mount() {}, render() {}, unmount() {} }) }) };
    const owners = new Map([["pack-a", "alpha"], ["pack-b", "beta"]]);
    const entries = [{ pluginId: "alpha", value: module }];
    assert.equal(resolveHudContribution("pack-a", entries, owners), module);
    assert.equal(resolveHudContribution("pack-b", entries, owners), null);
    assert.throws(() => resolveHudContribution("pack-a", [{ pluginId: "beta", value: module }], owners), /自有内容包/u);
    assert.throws(() => resolveHudContribution("pack-a", [...entries, ...entries], owners), /重复/u);
    assert.throws(() => resolveHudContribution("pack-a", [{ pluginId: "alpha", value: { packId: "pack-a" } }], owners), /非法/u);
});

class FakeNode {
    static readonly EventType = { TOUCH_START: "start", TOUCH_MOVE: "move", TOUCH_END: "end", TOUCH_CANCEL: "cancel" };
    readonly children: FakeNode[] = [];
    readonly components: unknown[] = [];
    parent: FakeNode | null = null;
    layer = 1;
    destroyed = false;
    constructor(readonly name: string) {}
    addChild(child: FakeNode): void { child.parent = this; this.children.push(child); }
    addComponent<T>(klass: new () => T): T { const component = new klass(); this.components.push(component); return component; }
    getChildByName(name: string): FakeNode | null { return this.children.find((child) => child.name === name) ?? null; }
    setPosition(): void {}
    on(): void {}
    removeFromParent(): void { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    destroy(): void { this.destroyed = true; for (const child of this.children) child.destroy(); }
}
class FakeLabel { static readonly HorizontalAlign = { CENTER: 1 }; }

async function loadView(): Promise<typeof import("../src/view/rooms/mmoWorld/MmoWorldView")> {
    const require = createRequire(import.meta.url);
    const modules = require("node:module") as { _load(request: string, parent: unknown, isMain: boolean): unknown };
    const original = modules._load;
    modules._load = function(request, parent, isMain): unknown {
        if (request === "cc") return { Node: FakeNode, Color: class {}, UITransform: class {}, Label: FakeLabel, Vec3: class {}, view: { getVisibleSize: () => ({ width: 750, height: 1624 }) } };
        if (request === "../../uiPlate") return { createSolidPlate: (parent: FakeNode, _w: number, _h: number, _color: unknown, _x: number, _y: number, name = "plate") => { const node = new FakeNode(name); parent.addChild(node); return node; } };
        return original.call(this, request, parent, isMain);
    };
    try { return await import("../src/view/rooms/mmoWorld/MmoWorldView"); }
    finally { modules._load = original; }
}

const model: MmoWorldViewModel = {
    mapId: "test-map", mapSize: { w: 100, h: 100 }, self: null, entities: [], hp: 10, hpMax: 10, mp: 1, mpMax: 1,
    synced: true, dropping: false, notice: "", chat: [], targetId: null, spells: [], cooldowns: {}, casting: null, bag: null, bagSummary: "",
};

test("HUD替换：保留世界层、整个默认HUD被替换、模型不变也渲染、unmount强制释放订阅", async () => {
    const { MmoWorldView } = await loadView();
    const host = new FakeNode("host");
    let active = 0;
    let received: IMmoHudContext | null = null;
    const calls: string[] = [];
    const view = new MmoWorldView(host as never, () => undefined, {
        packId: "pack-a", mapId: "test-map",
        subscribeScriptState: () => { active++; return () => { active--; }; },
        create(context) { received = context; return {
            mount() { context.subscribeScriptState(context.packId, () => undefined); calls.push("mount"); },
            render() { calls.push("render"); },
            unmount() { calls.push("unmount"); },
        }; },
    });
    view.mount();
    const layer = host.getChildByName("MmoWorldLayer")!;
    assert.ok(layer.getChildByName("world"));
    assert.equal(layer.getChildByName("hud")!.children.length, 0, "默认摇杆、轮盘、状态条均未创建");
    assert.equal((received as unknown as IMmoHudContext).host.name, "hud");
    assert.equal((received as unknown as IMmoHudContext).width, 750);
    view.render(model); view.render(model);
    assert.deepEqual(calls, ["mount", "render", "render"]);
    assert.ok(layer.getChildByName("world")!.getChildByName("ground"));
    view.unmount(); view.unmount();
    assert.deepEqual(calls, ["mount", "render", "render", "unmount"]);
    assert.equal(active, 0, "即使内容HUD遗漏解绑，kit仍回收房间监听");
    assert.ok(layer.destroyed);
    assert.equal(host.children.length, 0);
    const fallback = new MmoWorldView(host as never, () => undefined);
    fallback.mount(); fallback.render({ ...model, spells: ["strike"], cooldowns: { strike: 1001 } });
    const fallbackHud = host.getChildByName("MmoWorldLayer")!.getChildByName("hud")!;
    assert.ok(fallbackHud.getChildByName("joystick"));
    assert.ok(fallbackHud.getChildByName("status"));
    assert.ok(fallbackHud.getChildByName("btn-离开"));
    const slot = fallbackHud.getChildByName("wheel")!.getChildByName("slots")!.getChildByName("btn-strike")!;
    assert.ok(slot.children.some((child) => child.components.some((component) => (component as { string?: string }).string === "2s")), "ES2017冷却映射仍向上取整秒数并绘制技能槽");
    fallback.unmount();
});
