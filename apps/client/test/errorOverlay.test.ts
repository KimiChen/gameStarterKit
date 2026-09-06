/**
 * 开发期错误弹框（core/errorOverlay）的无头单测：假 DOM 驱动，⛔ 不碰 cc、不需要浏览器。
 * 钉的三件事：弹框内容长什么样、去重与计数、以及**复制的三级降级**——
 * 局域网 IP 上跑预览不是安全上下文，`navigator.clipboard` 根本不存在，
 * 复制按钮要是只写异步剪贴板，手机上就是个哑键（这正是本功能存在的场景）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { __resetErrorContextForTest, setErrorContext, snapshotErrorContext } from "../src/core/errorContext";
import { DESIGN_WIDTH } from "../src/designSpec";
import {
    __resetErrorOverlayForTest,
    describeErrorEvent,
    formatErrorReport,
    installErrorOverlay,
} from "../src/core/errorOverlay";

class FakeElement {
    /** 画布假件用：让 overlay 量到一块「游戏画布」。 */
    rect: { left: number; top: number; width: number; height: number } | null = null;
    style: Record<string, string> = {};
    textContent = "";
    value = "";
    selected = false;
    removed = false;
    readonly children: FakeElement[] = [];
    readonly listeners = new Map<string, (() => void)[]>();

    constructor(readonly tag: string) {}

    appendChild(child: FakeElement): FakeElement { this.children.push(child); return child; }
    addEventListener(type: string, listener: () => void): void {
        const bucket = this.listeners.get(type) ?? [];
        bucket.push(listener);
        this.listeners.set(type, bucket);
    }
    click(): void { for (const fire of this.listeners.get("click") ?? []) fire(); }
    getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
        return this.rect ?? { left: 0, top: 0, width: 0, height: 0 };
    }
    setAttribute(): void {}
    remove(): void { this.removed = true; }
    select(): void { this.selected = true; }
    focus(): void {}

    /** 深度优先找第一个满足条件的后代（含自己）。 */
    find(predicate: (element: FakeElement) => boolean): FakeElement | null {
        if (predicate(this)) return this;
        for (const child of this.children) {
            const hit = child.find(predicate);
            if (hit) return hit;
        }
        return null;
    }
}

function harness(options: {
    clipboard?: { writeText(text: string): Promise<void> };
    execCommand?: () => boolean;
    /** 游戏画布在页面里的位置与大小；不给 = 页面上没有画布（走整窗兜底）。 */
    canvas?: { left: number; top: number; width: number; height: number };
} = {}) {
    __resetErrorOverlayForTest();
    __resetErrorContextForTest();
    const body = new FakeElement("body");
    const creatorBox = new FakeElement("div");
    const canvas = new FakeElement("canvas");
    canvas.rect = options.canvas ?? null;
    const selected: FakeElement[] = [];
    const doc = {
        body,
        createRange: () => ({ selectNodeContents: (node: FakeElement) => { range.node = node; } }),
        createElement: (tag: string) => new FakeElement(tag),
        querySelector: (selector: string) => {
            if (selector === "#error") return creatorBox;
            if (selector === "#GameCanvas" || selector === "canvas") return options.canvas ? canvas : null;
            return null;
        },
        ...(options.execCommand ? { execCommand: options.execCommand } : {}),
    };
    const range: { node: FakeElement | null } = { node: null };
    const winListeners = new Map<string, ((event: unknown) => void)[]>();
    const win = {
        addEventListener: (type: string, listener: (event: unknown) => void) => {
            const bucket = winListeners.get(type) ?? [];
            bucket.push(listener);
            winListeners.set(type, bucket);
        },
        navigator: { userAgent: "FakeUA/1.0", ...(options.clipboard ? { clipboard: options.clipboard } : {}) },
        location: { href: "http://10.0.2.10:7456/" },
        innerWidth: 1440,
        innerHeight: 900,
        getSelection: () => ({
            removeAllRanges: () => { selected.length = 0; },
            addRange: () => { if (range.node) selected.push(range.node); },
        }),
    };
    const handle = installErrorOverlay({
        doc: doc as never, win: win as never, enabled: true, now: () => new Date("2026-09-06T12:00:00.000Z"),
    });
    assert.ok(handle, "假 DOM 下必须装得上");
    const emit = (type: string, event: unknown): void => {
        for (const fire of winListeners.get(type) ?? []) fire(event);
    };
    const buttonOf = (label: string): FakeElement => {
        const hit = body.find((element) => element.tag === "button" && element.textContent === label);
        assert.ok(hit, `找不到按钮「${label}」`);
        return hit;
    };
    const scrim = (): FakeElement => body.children[0];
    const panel = (): FakeElement => scrim().children[0];
    return { handle: handle!, body, creatorBox, emit, buttonOf, scrim, panel, selected };
}

