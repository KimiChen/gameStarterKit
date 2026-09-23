/** Manual Chrome benchmark. Requires an existing local preview and Chrome CDP on 9222. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CdpClient } from "../tools/creator-preview/lib.mjs";

const args = process.argv.slice(2);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const url = value("--url", "http://127.0.0.1:8000/");
const out = resolve(value("--out", ".cache/preview-loading/measurement.json"));
const runs = Number(value("--runs", "3"));
const devtools = value("--devtools", "http://127.0.0.1:9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error("--runs must be 1–20");

const instrument = `(() => {
    localStorage.removeItem('uniflex-preview:catalog');
    performance.setResourceTimingBufferSize(20000);
    const p = window.__previewPerf = {requests: {}, active: 0, fonts: 0, decodes: 0, lastRequest: 0};
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const path = new URL(typeof args[0] === 'string' ? args[0] : args[0].url, location.href).pathname;
        p.requests[path] = (p.requests[path] || 0) + 1;
        p.active++; p.lastRequest = performance.now();
        try { return await originalFetch(...args); } finally { p.active--; }
    };
    const Font = window.FontFace;
    window.FontFace = new Proxy(Font, { construct(target, args) { p.fonts++; return Reflect.construct(target, args); } });
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function() { p.decodes++; return decode.call(this); };
})()`;

const snapshot = `(() => {
    const shadow = document.getElementById('catalog-host')?.shadowRoot;
    const cards = shadow ? [...shadow.querySelectorAll('.card')] : [];
    const ready = card => !!card.querySelector('.live')?.shadowRoot?.querySelector('[data-kind]');
    const visible = cards.filter(c => {const b=c.getBoundingClientRect(); return b.bottom>44 && b.top<innerHeight});
    const p = window.__previewPerf;
    return {now:performance.now(), visible:visible.map(c=>c.id), ready:visible.length>0 && visible.every(ready),
        mounted:cards.filter(ready).length, fonts:document.fonts.size,
        requests:p?.requests, fontCreates:p?.fonts, decodes:p?.decodes,
        idle:!!p && p.active===0 && performance.now()-p.lastRequest>300,
        transferBytes:performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.transferSize,0)};
})()`;

async function waitFor(client, expression, timeout = 30000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
        const result = await client.evaluate(expression);
        if (result) return result;
        await sleep(40);
    }
    throw new Error(`Preview timeout: ${expression.slice(0, 180)}`);
}

async function measure(client, action, target) {
    const start = action ? await client.evaluate(`(()=>{const start=performance.now();${action};return start})()`) : 0;
    if (target) await waitFor(client, `(()=>{const b=document.getElementById('catalog-host')?.shadowRoot?.getElementById('sec-${target}')?.getBoundingClientRect();return b && b.top>=0 && b.top<100})()`);
    await waitFor(client, `(${snapshot}).ready`);
    // Observe at least two paint opportunities after all visible cards have native nodes.
    await client.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const painted = await client.evaluate(snapshot);
    await waitFor(client, `(${snapshot}).idle`);
    const settled = await client.evaluate(snapshot);
    return {visiblePaintMs: Math.round(painted.now-start), painted, settled};
}

const results = [];
for (let run = 0; run < runs; run++) {
    const tab = await (await fetch(`${devtools}/json/new?about:blank`, { method: "PUT" })).json();
    let client;
    const timeout = setTimeout(() => { console.error("Benchmark CDP timeout"); process.exit(1); }, 120000);
    try {
        client = await CdpClient.connect(tab.webSocketDebuggerUrl);
        const errors = [];
        client.on((m) => {
            if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
            if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a=>a.description ?? a.value).join(" "));
        });
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Network.enable");
        await client.send("Network.setCacheDisabled", { cacheDisabled: true });
        await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
        await client.send("Page.addScriptToEvaluateOnNewDocument", { source: instrument });
        await client.send("Page.bringToFront");
        await client.send("Page.navigate", { url });
        const home = await measure(client);
        const jump = await measure(client, `document.getElementById('catalog-host').shadowRoot.querySelector('a[href="#/original-hero"]').click()`, "original-hero");
        const back = await measure(client, `document.getElementById('catalog-host').shadowRoot.querySelector('a[href="#/v-components"]').click()`, "v-components");
        if (errors.length) throw new Error(errors.join("\n"));
        results.push({home, jump, back});
        console.log(JSON.stringify({run:run+1, homeMs:home.visiblePaintMs, jumpMs:jump.visiblePaintMs, backMs:back.visiblePaintMs,
            requests:Object.values(back.settled.requests).reduce((a,b)=>a+b,0), fonts:back.settled.fontCreates, decodes:back.settled.decodes}));
    } finally {
        clearTimeout(timeout);
        client?.close();
        await fetch(`${devtools}/json/close/${tab.id}`);
    }
}
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({url, measuredAt:new Date().toISOString(), viewport:"1440x1000@1", httpCache:"disabled", results}, null, 2)+"\n");
console.log(`Report: ${out}`);
