import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Asset } from "cc";
import { MapoDataStore, mapoContentKey } from "../src/kits/mapOriginal/logic/MapoDataStore";
import { MapoAssetGroups } from "../src/kits/mapOriginal/view/MapoAssetGroups";
import { AssetLease, type AssetLoadCallback, type AssetScheduler } from "../src/view/scene3d/AssetLease";
import { mapoStaticScene } from "../src/kits/mapOriginal/logic/mapoStaticScene";
import { mapoTerrainDataUsage } from "../src/kits/mapOriginal/logic/mapoTerrain";
import { mapoBandsDataUsage } from "../src/kits/mapOriginal/logic/mapoBands";

const bytes = (name: string) => readFileSync(new URL(`../../kits/mapOriginal/data/maps/s1/${name}`, import.meta.url));
const retained = (data: MapoDataStore) => Object.values(data.usage()).reduce((n, u) => n + u.arrayBufferBytes, 0);
function populate(data: MapoDataStore): void {
    data.terrain.mapoSetDisplayTerrain(bytes("terrain.bytes"));
    data.terrain.mapoPassClassAt(750, 749);
    data.bands.mapoBandAt(220, 80);
    data.regions.mapoSetRegions(bytes("regions.bin"));
    data.roads.mapoSetRoads(bytes("roads.bin"));
    data.cities.mapoSetCities(bytes("cities.bin"));
    data.rivers.mapoSetRiverGeo(bytes("river-geo.bin"));
    data.rivers.mapoSetRivers(bytes("rivers.bin"));
    for (const kind of ["snow", "desert"]) {
        data.blocks.mapoSetBlockGeo(kind, bytes(`${kind}-geo.bin`));
        data.blocks.mapoSetBlocks(kind, bytes(`${kind}.bin`));
    }
    for (const kind of ["snow", "desert", "river"]) data.tops.mapoSetTops(kind, bytes(`${kind}-tops.bin`));
}

test("mapOriginal O3：两个地图的数据独立，连续十次关闭清除全部 Buffer 和展开件", () => {
    const survivor = new MapoDataStore(); populate(survivor);
    for (let i = 0; i < 10; i++) {
        const data = new MapoDataStore(); populate(data);
        assert.ok(retained(data) > 7_000_000);
        assert.equal(data.terrain.mapoValueAt(750, 749), 26);
        assert.equal(data.bands.mapoBandAt(220, 80), 2);
        const geometry = mapoStaticScene({ left: -300, right: 300, bottom: -24200, top: -23800 }, true, true, 0, data);
        assert.ok(geometry.length > 5, "实例读取器确实参与完整场景展开");
        data.dispose(); data.dispose();
        assert.equal(retained(data), 0);
        for (const usage of Object.values(data.usage())) for (const value of Object.values(usage)) assert.equal(value, 0);
        assert.equal(survivor.terrain.mapoValueAt(750, 749), 26);
        assert.equal(survivor.cities.mapoCityPlacements().length, 249);
    }
    survivor.clearGeography();
    assert.ok(retained(survivor) > 4_000_000, "出档释放地貌不释放选中格的独立 terrain 持有");
    assert.equal(survivor.terrain.mapoValueAt(750, 749), 26);
    survivor.dispose();
    assert.equal(mapoTerrainDataUsage().arrayBufferBytes, 0, "运行时未触发兼容用全局读取器");
    assert.equal(mapoBandsDataUsage().arrayBufferBytes, 0);
});

test("mapOriginal O3：缓存地图身份同时绑定内容与图集布局版本", () => {
    const identity = { mapId: "s1", contentVersion: "1", atlasLayoutVersion: "1" };
    for (const key of ["mapId", "contentVersion", "atlasLayoutVersion"] as const) {
        assert.notEqual(mapoContentKey(identity), mapoContentKey({ ...identity, [key]: "2" }));
    }
});

