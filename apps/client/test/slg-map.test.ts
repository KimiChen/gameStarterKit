import assert from "node:assert/strict";
import { test } from "node:test";
import { MapCamera, mapLod } from "../src/kits/slg/logic/mapCamera";
import { MapStreamer } from "../src/kits/slg/logic/mapStreamer";
import { visibleMapLayers } from "../src/kits/slg/logic/mapLayers";
import { SlgMapLogic, SLG_MAP_READ_INTERVAL_MS } from "../src/kits/slg/logic/SlgMapLogic";
import type { SlgRuntime } from "../src/kits/slg/logic/slgRuntime";
import { chunkKey, gridFromTileId, SLG_CHUNK_SIZE, SLG_MAP_W, SLG_MAP_H, tileIdFromGrid, type ISlgTile } from "../src/shared/kits/slg/api/worldmap/index";
import type { ISlgMapTilesRes } from "../src/shared/protocol/lobbyRpc/domains/slg";

function near(a: number, b: number): void { assert.ok(Math.abs(a - b) < 0.000001, `${a} != ${b}`); }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

test("SLG camera: anchored zoom, moving pinch center, four LODs and bounds", () => {
    const camera = new MapCamera(750, 1100);
    const anchor = camera.worldAt(180, -220);
    camera.zoom(1.7, 180, -220);
    near(camera.worldAt(180, -220).x, anchor.x);
    near(camera.worldAt(180, -220).y, anchor.y);
    camera.start(1, -100, 0, 0); camera.start(2, 100, 0, 0);
    const middle = camera.worldAt(0, 0);
    camera.move(2, 140, 40, 16);
    near(camera.worldAt(20, 20).x, middle.x);
    near(camera.worldAt(20, 20).y, middle.y);
    assert.equal(camera.end(1, 20), null, "pinch never becomes an accidental tile tap");
    assert.equal(camera.end(2, 20), null);
    assert.deepEqual([0.12, 0.28, 0.5, 0.85].map(mapLod), [3, 2, 1, 0]);
    assert.deepEqual(visibleMapLayers(3), ["terrain", "ownership", "landmarks"]);
    assert.ok(visibleMapLayers(0).includes("grid"));
    camera.pan(1000000, -1000000);
    const rect = camera.visibleRect();
    assert.equal(rect.minX, 0); assert.equal(rect.maxY, SLG_MAP_H - 1);
    const version = camera.version;
    camera.zoom(NaN); camera.pan(Infinity, 1);
    assert.equal(camera.version, version);
});

test("SLG camera: taps, dragging inertia and cancellation/background stop", () => {
    const camera = new MapCamera(750, 1100);
    camera.start(1, 0, 0, 0);
    assert.deepEqual(camera.end(1, 1), { x: SLG_MAP_W / 2, y: SLG_MAP_H / 2 });
    camera.start(2, 0, 0, 10); camera.move(2, 80, 0, 26);
    assert.equal(camera.end(2, 27), null);
    const x = camera.x; camera.step(0.016); assert.ok(camera.x < x);
    camera.cancel(); const stopped = camera.x; camera.step(0.1); assert.equal(camera.x, stopped);
    camera.start(3, 0, 0, 100); camera.cancel();
    assert.equal(camera.end(3, 101), null);
    assert.equal(camera.pointerCount, 0);
});

test("SLG overview locate: preserves zoom, stops active inertia and discards both old touch pointers", () => {
    const camera = new MapCamera(750, 1100);
    camera.zoom(0.72);
    const scale = camera.scale;
    camera.start(1, 0, 0, 10); camera.move(1, 100, 30, 26); camera.end(1, 27);
    const draggingX = camera.x;
    camera.step(0.016);
    assert.ok(camera.x < draggingX, "fixture must have active inertia before the jump");
    camera.locate(8421.5, 2143.25);
    const locatedVersion = camera.version;
    assert.equal(camera.scale, scale);
    for (let step = 0; step < 10; step++) camera.step(0.05);
    near(camera.x, 8421.5); near(camera.y, 2143.25);
    assert.equal(camera.version, locatedVersion, "old inertia cannot drift away from the overview destination");

    camera.start(2, -40, 0, 100); camera.start(3, 40, 0, 100);
    camera.move(3, 80, 20, 116);
    const pinchedScale = camera.scale;
    assert.equal(camera.pointerCount, 2);
    camera.locate(1234, 8765);
    const jumpedVersion = camera.version;
    assert.equal(camera.scale, pinchedScale, "an overview jump retains the user's latest pinch zoom");
    assert.equal(camera.pointerCount, 0);
    camera.move(2, 200, 200, 132); camera.move(3, 400, 400, 133);
    assert.equal(camera.end(2, 134), null, "old touch release cannot become a tile selection");
    assert.equal(camera.end(3, 135), null);
    camera.step(0.05);
    near(camera.x, 1234); near(camera.y, 8765);
    assert.equal(camera.version, jumpedVersion);
});