test("errorOverlay：不满足开关或没有 DOM 时是 no-op（release 构建 ⛔ 不把堆栈甩给玩家）", () => {
    __resetErrorOverlayForTest();
    assert.equal(installErrorOverlay({ enabled: false }), null);
    __resetErrorOverlayForTest();
    assert.equal(installErrorOverlay({ enabled: true, doc: null, win: null }), null);
    __resetErrorOverlayForTest();
});

test("errorOverlay：window error / unhandledrejection 都进弹框，且盖掉预览页自带的 #error", () => {
    const h = harness();
    assert.equal(h.body.children.length, 0, "没出错之前 ⛔ 不建任何节点");
    h.emit("error", { error: new RangeError("Invalid typed array length: 235216") });
    assert.equal(h.creatorBox.style.display, "none", "预览页那个框必须藏掉，⛔ 不能两个框叠着");
    const panelText = h.body.find((element) => element.textContent.includes("Invalid typed array length"));
    assert.ok(panelText, "弹框里必须能读到错误原文");
    assert.ok(panelText?.textContent.includes("页面：http://10.0.2.10:7456/"), "环境行要带页面地址");
    assert.ok(panelText?.textContent.includes("UA：FakeUA/1.0"));

    // ⚠ Creator 的 showError 每收到一条错误都会把 #error 重新 display:block，
    // 所以每次出错都得再藏一遍——只在建弹框时藏一次的话第二条错误就又冒出来了。
    h.creatorBox.style.display = "block";
    h.emit("unhandledrejection", { reason: new Error("boom") });
    assert.equal(h.creatorBox.style.display, "none", "第二条错误也必须把预览页的框重新藏掉");
    assert.equal(h.handle.entries().length, 2);
    assert.equal(h.handle.entries()[1].kind, "unhandledrejection");
    __resetErrorOverlayForTest();
});

test("errorOverlay：同一条错误重复出现只累加计数，⛔ 不刷屏", () => {
    const h = harness();
    for (let i = 0; i < 5; i += 1) h.emit("error", { error: new Error("same") });
    assert.equal(h.handle.entries().length, 1);
    assert.equal(h.handle.entries()[0].count, 5);
    const title = h.body.find((element) => element.textContent.startsWith("出错了"));
    assert.equal(title?.textContent, "出错了（1 条，共 5 次）");
    __resetErrorOverlayForTest();
});

