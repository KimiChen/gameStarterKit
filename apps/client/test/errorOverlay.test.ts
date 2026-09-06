/**
 * 开发期错误弹框（core/errorOverlay）的无头单测：假 DOM 驱动，⛔ 不碰 cc、不需要浏览器。
 * 钉的三件事：弹框内容长什么样、去重与计数、以及**复制的三级降级**——
 * 局域网 IP 上跑预览不是安全上下文，`navigator.clipboard` 根本不存在，
 * 复制按钮要是只写异步剪贴板，手机上就是个哑键（这正是本功能存在的场景）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    __resetErrorOverlayForTest,
    describeErrorEvent,
    formatErrorReport,
    installErrorOverlay,
} from "../src/core/errorOverlay";

class FakeElement {
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

function harness(options: { clipboard?: { writeText(text: string): Promise<void> }; execCommand?: () => boolean } = {}) {
    __resetErrorOverlayForTest();
    const body = new FakeElement("body");
    const creatorBox = new FakeElement("div");
    const doc = {
        body,
        createElement: (tag: string) => new FakeElement(tag),
        querySelector: (selector: string) => (selector === "#error" ? creatorBox : null),
        ...(options.execCommand ? { execCommand: options.execCommand } : {}),
    };
    const winListeners = new Map<string, ((event: unknown) => void)[]>();
    const win = {
        addEventListener: (type: string, listener: (event: unknown) => void) => {
            const bucket = winListeners.get(type) ?? [];
            bucket.push(listener);
            winListeners.set(type, bucket);
        },
        navigator: { userAgent: "FakeUA/1.0", ...(options.clipboard ? { clipboard: options.clipboard } : {}) },
        location: { href: "http://10.0.2.10:7456/" },
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
    return { handle: handle!, body, creatorBox, emit, buttonOf };
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

    h.emit("unhandledrejection", { reason: new Error("boom") });
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

    // ③ 两级都没有：把文本选中，按钮改口让用户长按。
    const bare = harness();
    bare.emit("error", { error: new Error("boom") });
    assert.equal(await bare.handle.copy(), "selection");
    bare.buttonOf("已选中，长按复制");

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
