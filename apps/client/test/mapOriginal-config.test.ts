import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { decorConfigBytes, topConfigBytes } from "../../../tools/maporiginal-assets/read_presentation";
import { mapoParseConfig, mapoReadDecorConfig, mapoReadTopConfig } from "../src/kits/mapOriginal/logic/mapoPresentation";
import { createMapoDecorData } from "../src/kits/mapOriginal/logic/mapoDecor";
import { createMapoTopsData } from "../src/kits/mapOriginal/logic/mapoTops";
import { mapoSceneSprites } from "../src/kits/mapOriginal/logic/mapoScene";

function canonical(v: unknown): unknown {
    if (!v || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(canonical);
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])]));
}
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");

test("mapOriginal O5：完整配置及 834 个固定时间样本保持迁移前结果", () => {
    const d = mapoReadDecorConfig(decorConfigBytes), t = mapoReadTopConfig(topConfigBytes);
    // ac272cee 的原 TS 导出值和原 scene 求值结果；先逐字段 deepEqual，再冻结指纹。
    assert.equal(hash(d), "9e046f1fd959cad2eb7589817ce85c1afeb1d220310dbe84afeb510cf13e7d53");
    assert.equal(hash(t), "7ae3e78b51f3d2d8a19f9f15720eb118dfecf17dea2d0e45ea43faa3e0f387f2");
    const times = [0, 0.125, 0.5, 1, 2, 10], place = { x: 16, y: -23984, row: 750, col: 749 };
    const frames = [];
    const cells = d.cells.map(c => ({ id: c.id, textureId: c.textureId, rect: d.textures[c.textureId].rect, window: d.textures[c.textureId] }));
    for (const variant of ["base", "snow", "desert"] as const) for (const c of d.variants[variant]) {
        for (const time of times) frames.push(mapoSceneSprites(c.scene, cells, d.size, time, place));
    }
    for (const a of t.atlases) for (const scene of Object.values(t.scenes[a.kind])) {
        const cells = a.cells.map(c => ({ id: c.id, rect: a.textures[c.textureId].rect, window: a.textures[c.textureId] }));
        for (const time of times) frames.push(mapoSceneSprites(scene, cells, a.size, time, place));
    }
    assert.equal(frames.length, 834);
    assert.equal(frames.reduce((n, frame) => n + frame.length, 0), 2011);
    assert.equal(hash(frames), "a6ccdbdced3dff5ebd7bdfce373edf0609781d7d051948011dcb651b75ddd038");
});

test("mapOriginal O5：截断、错版、非法 ID、UV 越界及动画 schema 变化明确拒绝", () => {
    const mutate = (edit: (v: any) => void) => { const value = JSON.parse(decorConfigBytes.toString()); edit(value); return Buffer.from(JSON.stringify(value)); };
    for (const change of [
        (v: any) => { v.schemaVersion = 2; },
        (v: any) => { v.mapId = "s2"; },
        (v: any) => { v.cells[0].id = 1; },
        (v: any) => { v.cells[0].textureId = "missing"; },
        (v: any) => { v.textures[v.cells[0].textureId].rect[0] = v.size[0]; },
        (v: any) => { v.textures[v.cells[0].textureId].trimRect[0] = 99999; },
        (v: any) => { v.variants.base[0].scene.texture = 99999; },
        (v: any) => { v.variants.base[0].scene.position = [1]; },
        (v: any) => { v.variants.base[0].scene.frames = [99999]; },
        (v: any) => { v.variants.base[0].scene.tracks = [{ type: 99, keys: [] }]; },
        (v: any) => { v.variants.base[0].scene.tracks = [{ type: 0, keys: [{ time: 0, value: 2, tween: true }] }]; },
        (v: any) => { v.variants.base[0].scene.tracks = [{ type: 5, keys: [{ time: 0, value: 0, tween: true }] }]; },
        (v: any) => { v.variants.base[0].scene.unknown = 1; },
        (v: any) => { v.variants.snow.pop(); },
    ]) assert.throws(() => mapoReadDecorConfig(mutate(change)), /MAPO_CONFIG_INVALID/);
    for (const [bytes, read] of [[decorConfigBytes, mapoReadDecorConfig], [topConfigBytes, mapoReadTopConfig]] as const) {
        assert.throws(() => read(bytes.subarray(0, bytes.length - 1)), /MAPO_CONFIG_INVALID/);
        assert.throws(() => read(Buffer.concat([bytes, Buffer.from("x")])), /MAPO_CONFIG_INVALID/);
    }
    const tops = JSON.parse(topConfigBytes.toString()); tops.scenes.river[99999] = tops.scenes.river[Object.keys(tops.scenes.river)[0]] ?? {};
    assert.throws(() => mapoReadTopConfig(Buffer.from(JSON.stringify(tops))), /MAPO_CONFIG_INVALID/);
});

test("mapOriginal O5：UTF-8 非 ASCII / 代理对等价，畸形编码拒绝", () => {
    const sample = { text: "地图 / 森林 / 🏔️ / %80 / 100% / %e2%82%ac", zero: 0 };
    assert.deepEqual(mapoParseConfig(Buffer.from(JSON.stringify(sample))), sample);
    for (const bytes of [[0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2], [0xe2, 0x20, 0x80]]) {
        assert.throws(() => mapoParseConfig(Uint8Array.from(bytes)), /MAPO_CONFIG_INVALID utf8/);
    }
});

test("mapOriginal O5：未就绪不借全局配置，失败注入不污染实例，释放后能重新加载", () => {
    const decor = createMapoDecorData(), tops = createMapoTopsData();
    assert.equal(decor.mapoDecorAt(750, 749, 26, true), null);
    assert.deepEqual(tops.mapoTopsFor("river", [], Infinity), []);
    decor.mapoSetDecorConfig(decorConfigBytes); tops.mapoSetTopConfig(topConfigBytes);
    const previous = decor.config;
    assert.ok(decor.mapoDecorAt(750, 749, 26, true));
    assert.throws(() => decor.mapoSetDecorConfig(decorConfigBytes.subarray(1)), /MAPO_CONFIG_INVALID/);
    assert.equal(decor.config, previous);
    decor.dispose(); tops.dispose();
    for (const usage of [decor.mapoDecorDataUsage(), tops.mapoTopsDataUsage()]) assert.ok(Object.values(usage).every(v => v === 0));
    decor.mapoSetDecorConfig(decorConfigBytes); tops.mapoSetTopConfig(topConfigBytes);
    assert.ok(decor.mapoDecorAt(750, 749, 26, true));
    assert.equal(tops.mapoTopsDataUsage().atlases, 3);
    decor.dispose(); tops.dispose();
});