test("errorOverlay：复制三级降级 —— 剪贴板 → execCommand → 选中长按", async () => {
    // ① 安全上下文：走异步剪贴板。
    const copied: string[] = [];
    const withClipboard = harness({ clipboard: { writeText: async (text: string) => { copied.push(text); } } });
    withClipboard.emit("error", { error: new Error("boom") });
    assert.equal(await withClipboard.handle.copy(), "clipboard");
    assert.equal(copied.length, 1);
    assert.ok(copied[0].includes("boom"));
    assert.equal(withClipboard.buttonOf("已复制 ✓").tag, "button", "复制后按钮要给回执");

    // ② http（局域网 IP）：没有 clipboard，退 execCommand。
    let execCalls = 0;
    const withExec = harness({ execCommand: () => { execCalls += 1; return true; } });
    withExec.emit("error", { error: new Error("boom") });
    assert.equal(await withExec.handle.copy(), "execCommand");
    assert.equal(execCalls, 1);

    // ③ 两级都没有：把报告正文**真的选中**，按钮改口让用户长按。
    // ⚠ `<div>` 没有 .select()（那是 input/textarea 才有的）：早先那版静默什么也没做、
    // 按钮却说「已选中」——真机演示时抓到的。这条断言钉住「选区里确实是正文那块」。
    const bare = harness();
    bare.emit("error", { error: new Error("boom") });
    assert.equal(await bare.handle.copy(), "selection");
    bare.buttonOf("已选中，长按复制");
    assert.equal(bare.selected.length, 1, "必须真的建了选区");
    assert.ok(bare.selected[0].textContent.includes("boom"), "选中的必须是报告正文那一块");

    // ④ 剪贴板存在但抛错（权限被拒）也必须继续降级，⛔ 不是哑键。
    let execAfterReject = 0;
    const rejecting = harness({
        clipboard: { writeText: async () => { throw new Error("denied"); } },
        execCommand: () => { execAfterReject += 1; return true; },
    });
    rejecting.emit("error", { error: new Error("boom") });
    assert.equal(await rejecting.handle.copy(), "execCommand");
    assert.equal(execAfterReject, 1);
    __resetErrorOverlayForTest();
});

test("errorOverlay：弹出时 ⛔ 不自动复制、不自动选中——复制只能由用户点按钮触发", () => {
    let writes = 0;
    const h = harness({ clipboard: { writeText: async () => { writes += 1; } }, execCommand: () => true });
    h.emit("error", { error: new Error("boom") });
    h.emit("unhandledrejection", { reason: new Error("again") });
    assert.equal(writes, 0, "⛔ 弹框出现不许碰剪贴板（会弹权限框/抢走用户已复制的内容）");
    assert.equal(h.selected.length, 0, "⛔ 弹框出现不许自动选中");
    assert.equal(h.buttonOf("复制全部").textContent, "复制全部", "按钮保持初始文案，⛔ 不许自己变成「已复制」");
    // 只有用户点了才复制。
    h.buttonOf("复制全部").click();
    assert.equal(writes, 1);
    __resetErrorOverlayForTest();
});

test("errorOverlay：关闭按钮只隐藏，下一条错误会重新弹出来", () => {
    const h = harness();
    h.emit("error", { error: new Error("first") });
    const scrim = h.body.children[0];
    assert.equal(scrim.style.display, "flex");
    h.buttonOf("关闭").click();
    assert.equal(scrim.style.display, "none");
    h.emit("error", { error: new Error("second") });
    assert.equal(scrim.style.display, "flex", "又出错了必须再弹，⛔ 不能被关掉一次就永远闭嘴");
    assert.equal(h.body.children.length, 1, "⛔ 不许每次出错都新建一个弹框");
    __resetErrorOverlayForTest();
});

test("describeErrorEvent / formatErrorReport：消息、堆栈与次数按可粘贴格式排版", () => {
    assert.deepEqual(describeErrorEvent("error", new TypeError("bad")).message, "TypeError: bad");
    assert.equal(describeErrorEvent("error", "plain string").message, "plain string");
    assert.equal(describeErrorEvent("unhandledrejection", { reason: new Error("inner") }).message, "Error: inner");
    assert.equal(describeErrorEvent("error", { message: "no stack" }).stack, "");

    const report = formatErrorReport(
        [{ kind: "error", message: "E1", stack: "at foo", count: 3 },
            { kind: "unhandledrejection", message: "E2", stack: "", count: 1 }],
        { url: "http://x/", userAgent: "UA", at: "2026-09-06T12:00:00.000Z" },
    );
    assert.equal(report, [
        "时间：2026-09-06T12:00:00.000Z",
        "页面：http://x/",
        "UA：UA",
        "错误：2 条",
        "",
        "[1] error（×3） E1",
        "at foo",
        "[2] unhandledrejection E2",
    ].join("\n"));
});

