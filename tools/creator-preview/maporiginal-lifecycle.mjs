/** O3 的真实引擎生命周期闸；宿主 ViewMgr 仅用于开关页，地图操作仍走普通输入。 */
import { sleep } from "./lib.mjs";
import { readMapOriginalEvidence, mapOriginalGestureArea, mapOriginalWheel, MAPO_BASELINE_BIOMES } from "./maporiginal.mjs";

const snapshot = runner => runner.client.evaluate("globalThis.__mapOriginalMetrics.snapshot()");
const close = runner => runner.client.evaluate(`(() => {
    const found = [...System.entries()].filter(([, m]) => m?.ViewMgr);
    if (found.length !== 1) throw new Error("Expected one ViewMgr");
    found[0][1].ViewMgr.close("MapOriginalWorld");
})()`);
const diagnose = runner => runner.client.evaluate(`(() => {
    const found = [...System.entries()].filter(([, m]) => typeof m?.mapoArtDiagnostics === "function");
    if (found.length !== 1) throw new Error("Expected one mapoArtDiagnostics");
    return found[0][1].mapoArtDiagnostics();
})()`);
async function until(probe, description, timeout = 30000) {
    const end = Date.now() + timeout;
    do { const value = await probe(); if (value) return value; await sleep(100); } while (Date.now() < end);
    throw new Error(`O3 timeout: ${description}`);
}
async function closed(runner) {
    await close(runner);
    const state = await until(async () => {
        const s = await snapshot(runner);
        return s.cpu.maps.length === 0 && s.mapNodes === 0 && s.sourceTextureRgba8Bytes === 0 && s.rtBytesWithDepth === 0 ? s : null;
    }, "关闭后归还地图组、源纹理、RT 和节点");
    if (state.cpu.retainedArrayBufferBytes !== 0 || state.cpu.loadedBufferAssetBytes !== 0) throw new Error("Closed map still retains CPU buffers");
    return compact(state);
}
const compact = s => ({ sourceBytes: s.sourceTextureRgba8Bytes, rtBytes: s.rtBytesWithDepth,
    cpuBytes: s.cpu.retainedArrayBufferBytes, legacyBytes: s.cpu.legacyArrayBufferBytes,
    bufferAssetBytes: s.cpu.loadedBufferAssetBytes, maps: s.cpu.maps, mapNodes: s.mapNodes });
async function ready(runner) {
    return until(async () => {
        const maps = await diagnose(runner);
        if (maps.length !== 1 || maps[0].closed) return null;
        const required = Object.values(maps[0].groups).filter(s => s.wanted);
        return required.every(s => s.state === "ready") ? maps[0] : null;
    }, "当前地图所有需求组 ready");
}
async function zoom(runner, lod, delta) {
    for (let i = 0; i < 64; i++) {
        const walk = await runner.walk(), got = readMapOriginalEvidence(walk);
        if (got?.lod === lod) return got;
        await mapOriginalWheel(runner, mapOriginalGestureArea(walk), delta, 1);
    }
    throw new Error(`Cannot reach LOD ${lod}`);
}

