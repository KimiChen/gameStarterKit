/** O0 passive instrumentation, installed only by the desktop preview runner.
 * Never changes map state/time/quality. Hooks are restored even when replay fails.
 * ArrayBuffer bytes, JS object counts, source textures and RT are separate metrics.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export function distribution(values) {
    if (!values.length) return { count: 0, mean: null, p50: null, p95: null, p99: null, max: null };
    const sorted = [...values].sort((a, b) => a - b);
    const at = p => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
    return { count: sorted.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
        p50: at(.5), p95: at(.95), p99: at(.99), max: sorted[sorted.length - 1] };
}

/** Serialized browser code. No references to this module's lexical environment. */
export function installMapOriginalMetrics() {
    const key = "__mapOriginalMetrics";
    globalThis[key]?.stop();
    const device = cc.director.root.device;
    const canvas = document.getElementById("GameCanvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) throw new Error("mapOriginal metrics requires WebGL");
    const start = performance.now(), loads = [], frames = [], restorers = [];
    let visibilityChanges = 0;
    const visibility = () => { visibilityChanges++; };
    document.addEventListener("visibilitychange", visibility);
    restorers.push(() => document.removeEventListener("visibilitychange", visibility));
    const assets = new Map(); // WeakRef only: diagnostics must not keep assets alive.
    let frameStart = start, previousEnd = null, uploadedBytes = 0, uploads = 0, allocations = 0;
    let beforeUploads = 0, beforeBytes = 0, firstOverviewMs = null, firstNearMs = null;
    const relative = () => performance.now() - start;
    const originalLoad = cc.resources.load;
    const load = function (...args) {
        const resource = args[0], index = args.length - 1, callback = args[index];
        if (typeof resource !== "string" || !resource.startsWith("kits/mapOriginal/") || typeof callback !== "function") {
            return originalLoad.apply(this, args);
        }
        const record = { path: resource, startMs: relative(), finishMs: null, error: null };
        loads.push(record);
        args[index] = function (error, asset) {
            record.finishMs = relative();
            record.error = error ? String(error.message ?? error) : asset ? null : "missing asset";
            if (asset) {
                const texture = typeof asset.getGFXTexture === "function";
                Object.assign(record, { uuid: asset._uuid, kind: texture ? "texture" : typeof asset.buffer === "function" ? "buffer" : "effect",
                    width: texture ? asset.width : null, height: texture ? asset.height : null,
                    bufferBytes: typeof asset.buffer === "function" ? asset.buffer().byteLength : null });
                assets.set(asset._uuid || resource, { ref: new WeakRef(asset), record });
            }
            return callback.apply(this, arguments);
        };
        return originalLoad.apply(this, args);
    };
    cc.resources.load = load;
    restorers.push(() => { if (cc.resources.load === load) cc.resources.load = originalLoad; });
    // Count actual WebGL buffer calls. Numeric bufferData allocates storage, not uploaded bytes.
    for (const name of ["bufferData", "bufferSubData"]) {
        const original = gl[name];
        const wrapped = function (...args) {
            const data = args[name === "bufferData" ? 1 : 2];
            if (typeof data === "number") allocations += data;
            else if (data?.byteLength !== undefined) {
                const offset = args[3] ?? 0;
                const length = args[4];
                const bytesPerElement = data.BYTES_PER_ELEMENT ?? 1;
                uploadedBytes += length ? length * bytesPerElement : data.byteLength - offset * bytesPerElement;
                uploads++;
            }
            return original.apply(this, args);
        };
        gl[name] = wrapped;
        restorers.push(() => { if (gl[name] === wrapped) gl[name] = original; });
    }
    const nodes = () => {
        const out = [];
        const visit = n => { out.push(n); n.children.forEach(visit); };
        visit(cc.director.getScene());
        return out;
    };
    const before = () => { frameStart = performance.now(); beforeBytes = uploadedBytes; beforeUploads = uploads; };
    const after = () => {
        const now = performance.now();
        frames.push({ intervalMs: previousEnd === null ? null : now - previousEnd,
            updateToDrawMs: now - frameStart, uploadedBytes: uploadedBytes - beforeBytes,
            uploadCalls: uploads - beforeUploads, drawCalls: device.numDrawCalls ?? null });
        previousEnd = now;
        if (frames.length > 18000) frames.shift();
        if (firstOverviewMs === null || firstNearMs === null) {
            const active = nodes().filter(n => n.activeInHierarchy);
            if (firstOverviewMs === null && active.some(n => n.name === "mapo-overview" && n.getComponent("cc.MeshRenderer")?.mesh)) firstOverviewMs = relative();
            if (firstNearMs === null && active.some(n => n.name === "mapo-ground" && n.getComponent("cc.MeshRenderer")?.mesh)) firstNearMs = relative();
        }
    };
    cc.director.on(cc.Director.EVENT_BEFORE_UPDATE, before);
    cc.director.on(cc.Director.EVENT_AFTER_DRAW, after);
    const snapshot = () => {
        const all = nodes(), textures = [], renderTextures = new Map();
        for (const { ref, record } of assets.values()) {
            const asset = ref.deref();
            if (record.kind === "texture") textures.push({ path: record.path, valid: !!asset?.isValid,
                refCount: asset?.refCount ?? null, width: record.width, height: record.height,
                rgba8EstimateBytes: record.width * record.height * 4,
                gfxBytes: asset?.getGFXTexture()?.size ?? null, format: asset?.getGFXTexture()?.format ?? null });
        }
        for (const n of all) {
            const m = n.getComponent("cc.MeshRenderer");
            const texture = /^mapo-cache-/.test(n.name) ? m?.sharedMaterials[0]?.getProperty("mainTexture") : null;
            if (texture) renderTextures.set(texture, texture.width * texture.height * 8);
            if (n.name === "mapo-cache-camera") {
                const t = n.getComponent("cc.Camera")?.targetTexture;
                if (t) renderTextures.set(t, t.width * t.height * 8);
            }
        }
        const usage = {}, expected = ["Terrain", "Bands", "Regions", "Roads", "Cities", "Tops", "Rivers", "Blocks"];
        const modules = [...System.entries()];
        for (const name of expected) {
            const fn = `mapo${name}DataUsage`;
            const matches = modules.filter(([, m]) => typeof m?.[fn] === "function");
            if (matches.length !== 1) throw new Error(`Expected one ${fn}; found ${matches.length}. Refresh Creator compilation.`);
            usage[name] = matches[0][1][fn]();
        }
        const owners = modules.filter(([, m]) => typeof m?.mapoArtDiagnostics === "function");
        if (owners.length !== 1) throw new Error("Expected one mapoArtDiagnostics; refresh Creator compilation.");
        const maps = owners[0][1].mapoArtDiagnostics();
        const legacyBytes = Object.values(usage).reduce((n, u) => n + u.arrayBufferBytes, 0);
        const ownedBytes = maps.reduce((n, map) => n + Object.values(map.data).reduce((sum, u) => sum + u.arrayBufferBytes, 0), 0);
        const rect = canvas.getBoundingClientRect(), debug = gl.getExtension("WEBGL_debug_renderer_info");
        return { elapsedMs: relative(), environment: { userAgent: navigator.userAgent, platform: navigator.platform,
            api: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            dpr: devicePixelRatio, targetFps: cc.game?.frameRate ?? null, screenshotScale: 1.5,
            cssCanvas: { width: rect.width, height: rect.height },
            backingCanvas: { width: canvas.width, height: canvas.height }, design: cc.view.getDesignResolutionSize(), hidden: document.hidden },
            firstOverviewMs, firstNearMs, loads: loads.map(r => ({ ...r })), textures,
            sourceTextureRgba8Bytes: textures.filter(t => t.valid).reduce((n, t) => n + t.rgba8EstimateBytes, 0),
            rtBytesWithDepth: [...renderTextures.values()].reduce((a, b) => a + b, 0),
            cpu: { readers: usage, maps, legacyArrayBufferBytes: legacyBytes, ownedArrayBufferBytes: ownedBytes, retainedArrayBufferBytes: legacyBytes + ownedBytes,
                loadedBufferAssetBytes: [...assets.values()].filter(a => a.ref.deref()?.isValid).reduce((n, a) => n + (a.record.bufferBytes ?? 0), 0),
                note: "Reader ArrayBuffers overlap BufferAsset payloads; do not add them. Object counts exclude JS overhead and generated TS constants." },
            pageHeapBytes: performance.memory?.usedJSHeapSize ?? null,
            wholeDevice: { textureBytes: device.memoryStatus?.textureSize ?? null, bufferBytes: device.memoryStatus?.bufferSize ?? null },
            uploads: { bytes: uploadedBytes, calls: uploads, allocatedBufferBytes: allocations, scope: "whole WebGL context during replay; includes UI" },
            recentFrames: frames.slice(-120), visibilityChanges, mapNodes: all.filter(n => n.name.startsWith("mapo-")).length };
    };
    const stop = () => {
        cc.director.off(cc.Director.EVENT_BEFORE_UPDATE, before);
        cc.director.off(cc.Director.EVENT_AFTER_DRAW, after);
        restorers.reverse().forEach(restore => restore());
        delete globalThis[key];
    };
    globalThis[key] = { snapshot, stop, resetFrames: () => { frames.length = 0; previousEnd = null; visibilityChanges = 0; } };
    return { installed: true };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function inputIdentity() {
    const hashes = {};
    for (const root of ["apps/client/src/kits/mapOriginal", "apps/shared/src/kits/mapOriginal",
        "apps/kits/mapOriginal/data/maps/s1", "tools/creator-preview/maporiginal.mjs", "tools/creator-preview/maporiginal-metrics.mjs", "tools/creator-preview/maporiginal-lifecycle.mjs"]) {
        const visit = file => {
            if (fs.statSync(file).isDirectory()) fs.readdirSync(file).sort().forEach(name => visit(path.join(file, name)));
            else if (!file.endsWith(".meta")) hashes[path.relative(ROOT, file)] = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
        };
        visit(path.join(ROOT, root));
    }
    const compiledDir = path.join(ROOT, "apps/Cocos/temp/programming/packer-driver/targets/preview");
    const imports = JSON.parse(fs.readFileSync(path.join(compiledDir, "import-map.json"), "utf8")).imports;
    const checkCompiled = relative => {
        const source = fs.readFileSync(path.join(ROOT, "apps/client/src", relative), "utf8");
        const mirror = path.join(ROOT, "apps/Cocos/assets/src", relative), compiled = imports[pathToFileURL(mirror).href];
        if (fs.readFileSync(mirror, "utf8") !== source || !compiled
            || !JSON.parse(fs.readFileSync(path.join(compiledDir, compiled + ".map"), "utf8")).sourcesContent.includes(source)) {
            throw new Error(`Stale mirror or Creator compilation: ${relative}`);
        }
        return { source: relative, compiled, sha256: createHash("sha256").update(source).digest("hex") };
    };
    const compiledReaders = ["Terrain", "Bands", "Regions", "Roads", "Cities", "Tops", "Rivers", "Blocks"]
        .map(name => checkCompiled(`kits/mapOriginal/logic/mapo${name}.ts`));
    const compiledRendering = ["logic/mapoMesh", "logic/mapoScene", "logic/mapoStaticScene", "logic/mapoFar", "view/MapoMinimap", "logic/MapoDataStore", "view/MapoAssetGroups", "view/MapoArtResources", "view/MapOriginalWorldView", "view/MapoFarRenderer", "view/MapoChunkBaker"]
        .map(name => checkCompiled(`kits/mapOriginal/${name}.ts`));
    return { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), compiledReaders, compiledRendering,
        inputHash: createHash("sha256").update(JSON.stringify(hashes)).digest("hex"), files: hashes };
}

export async function startMapOriginalMetrics(runner) {
    const identity = inputIdentity(), samples = [];
    const reportPath = path.join(runner.outDir, "maporiginal-metrics.json");
    const write = () => fs.writeFileSync(reportPath, JSON.stringify({ schemaVersion: 1, identity, samples,
        timing: "From pre-entry click; firstNear is first drawn ground mesh, selected.step is actual input validation. Browser cache state is warm/unspecified, not a cold-install SLA.",
        frameScope: "Last 120 rendered frames at each sample; replay overhead and screenshots can affect intervals. Desktop instrumented baseline only." }, null, 2) + "\n");
    await runner.client.evaluate(`(${installMapOriginalMetrics.toString()})()`);
    return {
        async sample(label, evidence) {
            const state = await runner.client.evaluate(`(async () => {
                const probe = globalThis.__mapOriginalMetrics;
                probe.resetFrames();
                await new Promise(resolve => setTimeout(resolve, 2200));
                return probe.snapshot();
            })()`);
            const frames = state.recentFrames;
            delete state.recentFrames;
            samples.push({ label, quality: evidence?.graphics?.quality ?? null, lod: evidence?.lod ?? null,
                validWindow: !state.environment.hidden && state.visibilityChanges === 0 && frames.length >= 60,
                ...state, rawFrames: frames, frames: Object.fromEntries(["intervalMs", "updateToDrawMs", "uploadedBytes", "uploadCalls", "drawCalls"]
                    .map(key => [key, distribution(frames.map(f => f[key]).filter(v => v !== null))])) });
            write();
            if (!samples[samples.length - 1].validWindow) throw new Error(`Invalid metric window ${label}: hidden, visibility changed, or fewer than 60 frames`);
            return { report: reportPath, label, sourceTextureRgba8Bytes: state.sourceTextureRgba8Bytes, rtBytesWithDepth: state.rtBytesWithDepth };
        },
        async stop() { try { await runner.client.evaluate("globalThis.__mapOriginalMetrics?.stop()"); } finally { write(); } },
    };
}