test("SLG overview locate: rejects nonfinite input and keeps the entire viewport within both world edges", () => {
    const camera = new MapCamera(750, 1100);
    camera.zoom(0.001);
    const scale = camera.scale;
    camera.start(1, 0, 0, 0);
    const before = { x: camera.x, y: camera.y, version: camera.version };
    for (const [x, y] of [[NaN, 100], [100, NaN], [Infinity, 100], [100, -Infinity]]) camera.locate(x, y);
    assert.deepEqual({ x: camera.x, y: camera.y, version: camera.version }, before);
    assert.equal(camera.pointerCount, 1, "invalid coordinates do not interrupt the current valid gesture");

    const halfWidth = camera.width / camera.pixelsPerGrid / 2;
    const halfHeight = camera.height / camera.pixelsPerGrid / 2;
    camera.locate(-1000000, SLG_MAP_H + 1000000);
    near(camera.x, halfWidth); near(camera.y, SLG_MAP_H - halfHeight);
    assert.equal(camera.visibleRect().minX, 0); assert.equal(camera.visibleRect().maxY, SLG_MAP_H - 1);
    assert.equal(camera.pointerCount, 0);
    camera.locate(SLG_MAP_W + 1000000, -1000000);
    near(camera.x, SLG_MAP_W - halfWidth); near(camera.y, halfHeight);
    assert.equal(camera.visibleRect().maxX, SLG_MAP_W - 1); assert.equal(camera.visibleRect().minY, 0);
    assert.equal(camera.scale, scale);
});

test("SLG streamer: ring order, unchanged camera no-op, stale loads discarded and retention", () => {
    const streamer = new MapStreamer();
    const delta = streamer.update({ minX: 32, minY: 32, maxX: 63, maxY: 63 });
    assert.equal(delta.added.length, 16);
    const first = streamer.take(); assert.ok(first);
    const point = gridFromTileId(first.key);
    assert.ok(point.x === 2 || point.x === 3); assert.ok(point.y === 2 || point.y === 3);
    assert.deepEqual(streamer.update({ minX: 32, minY: 32, maxX: 63, maxY: 63 }), { added: [], removed: [] });
    assert.equal(streamer.accept(first), true);
    const old = streamer.take(); assert.ok(old);
    streamer.update({ minX: 48, minY: 32, maxX: 79, maxY: 63 });
    assert.ok(streamer.loadedKeys().includes(first.key), "nearby chunks remain within hysteresis band");
    assert.equal(streamer.accept(old), false);
    const moved = streamer.update({ minX: SLG_MAP_W - 25, minY: SLG_MAP_H - 25, maxX: SLG_MAP_W - 1, maxY: SLG_MAP_H - 1 });
    assert.ok(moved.removed.includes(first.key));
    for (;;) {
        const load = streamer.take(); if (!load) break;
        assert.ok(load.x < Math.ceil(SLG_MAP_W / SLG_CHUNK_SIZE) && load.y < Math.ceil(SLG_MAP_H / SLG_CHUNK_SIZE));
        assert.equal(streamer.accept(load), true);
    }
    assert.ok(streamer.loadedKeys().length <= 9);
    streamer.reset(); assert.deepEqual(streamer.loadedKeys(), []);
});