export async function replayMapOriginalLifecycle(runner) {
    const far = await runner.step("O3：L3 停留超过 5 秒，只保留概览和独立点选数据", async () => {
        await zoom(runner, 3, 240);
        await sleep(5600);
        const state = await snapshot(runner), map = state.cpu.maps.find(m => !m.closed);
        if (!map || map.groups.geography.state !== "idle" || map.groups.resources.state !== "idle"
            || map.groups.cities.state !== "idle" || map.groups.water.state !== "idle" || map.groups.grid.state !== "idle"
            || map.groups.choose.state !== "idle" || state.rtBytesWithDepth !== 0) throw new Error("L3 still retains near sources");
        const source = state.textures.filter(t => t.valid);
        if (source.length !== 2 || source.some(t => !/\/(overview|minimap)-[0-9a-f]{16}\/texture$/.test(t.path))) throw new Error("L3 still retains near textures");
        if (state.cpu.legacyArrayBufferBytes !== 0) throw new Error("Runtime populated legacy singleton reader");
        for (const [name, usage] of Object.entries(map.data)) if (name !== "terrain") {
            if (Object.values(usage).some(v => v !== 0)) throw new Error(`L3 retains ${name} data`);
        }
        const walk = await runner.walk();
        if (walk.nodes.some(n => n.name === "mapo-cache-camera")) throw new Error("Idle baker still attached");
        return { ...compact(state), shot: await runner.shot("maporiginal-o3-l3-released") };
    });
    const rapid = await runner.step("O3：远近档往返与跨雪地/沙地平移后补块恢复", async () => {
        for (let i = 0; i < 2; i++) { await zoom(runner, 0, -240); await zoom(runner, 3, 240); }
        await zoom(runner, 0, -240); await ready(runner);
        const pans = [];
        for (const target of [...MAPO_BASELINE_BIOMES, ...MAPO_BASELINE_BIOMES]) {
            const walk = await runner.walk(), mini = walk.nodes.find(n => n.name === "mapo-minimap")?.center;
            if (!mini) throw new Error("Missing minimap");
            const scale = walk.canvas.width / walk.visible.width;
            await runner.client.click(mini.x + (target.u - .5) * 180 * scale, mini.y + (target.v - .5) * 180 * scale);
            await sleep(250);
            const got = readMapOriginalEvidence(await runner.walk());
            if (!got?.nearLoaded || !(got.blockCount > 0)) throw new Error("Cross-biome source layers did not recover");
            pans.push({ biome: target.name, blocks: got.blockCount, decor: got.decorPlaced });
        }
        await zoom(runner, 1, 240);
        await runner.waitFor("L1 补块完成", w => { const g = readMapOriginalEvidence(w); return g?.cacheTotal > 0 && g.cacheReady === g.cacheTotal ? g : null; });
        await zoom(runner, 0, -240); await ready(runner);
        return { pans, ...compact(await snapshot(runner)) };
    });
    const smooth = await runner.step("O3：流畅画质宽限结束释放资源图集与水流贴图", async () => {
        await runner.tapText("流畅", { pathIncludes: "MapOriginalWorldView/" }); await sleep(5600);
        const state = await snapshot(runner), map = state.cpu.maps.find(m => !m.closed);
        if (!map || map.groups.resources.state !== "idle" || map.groups.water.state !== "idle") throw new Error("Smooth quality retained resources/water group");
        if (state.textures.some(t => t.valid && /\/(decor-atlas|river-mask|river-normal)-[0-9a-f]{16}\/texture$/.test(t.path))) throw new Error("Smooth quality retained unused textures");
        await runner.tapText("普通", { pathIncludes: "MapOriginalWorldView/" }); await ready(runner);
        await runner.waitFor("恢复完整近景", w => readMapOriginalEvidence(w)?.decor);
        return compact(state);
    });
    const cycles = [];
    for (let i = 0; i < 10; i++) cycles.push(await runner.step(`O3：真实引擎关闭/重开 ${i + 1}/10`, async () => {
        const released = await closed(runner);
        await runner.tapSettingsEntry("originalWorld"); await ready(runner);
        await runner.waitFor("重开后完整近景", w => { const g = readMapOriginalEvidence(w); return g?.nearLoaded && g.decor ? g : null; });
        const state = await snapshot(runner);
        if (state.cpu.legacyArrayBufferBytes !== 0) throw new Error("Reopen leaked into module singleton");
        return { released, reopened: compact(state) };
    }));
    const cancelled = await runner.step("O3：真实加载回调延迟时关页，迟到结果归还且不复活地图", async () => {
        await closed(runner);
        // 故障注入延迟真实引擎交付；不伪造资源、不替换 AssetLease。
        await runner.client.evaluate(`(() => {
            const prototype = Object.getPrototypeOf(cc.resources), original = prototype.load, queue = [];
            const wrapped = function(...args) {
                const index = args.length - 1, callback = args[index];
                if (typeof args[0] === "string" && this.name === "kit-mapOriginal-s1" && args[0] !== "2d/manifest" && typeof callback === "function") {
                    args[index] = function(...result) { queue.push(() => callback.apply(this, result)); };
                }
                return original.apply(this, args);
            };
            prototype.load = wrapped;
            globalThis.__mapoDelayedLoads = { queue, restore() { if (prototype.load === wrapped) prototype.load = original; } };
        })()`);
        try {
            await runner.tapSettingsEntry("originalWorld");
            await until(async () => (await diagnose(runner)).some(m => Object.values(m.groups).some(s => s.state === "loading")), "确有在途租约");
            await until(() => runner.client.evaluate("globalThis.__mapoDelayedLoads.queue.length >= 3"), "真实概览加载完成并延迟交付");
            await close(runner);
            const lateCount = await runner.client.evaluate(`(() => {
                const probe = globalThis.__mapoDelayedLoads; probe.restore();
                const callbacks = probe.queue.splice(0); callbacks.forEach(f => f()); return callbacks.length;
            })()`);
            const released = await closed(runner);
            return { lateCount, released };
        } finally {
            await runner.client.evaluate(`(() => { const p = globalThis.__mapoDelayedLoads; p?.restore(); p?.queue.splice(0).forEach(f => f()); delete globalThis.__mapoDelayedLoads; })()`);
        }
    });
    await runner.tapSettingsEntry("originalWorld"); await ready(runner);
    await runner.waitFor("验收后恢复竖版近景", w => readMapOriginalEvidence(w)?.nearLoaded);
    return { far, rapid, smooth, cycles, cancelled, shot: await runner.shot("maporiginal-o3-restored") };
}
