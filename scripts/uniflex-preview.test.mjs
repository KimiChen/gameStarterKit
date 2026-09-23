import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { PreviewQueue } from "../apps/web-ui-preview/preview-queue.ts";
import { PreviewResources } from "../apps/web-ui-preview/preview-resources.ts";
import { jsonHash } from "../apps/client/src/lib/uniflex/core/provider.js";
import { DOMHostDriver } from "../apps/client/src/lib/uniflex/web/dom-host.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("floating options inside nested shadow roots are not dismissed as outside clicks", (t) => {
    // At document capture, target is the catalog host; composedPath still contains
    // the actual option and panel across both preview shadow roots.
    class ElementStub extends EventTarget {
        style = {};
        dataset = {};
        children = [];
        append(child) { this.children.push(child); }
        remove() {}
        contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    }
    const window = Object.assign(new EventTarget(), {
        performance, clearTimeout, setTimeout,
        requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    });
    const document = Object.assign(new EventTarget(), { defaultView: window, createElement: () => new ElementStub() });
    const container = Object.assign(new ElementStub(), { ownerDocument: document });
    const driver = new DOMHostDriver(container, {}, 320, 352);
    t.after(() => driver.destroy());
    const behavior = { floating: { anchor: "child", anchorIndex: 0, panelIndex: 1 } };
    const record = (id, behavior) => ({ recordId: id, planId: id, kind: "view", behavior,
        handle: driver.create("view", id, behavior), props: {}, children: [], parent: null });
    const floating = record(1, behavior), anchor = record(2), panel = record(3);
    floating.children.push(anchor, panel);
    anchor.parent = panel.parent = floating;
    driver.commit([floating, anchor, panel].map((record) => ({ type: "create", record })));
    const closes = [];
    floating.props.open = true;
    Object.assign(floating.handle.props, { open: true, onOpenChange: (open) => closes.push(open) });
    const catalogHost = new ElementStub(), cardHost = new ElementStub(), option = new ElementStub();
    panel.handle.element.append(option);
    const dispatch = (target, path) => {
        const event = new Event("pointerdown", { cancelable: true });
        Object.defineProperties(event, { target: { value: target }, composedPath: { value: () => path } });
        document.dispatchEvent(event);
        return event.defaultPrevented;
    };
    assert.equal(dispatch(catalogHost, [option, panel.handle.element, cardHost, catalogHost, document]), false);
    assert.equal(dispatch(catalogHost, [anchor.handle.element, cardHost, catalogHost, document]), false);
    assert.deepEqual(closes, []);
    // Direct (non-shadow) previews retain the same behavior.
    assert.equal(dispatch(option, [option, panel.handle.element, container, document]), false);
    // A sibling control inside the same catalog host is genuinely outside.
    assert.equal(dispatch(catalogHost, [new ElementStub(), cardHost, catalogHost, document]), true);
    assert.deepEqual(closes, [false]);
    const click = new Event("click", { cancelable: true });
    document.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true, "outside dismissal must not click through");
    driver.destroy();
    dispatch(catalogHost, [catalogHost, document]);
    assert.deepEqual(closes, [false], "destroy removes the document listener");
});
const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
};

test("preview queue prioritizes visible work and never starts cancelled offscreen cards", async () => {
    const queue = new PreviewQueue(1);
    const running = deferred();
    const events = [];
    const job = (name, priority, wait) => ({ priority,
        run: async () => { events.push(name); await wait; },
        dispose: () => events.push(`dispose:${name}`),
    });
    queue.show("running", job("running", 1, running.promise));
    await tick();
    queue.show("near", job("near", 2));
    queue.show("gone", job("gone", 1));
    queue.show("target", job("target", 0));
    queue.hide("gone");
    running.resolve();
    await tick();
    assert.deepEqual(events, ["running", "dispose:gone", "target", "near"]);
    queue.dispose();
});