test("errorOverlay：报告带上游戏上下文（当前页面 / mode / runId），排在错误正文之前", () => {
    const h = harness();
    setErrorContext("view.open", "PromoHomeView > SettingsView");
    setErrorContext("gameplay.mode", "snake");
    setErrorContext("gameplay.runId", "snake-epoch-1:run:3");
    h.emit("error", { error: new Error("boom") });
    const text = h.body.find((element) => element.textContent.includes("boom"))!.textContent;
    const contextAt = text.indexOf("gameplay.runId：snake-epoch-1:run:3");
    const errorAt = text.indexOf("[1] error");
    assert.ok(contextAt > 0, `报告里必须有 runId（实际：${text}）`);
    assert.ok(text.includes("view.open：PromoHomeView > SettingsView"));
    assert.ok(contextAt < errorAt, "上下文必须排在错误正文之前——贴进 issue 第一眼要看到在哪出的事");
    __resetErrorContextForTest();
    __resetErrorOverlayForTest();
});

test("errorContext：null 撤下、超长截断、键数封顶", () => {
    __resetErrorContextForTest();
    setErrorContext("a", "1");
    setErrorContext("b", 2);
    assert.deepEqual(snapshotErrorContext(), [["a", "1"], ["b", "2"]]);
    setErrorContext("a", null);
    assert.deepEqual(snapshotErrorContext(), [["b", "2"]]);
    setErrorContext("long", "x".repeat(400));
    assert.equal(snapshotErrorContext().find(([key]) => key === "long")?.[1].length, 201, "200 字符 + 省略号");
    for (let i = 0; i < 60; i += 1) setErrorContext(`k${i}`, "v");
    assert.ok(snapshotErrorContext().length <= 32, "⛔ 不许被当日志用");
    // 已存在的键即使在封顶后仍可更新（否则最要紧的 runId 会被垃圾键挤掉）。
    setErrorContext("b", "3");
    assert.equal(snapshotErrorContext().find(([key]) => key === "b")?.[1], "3");
    __resetErrorContextForTest();
});

test("errorOverlay：贴着游戏画布定位，并按设计分辨率缩放（⛔ 不铺满窗口、⛔ 不写死 px）", () => {
    // 预览页里画布只占中间一块：左上角 (300, 40)、宽 375（设计宽 750 的一半）。
    const h = harness({ canvas: { left: 300, top: 40, width: 375, height: 812 } });
    h.emit("error", { error: new Error("boom") });
    const scrim = h.scrim();
    assert.equal(scrim.style.left, "300px", "遮罩必须贴画布左上角，⛔ 不是窗口左上角");
    assert.equal(scrim.style.top, "40px");
    assert.equal(scrim.style.width, "375px");
    assert.equal(scrim.style.height, "812px");

    // 缩放 = 画布宽 / DESIGN_WIDTH；面板宽是设计稿 690 换算过来的。
    const scale = 375 / DESIGN_WIDTH;
    assert.equal(h.panel().style.width, `${Math.round(690 * scale * 100) / 100}px`);
    const title = h.panel().children[0];
    assert.equal(title.style.fontSize, `${Math.round(30 * scale * 100) / 100}px`);
    assert.equal(h.buttonOf("复制全部").style.minHeight, `${Math.round(84 * scale * 100) / 100}px`);
    __resetErrorOverlayForTest();
});

test("errorOverlay：画布量不到时退回整窗，⛔ 不因此崩掉", () => {
    const h = harness();
    h.emit("error", { error: new Error("boom") });
    assert.equal(h.scrim().style.left, "0px");
    assert.equal(h.scrim().style.width, "1440px", "没有画布就用 window.innerWidth");
    assert.ok(h.panel().style.width.endsWith("px"));
    __resetErrorOverlayForTest();
});