class FakeAsset implements Asset {
    name = "mapo"; uuid = "mapo"; isValid = true; refCount = 0;
    addRef(): this { this.refCount++; return this; }
    decRef(): this { assert.ok(this.refCount > 0); this.refCount--; return this; }
    destroy(): boolean { this.isValid = false; return true; }
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function harness() {
    const pending: { path: string; callback: AssetLoadCallback<Asset> }[] = [];
    const retired: (() => void)[] = [], installed: string[] = [], cleared: string[] = [], errors: unknown[] = [];
    const timers = new Set<() => void>();
    const scheduler: AssetScheduler = { setTimeout: (cb) => { timers.add(cb); return cb; },
        clearTimeout: (handle) => { timers.delete(handle as () => void); } };
    const lease = new AssetLease({ addRef: (a) => a.addRef(), decRef: (a) => a.decRef(),
        load: (_bundle, path, _type, callback) => pending.push({ path, callback: callback as AssetLoadCallback<Asset> }),
    }, { scheduler });
    let invalid = false;
    const make = (name: string, dependencies: string[] = []) => ({ dependencies,
        requests: [{ bundle: "resources", path: name, type: FakeAsset }],
        install: () => { if (invalid && name === "geography") throw new Error("MAPO_DATA_INVALID resources:geography"); installed.push(name); },
        clear: () => { cleared.push(name); },
    });
    const groups = new MapoAssetGroups({ overview: make("overview"), geography: make("geography", ["overview"]), cities: make("cities", ["overview"]) },
        lease, (_name, release) => retired.push(release), () => {}, (_name, error) => errors.push(error), 5000);
    const complete = (path: string, error: unknown = null) => {
        const index = pending.findIndex((p) => p.path === path); assert.ok(index >= 0, `没有请求 ${path}`);
        const asset = new FakeAsset(); pending.splice(index, 1)[0]!.callback(error, error ? undefined : asset); return asset;
    };
    return { groups, pending, retired, installed, cleared, errors, timers, complete, setInvalid: () => { invalid = true; } };
}

test("mapOriginal O3：概览先交付、组独立完成，宽限重入复用，退休帧前不归还租约", async () => {
    const h = harness(); h.groups.update(["geography", "cities"], 0);
    assert.deepEqual(h.pending.map((p) => p.path), ["overview"]);
    const overview = h.complete("overview"); await flush();
    assert.ok(h.groups.ready("overview")); assert.deepEqual(h.installed, ["overview"]);
    const cities = h.complete("cities"); await flush(); assert.ok(h.groups.ready("cities"));
    const geography = h.complete("geography"); await flush();
    h.groups.update(["overview"], 10); h.groups.update(["geography", "cities"], 5000);
    assert.equal(h.pending.length, 0); assert.equal(h.retired.length, 0);
    h.groups.update(["overview"], 6000); h.groups.update(["overview"], 11000);
    assert.equal(h.groups.snapshot().geography!.state, "releasing");
    assert.equal(geography.refCount, 1); assert.equal(cities.refCount, 1);
    h.retired.splice(0).forEach((release) => release());
    assert.equal(geography.refCount, 0); assert.equal(cities.refCount, 0); assert.equal(overview.refCount, 1);
    h.groups.close(); h.groups.close(); h.retired.splice(0).forEach((release) => release());
    assert.equal(overview.refCount, 0);
});

test("mapOriginal O3：取消后重入与关闭时的迟到成功不能安装，也不能释放新代租约", async () => {
    const h = harness(); h.groups.update(["geography"], 0);
    const overview = h.complete("overview"); await flush();
    h.groups.update(["overview"], 1); h.groups.update(["geography"], 2);
    const old = h.complete("geography"); await flush();
    assert.equal(old.refCount, 0); assert.equal(h.groups.snapshot().geography!.state, "loading");
    h.groups.close();
    const late = h.complete("geography"); await flush();
    assert.equal(late.refCount, 0); assert.deepEqual(h.installed, ["overview"]);
    h.retired.splice(0).forEach((release) => release()); assert.equal(overview.refCount, 0);
});

test("mapOriginal O3：缺片、超时、解析失败保留地址，重试不接纳半成品", async () => {
    const h = harness(); h.groups.update(["geography"], 0);
    h.complete("overview", new Error("404")); await flush();
    assert.match(String(h.errors[0]), /ASSET_MISSING resources:overview/);
    h.groups.update(["geography"], 1000); h.complete("overview"); await flush();
    for (const timer of [...h.timers]) timer(); await flush();
    assert.match(String(h.errors[1]), /ASSET_TIMEOUT resources:geography/);
    assert.equal(h.complete("geography").refCount, 0);
    h.groups.update(["geography"], 2000); h.setInvalid();
    const broken = h.complete("geography"); await flush();
    assert.equal(broken.refCount, 0); assert.equal(h.groups.ready("geography"), false);
    assert.match(String(h.errors[2]), /MAPO_DATA_INVALID resources:geography/);
    assert.ok(h.cleared.includes("geography"));
    h.groups.close(); h.retired.splice(0).forEach((release) => release());
});