test("replacing a running card cannot dispose or remove its newer job", async () => {
    const queue = new PreviewQueue(1);
    const old = deferred();
    const events = [];
    queue.show("card", { priority: 1, run: () => old.promise, dispose: () => events.push("old") });
    await tick();
    queue.show("card", { priority: 0, run: async () => events.push("new:start"), dispose: () => events.push("new") });
    old.resolve();
    await tick();
    queue.hide("card");
    assert.deepEqual(events, ["old", "new:start", "new"]);
});

test("a failed card frees its queue slot and promoted work runs before preloads", async (t) => {
    const log = t.mock.method(console, "error", () => {});
    const queue = new PreviewQueue(1);
    const pending = deferred();
    const events = [];
    queue.show("bad", { priority: 0, run: async () => { await pending.promise; throw new Error("broken card"); }, dispose() {} });
    await tick();
    for (const name of ["preload", "visible"]) queue.show(name, {
        priority: 2, run: async () => { events.push(name); }, dispose() {},
    });
    queue.prioritize("visible", 1);
    pending.resolve();
    await tick();
    assert.deepEqual(events, ["visible", "preload"]);
    assert.equal(log.mock.callCount(), 1);
    queue.dispose();
});

function resourceFixture(t, response) {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const entry = { id: "fonts/test", kind: "font", weight: 400, sha256: hash, file: "font.ttf", metrics: { unitsPerEm: 1000, ascender: 800, descender: -200, lineGap: 0, advances: { "?": 500 } } };
    const data = { version: 1, test: "read-only" };
    const ref = { id: "ui/catalog", sha256: jsonHash(data) };
    const fonts = new Set();
    let creates = 0;
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
        requests++;
        return url === "/catalog" ? Response.json(data) : response ? response(bytes) : new Response(bytes);
    });
    const originalFont = globalThis.FontFace;
    globalThis.FontFace = class { constructor() { creates++; } async load() { return this; } };
    t.after(() => { if (originalFont) globalThis.FontFace = originalFont; else delete globalThis.FontFace; });
    const pool = new PreviewResources({ fonts }, {
        "fonts/test": { url: "/font", sha256: hash },
        "ui/catalog": { url: "/catalog", sha256: ref.sha256 },
    });
    t.after(() => pool.dispose());
    const resources = [entry];
    return { pool, fonts, ref, catalog: { version: 1, hash: jsonHash(resources), resources },
        stats: () => ({ requests, creates }) };
}

test("cards share pending JSON and font loads, with independent leases and one final cleanup", async (t) => {
    const f = resourceFixture(t);
    const [jsonA, jsonB] = await Promise.all([f.pool.store.loadJson(f.ref), f.pool.store.loadJson(f.ref)]);
    assert.equal(jsonA, jsonB);
    assert.ok(Object.isFrozen(jsonA));
    const [a, b] = await Promise.all([f.pool.store.acquire(f.catalog), f.pool.store.acquire(f.catalog)]);
    assert.deepEqual(f.stats(), { requests: 2, creates: 1 });
    assert.equal(f.fonts.size, 1);
    a.release();
    f.pool.store.trimUnused({ maxContexts: 0 });
    assert.equal(f.fonts.size, 1, "one card cannot release another card's font");
    assert.ok(f.pool.store.context(b).font().native.font);
    b.release();
    f.pool.store.trimUnused({ maxContexts: 0 });
    assert.equal(f.fonts.size, 0);
});

test("a failed shared resource can be retried; checksum errors do not populate the cache", async (t) => {
    let attempt = 0;
    const f = resourceFixture(t, (bytes) => new Response(++attempt === 1 ? new Uint8Array([9]) : bytes));
    await assert.rejects(f.pool.store.acquire(f.catalog), /checksum mismatch/);
    const lease = await f.pool.store.acquire(f.catalog);
    assert.deepEqual(f.stats(), { requests: 2, creates: 1 });
    lease.release();
});

test("disposing while a shared font is loading does not register a late font", async (t) => {
    const pending = deferred();
    const f = resourceFixture(t, async (bytes) => { await pending.promise; return new Response(bytes); });
    const loading = f.pool.store.acquire(f.catalog);
    const rejected = assert.rejects(loading);
    await tick();
    f.pool.dispose();
    pending.resolve();
    await rejected;
    assert.equal(f.fonts.size, 0);
});