function runtimeWithTiles(initial: readonly ISlgTile[] = []) {
    const tiles = new Map(initial.map((tile) => [tile.tileId, tile]));
    let captures = 0;
    let revision = 0;
    let trophies = 0;
    let now = 1000;
    const tickers = new Set<(dt: number) => void>();
    const runtime: SlgRuntime = {
        selfUid: () => "me", now: () => now, tick: (callback) => { tickers.add(callback); return () => { tickers.delete(callback); }; }, close: () => {},
        mapTiles: async (rect) => ({ revision, myTrophies: trophies, tiles: [...tiles.values()].filter((tile) => {
            const point = gridFromTileId(tile.tileId);
            const x = Math.floor(point.x / SLG_CHUNK_SIZE), y = Math.floor(point.y / SLG_CHUNK_SIZE);
            return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
        }) }),
        capture: async (tileId) => {
            captures += 1; revision += 1; trophies += 1;
            const tile = { tileId, ownerUid: "me", guardPower: 1 };
            tiles.set(tileId, tile); return { tile, outcome: "captured" };
        },
    };
    return { runtime, tiles, captures: () => captures, tickers,
        advance(ms = SLG_MAP_READ_INTERVAL_MS) { now += ms; for (const tick of tickers) tick(ms / 1000); } };
}

/** These API fixtures live near (100,100), independent of the configured world's full extent. */
function fixtureLogic(runtime: SlgRuntime): SlgMapLogic {
    const logic = new SlgMapLogic(runtime, 750, 1100);
    logic.camera.pan((logic.camera.x - 100) * logic.camera.pixelsPerGrid, (logic.camera.y - 100) * logic.camera.pixelsPerGrid);
    return logic;
}

test("SLG map: sparse baseline, selected ownership, one write while busy, authoritative reread", async () => {
    const id = tileIdFromGrid(100, 100);
    const otherId = tileIdFromGrid(101, 100);
    const fake = runtimeWithTiles([{ tileId: otherId, ownerUid: "enemy", guardPower: 9 }]);
    const logic = fixtureLogic(fake.runtime);
    logic.select(100, 100); assert.equal(logic.canCapture(), false);
    logic.updateViewport(); await flush();
    assert.equal(logic.selectedTile()?.ownerUid, ""); assert.equal(logic.canCapture(), true);
    assert.equal(logic.actionText(), "免费占领");
    logic.select(101, 100); assert.equal(logic.actionText(), "免费攻击"); assert.equal(logic.canCapture(), true);
    logic.select(100, 100);
    const write = logic.capture();
    assert.equal(logic.busy, true); assert.equal(await logic.capture(), false);
    assert.equal(await write, true); fake.advance(); await flush();
    assert.equal(fake.captures(), 1); assert.equal(logic.tiles.get(id)?.ownerUid, "me");
    assert.equal(logic.actionText(), "免费加固"); assert.equal(logic.trophies, 1);
    logic.dispose(); assert.equal(logic.canCapture(), false);
});

test("SLG map: overview jumps and disposed views reject late query responses", async () => {
    const pending = deferred<ISlgMapTilesRes>();
    const fake = runtimeWithTiles();
    let reads = 0;
    fake.runtime.mapTiles = async () => {
        reads += 1;
        return reads === 1 ? pending.promise : { tiles: [], revision: 1, myTrophies: 0 };
    };
    const logic = fixtureLogic(fake.runtime);
    logic.updateViewport();
    logic.camera.locate(SLG_MAP_W - 100, SLG_MAP_H - 100); logic.updateViewport();
    pending.resolve({ tiles: [{ tileId: tileIdFromGrid(100, 100), ownerUid: "stale", guardPower: 1 }], revision: 0, myTrophies: 0 });
    await flush();
    assert.equal(logic.tiles.size, 0);
    assert.equal(logic.chunkVersions.has(chunkKey(6, 6)), false);
    const disposedRead = deferred<ISlgMapTilesRes>();
    fake.runtime.mapTiles = () => disposedRead.promise;
    fake.advance(); logic.refresh(); logic.dispose();
    disposedRead.resolve({ tiles: [{ tileId: tileIdFromGrid(199, 199), ownerUid: "stale", guardPower: 1 }], revision: 2, myTrophies: 4 });
    await flush(); assert.equal(logic.tiles.size, 0); assert.equal(logic.chunkVersions.size, 0);
});

test("SLG map: failed loads are not marked authoritative and explicit refresh recovers", async () => {
    const fake = runtimeWithTiles(); const read = fake.runtime.mapTiles;
    fake.runtime.mapTiles = async () => { throw { code: "CONN_LOST" }; };
    const logic = fixtureLogic(fake.runtime);
    logic.select(100, 100); logic.updateViewport(); await flush();
    assert.equal(logic.canCapture(), false); assert.match(logic.notice, /网络暂不可用/u);
    fake.runtime.mapTiles = read; logic.refresh(); fake.advance(); await flush();
    assert.equal(logic.canCapture(), true);
});

test("SLG map: a capture response after closing cannot revive the disposed page", async () => {
    const fake = runtimeWithTiles();
    const pending = deferred<Awaited<ReturnType<SlgRuntime["capture"]>>>();
    fake.runtime.capture = () => pending.promise;
    const logic = fixtureLogic(fake.runtime);
    logic.updateViewport(); await flush(); logic.select(100, 100);
    const write = logic.capture(); assert.equal(logic.busy, true);
    logic.dispose();
    pending.resolve({ tile: { tileId: tileIdFromGrid(100, 100), ownerUid: "me", guardPower: 1 }, outcome: "captured" });
    assert.equal(await write, false); assert.equal(logic.tiles.size, 0); assert.equal(logic.chunkVersions.size, 0);
});

test("SLG map: rapid zoom stays within five requests/sec and each request is at most four chunks", async () => {
    const fake = runtimeWithTiles();
    const starts: number[] = [];
    const read = fake.runtime.mapTiles;
    fake.runtime.mapTiles = (rect) => {
        starts.push(fake.runtime.now());
        assert.ok((rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1) <= 4);
        return read(rect);
    };
    const logic = fixtureLogic(fake.runtime);
    logic.updateViewport(); await flush();
    for (let i = 0; i < 25; i++) { logic.camera.zoom(0.92); logic.updateViewport(); await flush(); }
    assert.equal(starts.length, 1, "camera churn cannot bypass the clock budget");
    fake.advance(SLG_MAP_READ_INTERVAL_MS - 1); await flush(); assert.equal(starts.length, 1);
    fake.advance(1); await flush(); assert.equal(starts.length, 2);
    for (let i = 0; i < 8; i++) { fake.advance(); await flush(); }
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= SLG_MAP_READ_INTERVAL_MS);
    assert.ok(logic.chunkVersions.size > starts.length, "adjacent chunks are served in rectangular batches");
    logic.dispose(); assert.equal(fake.tickers.size, 0);
});

test("SLG map: RATE_LIMITED waits, exponentially backs off and recovers without a busy retry loop", async () => {
    const fake = runtimeWithTiles();
    const starts: number[] = [];
    fake.runtime.mapTiles = async () => {
        starts.push(fake.runtime.now());
        if (starts.length <= 2) throw { code: "RATE_LIMITED" };
        return { tiles: [], revision: 0, myTrophies: 0 };
    };
    const logic = fixtureLogic(fake.runtime);
    logic.updateViewport(); await flush(); assert.equal(starts.length, 1);
    for (let i = 0; i < 20; i++) logic.updateViewport();
    await flush(); assert.equal(starts.length, 1);
    fake.advance(999); await flush(); assert.equal(starts.length, 1);
    fake.advance(1); await flush(); assert.equal(starts.length, 2);
    fake.advance(1999); await flush(); assert.equal(starts.length, 2);
    fake.advance(1); await flush(); assert.equal(starts.length, 3);
    assert.ok(logic.chunkVersions.size > 0); assert.equal(logic.notice, "地图已恢复加载");
    logic.dispose();
});

test("SLG 10000-square map: far edge and widest viewport allocate only visible chunks", () => {
    assert.equal(SLG_MAP_W, 10000); assert.equal(SLG_MAP_H, 10000);
    const camera = new MapCamera(750, 1100);
    camera.zoom(0.001); camera.pan(-10000000, -10000000);
    const rect = camera.visibleRect();
    assert.equal(rect.maxX, 9999); assert.equal(rect.maxY, 9999);
    const streamer = new MapStreamer();
    const delta = streamer.update(rect);
    assert.ok(delta.added.length < 200, "one hundred million cells must not be materialized");
    let loaded = 0;
    for (;;) {
        const batch = streamer.takeBatch(); if (!batch.length) break;
        assert.ok(batch.length <= 4);
        for (const load of batch) { assert.ok(load.x <= 624 && load.y <= 624); streamer.accept(load); loaded += 1; }
    }
    assert.equal(loaded, delta.added.length);
});
